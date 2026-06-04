// src/store/userland/repo.ts
import type {
	Binder,
	BinderPatch,
	Stack,
	StackPatch,
	NewBinder,
	NewStack,
	UserDataSnapshot,
} from "./types";

/** Persistence contract for owned card stacks. */
export interface CollectionRepo {
	/** Returns all stored stacks in insertion order. */
	list(): Promise<Stack[]>;
	/** Persist a new stack and return the fully-filled record. */
	add(item: NewStack): Promise<Stack>;
	/** Persist multiple new stacks in a single write. */
	bulkAdd(items: NewStack[]): Promise<Stack[]>;
	/** Merge patch into an existing stack; null fields clear, omitted fields stay. */
	update(id: string, patch: StackPatch): Promise<void>; // null clears; absent leaves
	/** Delete a single stack by id. */
	remove(id: string): Promise<void>;
	/** Delete multiple stacks by id in one operation. */
	removeMany(ids: string[]): Promise<void>;
	/** Delete every stack in the store. */
	clear(): Promise<void>;
}

/** Persistence contract for user binders. */
export interface BindersRepo {
	/** Returns all stored binders in insertion order. */
	list(): Promise<Binder[]>;
	/** Persist a new binder and return the fully-filled record. */
	create(binder: NewBinder): Promise<Binder>;
	/** Merge patch into an existing binder; bumps updatedAt. */
	update(id: string, patch: BinderPatch): Promise<void>;
	/** Delete a binder by id. */
	remove(id: string): Promise<void>;
	/** Delete every binder in the store. */
	clear(): Promise<void>;
}

/** Persistence contract for full-data backup operations. */
export interface BackupRepo {
	/** Snapshot the entire collection + binders into a serialisable envelope. */
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
	binders: BindersRepo;
	backup: BackupRepo;
}
