// src/store/userland/repo.ts
import type {
	CollectionItem,
	CopyPatch,
	Goal,
	GoalPatch,
	NewCollectionItem,
	NewGoal,
	UserDataSnapshot,
} from "./types";

/** Persistence contract for owned card copies. */
export interface CollectionRepo {
	/** Returns all stored copies in insertion order. */
	list(): Promise<CollectionItem[]>;
	/** Persist a new copy and return the fully-filled record. */
	add(item: NewCollectionItem): Promise<CollectionItem>;
	/** Persist multiple new copies in a single write. */
	bulkAdd(items: NewCollectionItem[]): Promise<CollectionItem[]>;
	/** Merge patch into an existing copy; null fields clear, omitted fields stay. */
	update(id: string, patch: CopyPatch): Promise<void>; // null clears; absent leaves
	/** Delete a single copy by id. */
	remove(id: string): Promise<void>;
	/** Delete multiple copies by id in one operation. */
	removeMany(ids: string[]): Promise<void>;
	/** Delete every copy in the store. */
	clear(): Promise<void>;
}

/** Persistence contract for user goals. */
export interface GoalsRepo {
	/** Returns all stored goals in insertion order. */
	list(): Promise<Goal[]>;
	/** Persist a new goal and return the fully-filled record. */
	create(goal: NewGoal): Promise<Goal>;
	/** Merge patch into an existing goal; bumps updatedAt. */
	update(id: string, patch: GoalPatch): Promise<void>;
	/** Delete a goal by id. */
	remove(id: string): Promise<void>;
	/** Delete every goal in the store. */
	clear(): Promise<void>;
}

/** Persistence contract for full-data backup operations. */
export interface BackupRepo {
	/** Snapshot the entire collection + goals into a serialisable envelope. */
	exportAll(): Promise<UserDataSnapshot>;
	/**
	 * Write a snapshot back to storage.
	 * `replace` clears existing data first; `merge` upserts without deleting.
	 */
	importAll(
		snapshot: UserDataSnapshot,
		mode: "replace" | "merge",
	): Promise<void>;
}

/** Aggregates all per-domain repos for the userland data layer. */
export interface UserlandRepos {
	collection: CollectionRepo;
	goals: GoalsRepo;
	backup: BackupRepo;
}
