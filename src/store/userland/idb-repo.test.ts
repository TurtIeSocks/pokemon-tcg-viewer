// src/store/userland/idb-repo.test.ts
import { beforeEach, expect, test } from "bun:test";
import { createIdbCollectionRepo } from "./idb-repo";

const repo = createIdbCollectionRepo();
beforeEach(async () => {
	await repo.clear();
});

test("add assigns id/createdAt/acquiredAt and null-fills omitted optionals", async () => {
	const item = await repo.add({ cardId: "base1-4" });
	expect(typeof item.id).toBe("string");
	expect(item.cardId).toBe("base1-4");
	expect(typeof item.createdAt).toBe("number");
	expect(typeof item.acquiredAt).toBe("number");
	expect(item.pricePaid).toBeNull();
	expect(item.variant).toBeNull();
	expect(item.notes).toBeNull();
	expect(item.condition).toBeNull();
	expect(item.grading).toBeNull();
});

test("add keeps provided fields and a caller-set acquiredAt", async () => {
	const item = await repo.add({
		cardId: "x",
		acquiredAt: 111,
		pricePaid: 5,
		condition: "NM",
	});
	expect(item.acquiredAt).toBe(111);
	expect(item.pricePaid).toBe(5);
	expect(item.condition).toBe("NM");
});

test("list returns all added items", async () => {
	await repo.add({ cardId: "a" });
	await repo.add({ cardId: "b" });
	const all = await repo.list();
	expect(all.map((i) => i.cardId).sort()).toEqual(["a", "b"]);
});

test("update applies a patch; null clears, absent leaves untouched", async () => {
	const item = await repo.add({ cardId: "a", pricePaid: 9, notes: "mint" });
	await repo.update(item.id, { pricePaid: null }); // clear price, leave notes
	const [reloaded] = await repo.list();
	expect(reloaded.pricePaid).toBeNull();
	expect(reloaded.notes).toBe("mint");
});

test("update on a missing id is a no-op", async () => {
	await repo.update("nope", { pricePaid: 1 });
	expect(await repo.list()).toEqual([]);
});

test("remove and removeMany delete rows", async () => {
	const a = await repo.add({ cardId: "a" });
	const b = await repo.add({ cardId: "b" });
	const c = await repo.add({ cardId: "c" });
	await repo.remove(a.id);
	await repo.removeMany([b.id, c.id]);
	expect(await repo.list()).toEqual([]);
});

test("bulkAdd inserts many", async () => {
	const created = await repo.bulkAdd([{ cardId: "a" }, { cardId: "b" }]);
	expect(created).toHaveLength(2);
	expect(await repo.list()).toHaveLength(2);
});

import { createIdbBindersRepo } from "./idb-repo";
import type { BinderRule } from "./types";

const binders = createIdbBindersRepo();
beforeEach(async () => {
	await binders.clear();
});

test("binders.create assigns id/timestamps and defaults description=null, rules/includeCardIds/excludeCardIds=[]", async () => {
	const b = await binders.create({ name: "Gen 1 binder" });
	expect(typeof b.id).toBe("string");
	expect(b.name).toBe("Gen 1 binder");
	expect(b.description).toBeNull();
	expect(b.rules).toEqual([]);
	expect(b.includeCardIds).toEqual([]);
	expect(b.excludeCardIds).toEqual([]);
	expect(b.createdAt).toBe(b.updatedAt);
});

test("binders.create with description preserves it", async () => {
	const b = await binders.create({ name: "Fire deck", description: "All fire cards" });
	expect(b.description).toBe("All fire cards");
});

test("binders.update patches fields and bumps updatedAt", async () => {
	const b = await binders.create({ name: "A" });
	const rule: BinderRule = {
		id: "rule-1",
		query: {
			text: null,
			setId: "base1",
			dexNumber: null,
			types: [],
			rarities: [],
			supertypes: [],
			subtypes: [],
			yearMin: null,
			yearMax: null,
		},
	};
	await binders.update(b.id, {
		name: "B",
		rules: [rule],
	});
	const [reloaded] = await binders.list();
	expect(reloaded.name).toBe("B");
	expect(reloaded.rules).toEqual([rule]);
	expect(reloaded.updatedAt).toBeGreaterThanOrEqual(reloaded.createdAt);
});

test("binders.update with includeCardIds and excludeCardIds", async () => {
	const b = await binders.create({ name: "A" });
	await binders.update(b.id, {
		includeCardIds: ["card-1", "card-2"],
		excludeCardIds: ["card-3"],
	});
	const [reloaded] = await binders.list();
	expect(reloaded.includeCardIds).toEqual(["card-1", "card-2"]);
	expect(reloaded.excludeCardIds).toEqual(["card-3"]);
});

test("binders.remove deletes", async () => {
	const b = await binders.create({ name: "A" });
	await binders.remove(b.id);
	expect(await binders.list()).toEqual([]);
});

import { getRepos } from "./idb-repo";
import type { Binder, UserDataSnapshot } from "./types";

const repos = getRepos();
beforeEach(async () => {
	await repos.collection.clear();
	await repos.binders.clear();
});

test("exportAll returns a v1 snapshot of current data", async () => {
	await repos.collection.add({ cardId: "a", pricePaid: 3 });
	await repos.binders.create({ name: "G" });
	const snap = await repos.backup.exportAll();
	expect(snap.schemaVersion).toBe(1);
	expect(snap.collection).toHaveLength(1);
	expect(snap.binders).toHaveLength(1);
	expect(typeof snap.exportedAt).toBe("number");
});

test("importAll replace clears then writes, preserving ids", async () => {
	await repos.collection.add({ cardId: "old" });
	const snap: UserDataSnapshot = {
		schemaVersion: 1,
		exportedAt: 0,
		collection: [
			{
				id: "fixed-1",
				cardId: "new",
				acquiredAt: 1,
				createdAt: 1,
				pricePaid: null,
				variant: null,
				notes: null,
				condition: null,
				grading: null,
			},
		],
		binders: [],
	};
	await repos.backup.importAll(snap, "replace");
	const all = await repos.collection.list();
	expect(all).toHaveLength(1);
	expect(all[0].id).toBe("fixed-1");
	expect(all[0].cardId).toBe("new");
});

test("importAll merge upserts by id without clearing", async () => {
	const existing = await repos.collection.add({ cardId: "keep" });
	const snap: UserDataSnapshot = {
		schemaVersion: 1,
		exportedAt: 0,
		collection: [
			{
				id: "added-1",
				cardId: "added",
				acquiredAt: 1,
				createdAt: 1,
				pricePaid: null,
				variant: null,
				notes: null,
				condition: null,
				grading: null,
			},
		],
		binders: [],
	};
	await repos.backup.importAll(snap, "merge");
	const ids = (await repos.collection.list()).map((i) => i.id).sort();
	expect(ids).toEqual(["added-1", existing.id].sort());
});

test("backup round-trips a binder with rule + includeCardIds + excludeCardIds, preserving id", async () => {
	const rule: BinderRule = {
		id: "rule-x",
		query: {
			text: "charizard",
			setId: null,
			dexNumber: 6,
			types: ["Fire"],
			rarities: ["Rare Holo"],
			supertypes: ["Pokémon"],
			subtypes: [],
			yearMin: 1999,
			yearMax: null,
		},
	};
	const fullBinder: Binder = {
		id: "binder-abc",
		name: "Charizard collection",
		description: "All Charizard cards",
		rules: [rule],
		includeCardIds: ["base1-4"],
		excludeCardIds: ["xy7-11"],
		createdAt: 1000,
		updatedAt: 2000,
	};
	const snap: UserDataSnapshot = {
		schemaVersion: 1,
		exportedAt: 0,
		collection: [],
		binders: [fullBinder],
	};
	await repos.backup.importAll(snap, "replace");
	const exportedSnap = await repos.backup.exportAll();
	expect(exportedSnap.binders).toHaveLength(1);
	const got = exportedSnap.binders[0];
	expect(got.id).toBe("binder-abc");
	expect(got.name).toBe("Charizard collection");
	expect(got.description).toBe("All Charizard cards");
	expect(got.rules).toEqual([rule]);
	expect(got.includeCardIds).toEqual(["base1-4"]);
	expect(got.excludeCardIds).toEqual(["xy7-11"]);
});
