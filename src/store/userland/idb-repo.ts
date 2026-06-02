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
import type { CollectionRepo, GoalsRepo } from "./repo";
import type { CollectionItem, Goal, NewCollectionItem, NewGoal } from "./types";

const collectionStore = createStore("ptcg-collection", "items");
const goalsStore = createStore("ptcg-goals", "goals");

function fillItem(input: NewCollectionItem): CollectionItem {
	const now = Date.now();
	return {
		id: crypto.randomUUID(),
		cardId: input.cardId,
		createdAt: now,
		acquiredAt: input.acquiredAt ?? now,
		pricePaid: input.pricePaid ?? null,
		variant: input.variant ?? null,
		notes: input.notes ?? null,
		condition: input.condition ?? null,
		grading: input.grading ?? null,
	};
}

function fillGoal(input: NewGoal): Goal {
	const now = Date.now();
	return {
		id: crypto.randomUUID(),
		name: input.name,
		description: input.description ?? null,
		targets: input.targets ?? [],
		createdAt: now,
		updatedAt: now,
	};
}

export function createIdbGoalsRepo(store: UseStore = goalsStore): GoalsRepo {
	return {
		async list() {
			const rows = await entries<string, Goal>(store);
			return rows.map(([, v]) => v);
		},
		async create(input) {
			const g = fillGoal(input);
			await set(g.id, g, store);
			return g;
		},
		async update(id, patch) {
			const existing = await get<Goal>(id, store);
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
