// src/store/userland/sync/types.ts

/** Entity namespaces tracked by the sync layer. */
export type Entity = "stacks" | "binders" | "profiles";

/** Per-entity sets of row ids that have been written locally and not yet pushed. */
export interface DirtySet {
	stacks: Set<string>;
	binders: Set<string>;
	profiles: Set<string>;
}

/**
 * Input to the pure reconciler for one entity type.
 * - `cache`     — current local Map<id, T> (the per-uid IDB cache).
 * - `pulled`    — rows fetched from the cloud since the last watermark.
 * - `dirtyIds`  — ids that have been written locally and not yet pushed.
 */
export interface ReconcileInput<T> {
	cache: Map<string, T>;
	pulled: T[];
	dirtyIds: Set<string>;
}

/**
 * Output from the pure reconciler for one entity type.
 * - `merged`  — the new cache state (replace the cache with this).
 * - `toPush`  — rows that must be pushed to the cloud (local wins or new local rows).
 */
export interface ReconcileOutput<T> {
	merged: Map<string, T>;
	toPush: T[];
}
