// src/store/userland/sync/sync-status.ts
//
// Sync status store: tracks current sync status and emits transition events
// for notable state changes (not routine syncing→synced).
//
// Status lifecycle:
//   "offline"  — no connection / fetch failed
//   "syncing"  — syncOnce in flight
//   "synced"   — last pass completed successfully
//   "error"    — last pass failed (will retry)
//
// Transition events (emitted ONLY on these transitions):
//   "went-offline"        — any → "offline"
//   "reconnected-synced"  — "offline" → "synced" (only after an offline stretch)
//   "persistent-error"    — N≥2 consecutive failures (cumulative since last success)
//   "first-sync-complete" — "syncing" → "synced" on the very first sync for this uid
//                           (persisted flag so it fires once per uid across sessions)
//
// NOT emitted: routine syncing→synced, transient single failures.

import { createStore, get, set } from "idb-keyval";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SyncStatus =
	| "offline"
	| "syncing"
	| "synced"
	| "error"
	| "needs_upgrade"; // a cloud write was RLS-rejected (free/lapsed) → show upgrade CTA

export type SyncTransitionEvent =
	| "went-offline"
	| "reconnected-synced"
	| "persistent-error"
	| "first-sync-complete";

export type SyncTransitionListener = (event: SyncTransitionEvent) => void;

/** Minimum consecutive failures before "persistent-error" fires. */
const PERSISTENT_ERROR_THRESHOLD = 2;

// ---------------------------------------------------------------------------
// Per-uid persisted flag helpers
// ---------------------------------------------------------------------------

function flagStore(uid: string) {
	return createStore(`ptcg-cache-${uid}-meta`, "meta");
}

const FIRST_SYNC_FLAG_KEY = "firstSyncComplete";

async function hasFirstSyncFlag(uid: string): Promise<boolean> {
	const val = await get<boolean>(FIRST_SYNC_FLAG_KEY, flagStore(uid));
	return val === true;
}

async function setFirstSyncFlag(uid: string): Promise<void> {
	await set(FIRST_SYNC_FLAG_KEY, true, flagStore(uid));
}

// ---------------------------------------------------------------------------
// SyncStatusStore — one instance per uid
// ---------------------------------------------------------------------------

export interface SyncStatusStore {
	/** Current sync status. */
	readonly status: SyncStatus;

	/** Call before starting a syncOnce pass. */
	onSyncStart(): void;

	/** Call when a syncOnce pass succeeds. */
	onSyncSuccess(uid: string): Promise<void>;

	/** Call when a syncOnce pass fails (network error / fetch failure). */
	onSyncError(offline: boolean): void;

	/** Call when a pass failed because a cloud WRITE was entitlement-rejected
	 *  (EntitlementError / 42501). Not a retryable error — drives an upgrade CTA. */
	onEntitlementBlocked(): void;

	/** Subscribe to transition events. Returns an unsubscribe function. */
	subscribe(listener: SyncTransitionListener): () => void;
}

/**
 * Create a status store for `uid`.
 * The store is lightweight (no Zustand dependency) — a plain event-emitter
 * pattern with mutable closed-over state. Suitable for direct use in the
 * sync engine and in tests.
 */
export function createSyncStatusStore(): SyncStatusStore {
	let status: SyncStatus = "synced";
	let prevStatus: SyncStatus = "synced";
	let consecutiveFailures = 0;
	let wasOffline = false;
	// Whether persistent-error has been emitted for the current failure run
	let persistentErrorEmitted = false;
	const listeners = new Set<SyncTransitionListener>();

	function emit(event: SyncTransitionEvent): void {
		for (const l of listeners) l(event);
	}

	function setStatus(next: SyncStatus): void {
		prevStatus = status;
		status = next;
	}

	return {
		get status() {
			return status;
		},

		onSyncStart() {
			setStatus("syncing");
			// "syncing" is a transient state — no events on entry
		},

		onEntitlementBlocked() {
			// Distinct from "error": a deterministic policy block, not a transient
			// failure. No retry counter, no event — the UI shows a persistent upgrade
			// CTA; dirty rows stay queued and push once the user is entitled.
			setStatus("needs_upgrade");
		},

		async onSyncSuccess(uid: string) {
			const comingFromOffline =
				wasOffline || prevStatus === "offline" || status === "offline";
			setStatus("synced");
			consecutiveFailures = 0;
			persistentErrorEmitted = false;

			if (comingFromOffline) {
				wasOffline = false;
				emit("reconnected-synced");
			}

			// first-sync-complete: check persisted flag
			const alreadyFired = await hasFirstSyncFlag(uid);
			if (!alreadyFired) {
				await setFirstSyncFlag(uid);
				emit("first-sync-complete");
			}
		},

		onSyncError(offline: boolean) {
			if (offline) {
				const alreadyInOfflineStretch = wasOffline;
				setStatus("offline");
				wasOffline = true;
				if (!alreadyInOfflineStretch) {
					emit("went-offline");
				}
			} else {
				setStatus("error");
				consecutiveFailures++;
				if (
					consecutiveFailures >= PERSISTENT_ERROR_THRESHOLD &&
					!persistentErrorEmitted
				) {
					persistentErrorEmitted = true;
					emit("persistent-error");
				}
			}
		},

		subscribe(listener: SyncTransitionListener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};
}
