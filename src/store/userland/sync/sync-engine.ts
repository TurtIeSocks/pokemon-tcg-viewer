// src/store/userland/sync/sync-engine.ts
//
// Pull→reconcile→push cycle + triggers + watermark persistence.
// The engine is a thin I/O shell around the pure reconciler.
//
// syncOnce(uid, remote, client):
//   1. Pull each table for updated_at > lastSyncedAt (paginated, incl tombstones)
//   2. Reconcile per entity (cache allRows + pulled + dirtyIds) → write merged back
//   3. Push toPush via remote upsert (never hard-delete; tombstones = deletedAt set)
//   4. clearDirty for pushed ids (conditional — only ids unchanged since snapshot)
//   5. Advance watermark to max server updated_at across pulled + push-returned rows
//
// startSync / stopSync: register / unregister event-driven triggers.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createStore, get, set, setMany } from "idb-keyval";
import {
	type BinderRow,
	binderToRow,
	type ProfileRow,
	profileToRow,
	rowToBinder,
	rowToProfile,
	rowToStack,
	type StackRow,
	stackToRow,
} from "../supabase-row";
import type { Binder, Profile, Stack } from "../types";
import { allRows, clearDirty, dirtyIds } from "./cache-repo";
import {
	reconcileBinders,
	reconcileProfiles,
	reconcileStacks,
} from "./reconcile";

// ---------------------------------------------------------------------------
// Watermark persistence helpers
// ---------------------------------------------------------------------------

const PAGE_SIZE = 1000;

function watermarkKey(): string {
	return "lastSyncedAt";
}

function metaStore(uid: string) {
	return createStore(`ptcg-cache-${uid}-meta`, "meta");
}

export async function getWatermark(uid: string): Promise<string> {
	const stored = await get<string>(watermarkKey(), metaStore(uid));
	// epoch 0 = pull everything on first sync
	return stored ?? new Date(0).toISOString();
}

export async function setWatermark(uid: string, iso: string): Promise<void> {
	await set(watermarkKey(), iso, metaStore(uid));
}

/** Return the max ISO timestamp across a list (never go backwards). */
function maxIso(current: string, candidates: string[]): string {
	let best = current;
	for (const c of candidates) {
		if (c > best) best = c;
	}
	return best;
}

// ---------------------------------------------------------------------------
// Paginated pull helpers
// ---------------------------------------------------------------------------

async function pullTable<Row>(
	client: SupabaseClient,
	table: string,
	watermark: string,
): Promise<Row[]> {
	const rows: Row[] = [];
	let from = 0;
	while (true) {
		const to = from + PAGE_SIZE - 1;
		const { data, error } = await client
			.from(table)
			.select("*")
			.gt("updated_at", watermark)
			.range(from, to);
		if (error)
			throw new Error(`syncOnce: pull ${table} failed: ${error.message}`);
		const batch = (data ?? []) as Row[];
		rows.push(...batch);
		if (batch.length < PAGE_SIZE) break;
		from += PAGE_SIZE;
	}
	return rows;
}

// ---------------------------------------------------------------------------
// Push helpers
// ---------------------------------------------------------------------------

/**
 * Thrown when a cloud WRITE is rejected by the entitlement RLS (SQLSTATE 42501) —
 * a free/lapsed user can't push net-new state. NOT a transient error: the caller
 * surfaces an upgrade prompt instead of "sync failed", and (critically) the dirty
 * rows are NEVER cleared — they push automatically once the user is entitled.
 */
export class EntitlementError extends Error {
	readonly kind = "needs_upgrade" as const;
	constructor(message = "cloud write requires an active plan") {
		super(message);
		this.name = "EntitlementError";
	}
}

async function pushRows<Row extends object>(
	client: SupabaseClient,
	table: string,
	rows: Row[],
): Promise<Row[]> {
	if (rows.length === 0) return [];
	const { data, error } = await client.from(table).upsert(rows).select();
	if (error) {
		// 42501 = RLS with-check rejection = no entitlement to write new state.
		// Throw before clearDirty so the rows stay dirty and retry once entitled.
		if (error.code === "42501") throw new EntitlementError(error.message);
		throw new Error(`syncOnce: push ${table} failed: ${error.message}`);
	}
	return (data ?? []) as Row[];
}

// ---------------------------------------------------------------------------
// Write merged rows back into the per-uid cache IDB stores
// ---------------------------------------------------------------------------

function collectionStore(uid: string) {
	return createStore(`ptcg-cache-${uid}-items`, "items");
}

function bindersStore(uid: string) {
	return createStore(`ptcg-cache-${uid}-binders`, "binders");
}

function profileStore(uid: string) {
	return createStore(`ptcg-cache-${uid}-profile`, "profile");
}

async function writeMergedStacks(
	uid: string,
	merged: Map<string, Stack>,
): Promise<void> {
	const pairs: [string, Stack][] = [...merged.entries()];
	if (pairs.length > 0) await setMany(pairs, collectionStore(uid));
}

async function writeMergedBinders(
	uid: string,
	merged: Map<string, Binder>,
): Promise<void> {
	const pairs: [string, Binder][] = [...merged.entries()];
	if (pairs.length > 0) await setMany(pairs, bindersStore(uid));
}

async function writeMergedProfiles(
	uid: string,
	merged: Map<string, Profile>,
): Promise<void> {
	const pairs: [string, Profile][] = [...merged.entries()];
	if (pairs.length > 0) await setMany(pairs, profileStore(uid));
}

// ---------------------------------------------------------------------------
// syncOnce — the main sync pass
// ---------------------------------------------------------------------------

export interface SyncOnceResult {
	/** Number of rows pulled from cloud (all entities). */
	pulled: number;
	/** Number of rows pushed to cloud (all entities). */
	pushed: number;
}

/**
 * Execute one full pull→reconcile→push cycle for `uid`.
 *
 * @param uid    - The authenticated user's ID (used as cache namespace key).
 * @param client - An authenticated supabase-js client (for cloud pull+push).
 *
 * Treats network failures as transient — throws on error so the caller (status
 * store / trigger) can mark status=error and retry.
 */
export async function syncOnce(
	uid: string,
	client: SupabaseClient,
): Promise<SyncOnceResult> {
	const watermark = await getWatermark(uid);

	// ── 1. Pull ──────────────────────────────────────────────────────────────
	const [pulledStackRows, pulledBinderRows, pulledProfileRows] =
		await Promise.all([
			pullTable<StackRow>(client, "stacks", watermark),
			pullTable<BinderRow>(client, "binders", watermark),
			pullTable<ProfileRow>(client, "profiles", watermark),
		]);

	// Map rows → domain (incl. tombstones — deletedAt != null is fine)
	const pulledStacks = pulledStackRows.map(rowToStack);
	const pulledBinders = pulledBinderRows.map(rowToBinder);
	const pulledProfiles = pulledProfileRows.map(rowToProfile);

	// Track all server updated_at timestamps for watermark advancement
	const serverTimestamps: string[] = [
		...pulledStackRows.map((r) => r.updated_at),
		...pulledBinderRows.map((r) => r.updated_at),
		...pulledProfileRows.map((r) => r.updated_at),
	];

	// ── 2. Read cache + dirty sets (snapshot before reconcile) ──────────────
	const [
		cachedStacks,
		cachedBinders,
		cachedProfiles,
		dirtyStacks,
		dirtyBinders,
		dirtyProfileIds,
	] = await Promise.all([
		allRows(uid, "stacks"),
		allRows(uid, "binders"),
		allRows(uid, "profiles"),
		dirtyIds(uid, "stacks"),
		dirtyIds(uid, "binders"),
		dirtyIds(uid, "profiles"),
	]);

	const cacheStackMap = new Map(cachedStacks.map((s) => [s.id, s]));
	const cacheBinderMap = new Map(cachedBinders.map((b) => [b.id, b]));
	const cacheProfileMap = new Map(cachedProfiles.map((p) => [p.id, p]));

	// Snapshot the dirty sets (for conditional clearDirty after push)
	const dirtyStacksSnapshot = new Set(dirtyStacks);
	const dirtyBindersSnapshot = new Set(dirtyBinders);
	const dirtyProfilesSnapshot = new Set(dirtyProfileIds);

	// ── 3. Reconcile ────────────────────────────────────────────────────────
	const { merged: mergedStacks, toPush: stacksToPush } = reconcileStacks({
		cache: cacheStackMap,
		pulled: pulledStacks,
		dirtyIds: dirtyStacks,
	});
	const { merged: mergedBinders, toPush: bindersToPush } = reconcileBinders({
		cache: cacheBinderMap,
		pulled: pulledBinders,
		dirtyIds: dirtyBinders,
	});
	const { merged: mergedProfiles, toPush: profilesToPush } = reconcileProfiles({
		cache: cacheProfileMap,
		pulled: pulledProfiles,
		dirtyIds: dirtyProfileIds,
	});

	// ── 4. Write merged back to cache ────────────────────────────────────────
	await Promise.all([
		writeMergedStacks(uid, mergedStacks),
		writeMergedBinders(uid, mergedBinders),
		writeMergedProfiles(uid, mergedProfiles),
	]);

	// ── 5. Push toPush rows to cloud ─────────────────────────────────────────
	const [pushedStackRows, pushedBinderRows, pushedProfileRows] =
		await Promise.all([
			pushRows<StackRow>(client, "stacks", stacksToPush.map(stackToRow)),
			pushRows<BinderRow>(client, "binders", bindersToPush.map(binderToRow)),
			pushRows<ProfileRow>(
				client,
				"profiles",
				profilesToPush.map(profileToRow),
			),
		]);

	// Collect pushed server timestamps
	serverTimestamps.push(
		...pushedStackRows.map((r) => r.updated_at),
		...pushedBinderRows.map((r) => r.updated_at),
		...pushedProfileRows.map((r) => r.updated_at),
	);

	// ── 6. clearDirty (conditional) ──────────────────────────────────────────
	// Only clear ids that were in the snapshot AND were successfully pushed.
	// Any id re-dirtied mid-pass stays dirty → retried next pass.
	const pushedStackIds = stacksToPush
		.map((s) => s.id)
		.filter((id) => dirtyStacksSnapshot.has(id));
	const pushedBinderIds = bindersToPush
		.map((b) => b.id)
		.filter((id) => dirtyBindersSnapshot.has(id));
	const pushedProfileIds = profilesToPush
		.map((p) => p.id)
		.filter((id) => dirtyProfilesSnapshot.has(id));

	await Promise.all([
		clearDirty(uid, "stacks", pushedStackIds),
		clearDirty(uid, "binders", pushedBinderIds),
		clearDirty(uid, "profiles", pushedProfileIds),
	]);

	// ── 7. Advance watermark ─────────────────────────────────────────────────
	if (serverTimestamps.length > 0) {
		const newWatermark = maxIso(watermark, serverTimestamps);
		await setWatermark(uid, newWatermark);
	}

	return {
		pulled: pulledStacks.length + pulledBinders.length + pulledProfiles.length,
		pushed: stacksToPush.length + bindersToPush.length + profilesToPush.length,
	};
}

// ---------------------------------------------------------------------------
// Task 4: Triggers + startSync / stopSync
// ---------------------------------------------------------------------------

/** Minimum debounce delay (ms) before a post-write sync fires. */
const DEBOUNCE_MS = 1500;

interface SyncHandle {
	uid: string;
	client: SupabaseClient;
	onSyncStart?: () => void;
	onSyncComplete?: (result: SyncOnceResult) => void;
	onSyncError?: (err: unknown) => void;
}

type CleanupFn = () => void;

// Module-level registry so stopSync can remove the exact same listener refs.
const activeHandles = new Map<string, CleanupFn>();

/**
 * Register event-driven sync triggers for `uid`.
 * Fires `syncOnce` on:
 *   - window `online` (reconnect)
 *   - `visibilitychange` / `focus` (tab becomes visible / window gains focus)
 *   - debounced post-write trigger (call `notifyWrite()`)
 *
 * Returns a `notifyWrite()` function: call it after any local write so the
 * debounced background push fires ~1.5s later.
 *
 * Treats fetch failures as offline (logs, calls onSyncError, doesn't crash).
 * Multiple calls with the same uid replace the previous registration.
 */
export function startSync(handle: SyncHandle): { notifyWrite: () => void } {
	const { uid, client, onSyncStart, onSyncComplete, onSyncError } = handle;

	// Tear down any previous registration for this uid.
	stopSync(uid);

	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	let syncing = false;

	async function runSync() {
		if (syncing) return; // coalesce concurrent triggers
		syncing = true;
		onSyncStart?.();
		try {
			const result = await syncOnce(uid, client);
			onSyncComplete?.(result);
		} catch (err) {
			onSyncError?.(err);
		} finally {
			syncing = false;
		}
	}

	function onOnline() {
		runSync();
	}

	function onVisibilityChange() {
		if (
			typeof document !== "undefined" &&
			document.visibilityState === "visible"
		) {
			runSync();
		}
	}

	function onFocus() {
		runSync();
	}

	if (typeof window !== "undefined") {
		window.addEventListener("online", onOnline);
		window.addEventListener("focus", onFocus);
	}
	if (typeof document !== "undefined") {
		document.addEventListener("visibilitychange", onVisibilityChange);
	}

	function notifyWrite() {
		if (debounceTimer !== null) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			debounceTimer = null;
			runSync();
		}, DEBOUNCE_MS);
	}

	// Cleanup: remove all listeners + cancel debounce
	const cleanup: CleanupFn = () => {
		if (typeof window !== "undefined") {
			window.removeEventListener("online", onOnline);
			window.removeEventListener("focus", onFocus);
		}
		if (typeof document !== "undefined") {
			document.removeEventListener("visibilitychange", onVisibilityChange);
		}
		if (debounceTimer !== null) {
			clearTimeout(debounceTimer);
			debounceTimer = null;
		}
	};

	activeHandles.set(uid, cleanup);

	return { notifyWrite };
}

/**
 * Remove all sync triggers registered for `uid`.
 * Safe to call even if `startSync` was never called.
 */
export function stopSync(uid: string): void {
	const cleanup = activeHandles.get(uid);
	if (cleanup) {
		cleanup();
		activeHandles.delete(uid);
	}
}
