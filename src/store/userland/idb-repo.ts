// src/store/userland/idb-repo.ts
import {
	clear,
	createStore,
	del,
	delMany,
	entries,
	get,
	set,
	setMany,
	type UseStore,
} from "idb-keyval";
import type {
	BackupRepo,
	BindersRepo,
	CollectionRepo,
	UserlandRepos,
} from "./repo";
import type {
	Binder,
	CollectionItem,
	NewBinder,
	NewCollectionItem,
} from "./types";

const collectionStore = createStore("ptcg-collection", "items");
const bindersStore = createStore("ptcg-binders", "binders");

/** Assign id, createdAt, and acquiredAt defaults; null-fill optional fields. */
function fillItem(input: NewCollectionItem): CollectionItem {
	const now = Date.now();
	return {
		id: crypto.randomUUID(),
		cardId: input.cardId,
		createdAt: now,
		acquiredAt: input.acquiredAt ?? now,
		label: input.label ?? null,
		pricePaid: input.pricePaid ?? null,
		variant: input.variant ?? null,
		notes: input.notes ?? null,
		condition: input.condition ?? null,
		grading: input.grading ?? null,
	};
}

/** Assign id, createdAt/updatedAt defaults, and fill optional fields. */
function fillBinder(input: NewBinder): Binder {
	const now = Date.now();
	return {
		id: crypto.randomUUID(),
		name: input.name,
		description: input.description ?? null,
		rules: [],
		includeCardIds: [],
		excludeCardIds: [],
		createdAt: now,
		updatedAt: now,
	};
}

/** Create an IndexedDB-backed BindersRepo; uses the default binders store unless overridden (tests). */
export function createIdbBindersRepo(
	store: UseStore = bindersStore,
): BindersRepo {
	return {
		async list() {
			const rows = await entries<string, Binder>(store);
			return rows.map(([, v]) => v);
		},
		async create(input) {
			const b = fillBinder(input);
			await set(b.id, b, store);
			return b;
		},
		async update(id, patch) {
			const existing = await get<Binder>(id, store);
			if (!existing) return;
			await set(id, { ...existing, ...patch, updatedAt: Date.now() }, store);
		},
		async remove(id) {
			await del(id, store);
		},
		async clear() {
			await clear(store);
		},
	};
}

/** Create a BackupRepo that delegates to the provided collection + binders repos. */
function createIdbBackupRepo(
	collection: CollectionRepo,
	binders: BindersRepo,
): BackupRepo {
	return {
		async exportAll() {
			const [c, b] = await Promise.all([collection.list(), binders.list()]);
			return {
				schemaVersion: 1,
				exportedAt: Date.now(),
				collection: c,
				binders: b,
			};
		},
		async importAll(snapshot, mode) {
			if (mode === "replace") {
				await clear(collectionStore);
				await clear(bindersStore);
			}
			// Snapshot rows are full records — write verbatim to preserve ids.
			await setMany(
				snapshot.collection.map((i) => [i.id, i] as [string, CollectionItem]),
				collectionStore,
			);
			await setMany(
				snapshot.binders.map((b) => [b.id, b] as [string, Binder]),
				bindersStore,
			);
		},
	};
}

/** Wire all three IDB-backed repos into a UserlandRepos bundle. */
export function createIdbRepos(): UserlandRepos {
	const collection = createIdbCollectionRepo();
	const binders = createIdbBindersRepo();
	const backup = createIdbBackupRepo(collection, binders);
	return { collection, binders, backup };
}

// The ONE swap point. Today: IDB. Later: choose by auth/config.
let repos: UserlandRepos | null = null;
/** Lazily initialise and return the singleton IDB repo bundle. */
export function getRepos(): UserlandRepos {
	if (!repos) repos = createIdbRepos();
	return repos;
}

/** Create an IndexedDB-backed CollectionRepo; uses the default collection store unless overridden (tests). */
export function createIdbCollectionRepo(
	store: UseStore = collectionStore,
): CollectionRepo {
	return {
		async list() {
			const rows = await entries<string, CollectionItem>(store);
			return rows.map(([, v]) => v);
		},
		async add(input) {
			const item = fillItem(input);
			await set(item.id, item, store);
			return item;
		},
		async bulkAdd(inputs) {
			const items = inputs.map(fillItem);
			await setMany(
				items.map((i) => [i.id, i] as [string, CollectionItem]),
				store,
			);
			return items;
		},
		async update(id, patch) {
			const existing = await get<CollectionItem>(id, store);
			if (!existing) return;
			await set(id, { ...existing, ...patch }, store);
		},
		async remove(id) {
			await del(id, store);
		},
		async removeMany(ids) {
			await delMany(ids, store);
		},
		async clear() {
			await clear(store);
		},
	};
}
