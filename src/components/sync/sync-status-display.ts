// src/components/sync/sync-status-display.ts
//
// Single source of truth for how a sync status is *presented* (label + dot
// styling) plus a small reactive hook over the status singleton. Shared by the
// sidebar user-menu's status line and avatar badge so both stay in step.
//
// Kept in a non-component module (no JSX) on purpose: exporting the map + hook
// from `sync-indicator.tsx` would trip `react-refresh/only-export-components`.

"use client";

import { useEffect, useState } from "react";
import type { SyncStatus } from "@/store/userland/sync/sync-status";
import { syncStatus } from "@/store/userland/sync/sync-status-singleton";

/** Presentation data for a single sync status. */
export interface SyncStatusDisplay {
	label: string;
	/** Tailwind classes for the status dot fill (+ optional animation). */
	dotClass: string;
}

/** Status → label + dot styling. */
export const SYNC_STATUS_DISPLAY: Record<SyncStatus, SyncStatusDisplay> = {
	synced: {
		label: "Synced",
		dotClass: "bg-[var(--success)]",
	},
	syncing: {
		label: "Syncing…",
		dotClass: "bg-[var(--primary)] animate-pulse",
	},
	offline: {
		label: "Offline",
		dotClass: "bg-[var(--ink-muted)]",
	},
	error: {
		label: "Sync error",
		dotClass: "bg-amber-400",
	},
	needs_upgrade: {
		label: "Upgrade to sync",
		dotClass: "bg-[var(--primary)]",
	},
};

/**
 * Stand-in shown when the user is signed out: the Vault works, but lives only on
 * this device. A *hollow* dot reads as "not connected", distinct from the filled
 * active/offline states — a gentle nudge toward signing in to sync.
 */
export const LOCAL_ONLY_DISPLAY: SyncStatusDisplay = {
	label: "Local only",
	dotClass: "border border-[var(--ink-muted)] bg-transparent",
};

/**
 * Current sync status, reactive to the singleton's transitions. We also re-read
 * the getter on every notification because some changes (e.g. syncing → synced)
 * don't emit a *transition* event but do flip the status. Pass `override` in
 * tests to bypass the singleton subscription entirely.
 */
export function useSyncStatus(override?: SyncStatus): SyncStatus {
	const [status, setStatus] = useState<SyncStatus>(
		override ?? syncStatus.status,
	);

	useEffect(() => {
		if (override !== undefined) {
			setStatus(override);
			return;
		}
		// Re-sync in case the status changed between render and this effect.
		setStatus(syncStatus.status);
		return syncStatus.subscribe(() => setStatus(syncStatus.status));
	}, [override]);

	return status;
}

/**
 * Display data for the account status line: the live sync status when signed in,
 * otherwise the local-only placeholder. Subscribes to the sync singleton either
 * way (cheap) so the line goes live the instant a session appears.
 */
export function useAccountStatusDisplay(signedIn: boolean): SyncStatusDisplay {
	const status = useSyncStatus();
	return signedIn ? SYNC_STATUS_DISPLAY[status] : LOCAL_ONLY_DISPLAY;
}
