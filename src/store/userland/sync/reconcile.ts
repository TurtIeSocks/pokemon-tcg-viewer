// src/store/userland/sync/reconcile.ts
//
// Pure reconciler — NO Date.now, NO IDB, NO network.
// Server-authoritative clock → last-push-wins.
// A dirty local row wins a conflict because it will push next.

import type { Binder, Profile, Stack } from "../types";
import type { ReconcileInput, ReconcileOutput } from "./types";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Extract the id from a Stack / Binder / Profile row. */
function idOf(row: Stack | Binder | Profile): string {
	return row.id;
}

/**
 * Generic row-LWW reconciler.
 *
 * Semantics (server-authoritative clock, dirty = local wins):
 *   - pulled row, id NOT dirty → accept pulled (cloud newer than watermark).
 *   - pulled row, id dirty     → keep local, push it (local wins, pushes next).
 *   - dirty id NOT in pulled   → keep local, push it (cloud hasn't seen it yet).
 *   - no pulled, no dirty      → no-op.
 */
function reconcileRowLww<T extends Stack | Binder | Profile>(
	input: ReconcileInput<T>,
): ReconcileOutput<T> {
	const { cache, pulled, dirtyIds } = input;
	// Start from a copy of the cache; we will overwrite non-dirty pulled rows.
	const merged = new Map(cache);
	const toPush: T[] = [];

	for (const row of pulled) {
		const id = idOf(row);
		if (dirtyIds.has(id)) {
			// Local row is dirty → keep local, enqueue for push.
			// (The local value is already in `merged` from the cache copy.)
			const local = merged.get(id);
			if (local !== undefined) {
				toPush.push(local);
			}
		} else {
			// Not dirty → cloud row is authoritative; accept it.
			merged.set(id, row);
		}
	}

	// Any dirty id that wasn't in pulled also needs to be pushed.
	for (const id of dirtyIds) {
		const local = merged.get(id);
		if (local !== undefined) {
			// Only add to toPush if not already added above.
			const alreadyQueued = toPush.some((r) => idOf(r) === id);
			if (!alreadyQueued) {
				toPush.push(local);
			}
		}
	}

	return { merged, toPush };
}

// ---------------------------------------------------------------------------
// Binder array-merge
// ---------------------------------------------------------------------------

/**
 * Merge two binder rows (local wins on scalar fields; arrays are unioned).
 *
 * - `includeCardIds` → union (no cross-deduplication with excludeCardIds)
 * - `excludeCardIds` → union (no cross-deduplication with includeCardIds)
 * - `rules`          → union by id; same id → keep local rule
 *
 * Exclude winning over include at display time is the membership selector's
 * responsibility, not this function's.
 */
export function mergeBinder(local: Binder, remote: Binder): Binder {
	// Union string arrays, preserving order (local first, then remote additions).
	const unionStrings = (a: string[], b: string[]): string[] => {
		const seen = new Set(a);
		const result = [...a];
		for (const item of b) {
			if (!seen.has(item)) {
				seen.add(item);
				result.push(item);
			}
		}
		return result;
	};

	// Union rules by id; local rule wins when ids match.
	const localRuleIds = new Set(local.rules.map((r) => r.id));
	const mergedRules = [
		...local.rules,
		...remote.rules.filter((r) => !localRuleIds.has(r.id)),
	];

	return {
		...local, // scalar fields: local wins (name, description, updatedAt, etc.)
		includeCardIds: unionStrings(local.includeCardIds, remote.includeCardIds),
		excludeCardIds: unionStrings(local.excludeCardIds, remote.excludeCardIds),
		rules: mergedRules,
	};
}

/**
 * Binder reconciler.
 *
 * Same pull-accept / dirty-wins semantics as row-LWW, but a dirty binder that
 * also has a pulled version gets array-merged rather than stomped.
 */
export function reconcileBinders(
	input: ReconcileInput<Binder>,
): ReconcileOutput<Binder> {
	const { cache, pulled, dirtyIds } = input;
	const merged = new Map(cache);
	const toPush: Binder[] = [];
	const pushedIds = new Set<string>();

	for (const row of pulled) {
		const id = row.id;
		if (dirtyIds.has(id)) {
			// Dirty + pulled → array-merge; result pushed.
			const local = merged.get(id);
			const mergedBinder = local !== undefined ? mergeBinder(local, row) : row;
			merged.set(id, mergedBinder);
			toPush.push(mergedBinder);
			pushedIds.add(id);
		} else {
			// Not dirty → accept cloud.
			merged.set(id, row);
		}
	}

	// Dirty ids not in pulled still need pushing.
	for (const id of dirtyIds) {
		if (!pushedIds.has(id)) {
			const local = merged.get(id);
			if (local !== undefined) {
				toPush.push(local);
				pushedIds.add(id);
			}
		}
	}

	return { merged, toPush };
}

// ---------------------------------------------------------------------------
// Public reconciler functions
// ---------------------------------------------------------------------------

/** Row-LWW reconciler for stacks. */
export function reconcileStacks(
	input: ReconcileInput<Stack>,
): ReconcileOutput<Stack> {
	return reconcileRowLww(input);
}

/** Row-LWW reconciler for profiles. */
export function reconcileProfiles(
	input: ReconcileInput<Profile>,
): ReconcileOutput<Profile> {
	return reconcileRowLww(input);
}
