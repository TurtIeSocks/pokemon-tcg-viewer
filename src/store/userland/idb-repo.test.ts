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

import { createIdbGoalsRepo } from "./idb-repo";

const goals = createIdbGoalsRepo();
beforeEach(async () => {
	await goals.clear();
});

test("goals.create assigns id/timestamps and defaults description=null, targets=[]", async () => {
	const g = await goals.create({ name: "Gen 1 binder" });
	expect(typeof g.id).toBe("string");
	expect(g.name).toBe("Gen 1 binder");
	expect(g.description).toBeNull();
	expect(g.targets).toEqual([]);
	expect(g.createdAt).toBe(g.updatedAt);
});

test("goals.update patches fields and bumps updatedAt", async () => {
	const g = await goals.create({ name: "A" });
	await goals.update(g.id, {
		name: "B",
		targets: [{ kind: "set", setId: "base1" }],
	});
	const [reloaded] = await goals.list();
	expect(reloaded.name).toBe("B");
	expect(reloaded.targets).toEqual([{ kind: "set", setId: "base1" }]);
	expect(reloaded.updatedAt).toBeGreaterThanOrEqual(reloaded.createdAt);
});

test("goals.remove deletes", async () => {
	const g = await goals.create({ name: "A" });
	await goals.remove(g.id);
	expect(await goals.list()).toEqual([]);
});
