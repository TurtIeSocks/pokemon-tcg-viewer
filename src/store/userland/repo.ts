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

export interface CollectionRepo {
	list(): Promise<CollectionItem[]>;
	add(item: NewCollectionItem): Promise<CollectionItem>;
	bulkAdd(items: NewCollectionItem[]): Promise<CollectionItem[]>;
	update(id: string, patch: CopyPatch): Promise<void>; // null clears; absent leaves
	remove(id: string): Promise<void>;
	removeMany(ids: string[]): Promise<void>;
	clear(): Promise<void>;
}

export interface GoalsRepo {
	list(): Promise<Goal[]>;
	create(goal: NewGoal): Promise<Goal>;
	update(id: string, patch: GoalPatch): Promise<void>;
	remove(id: string): Promise<void>;
	clear(): Promise<void>;
}

export interface BackupRepo {
	exportAll(): Promise<UserDataSnapshot>;
	importAll(
		snapshot: UserDataSnapshot,
		mode: "replace" | "merge",
	): Promise<void>;
}

export interface UserlandRepos {
	collection: CollectionRepo;
	goals: GoalsRepo;
	backup: BackupRepo;
}
