// src/store/userland/userland-store.test.ts
import { beforeEach, expect, test } from "bun:test";
import { createIdbRepos } from "./idb-repo";
import {
	loadUserland,
	resetUserlandForTests,
	setUserlandRepos,
	useUserland,
} from "./userland-store";

beforeEach(async () => {
	const repos = createIdbRepos();
	await repos.collection.clear();
	await repos.goals.clear();
	setUserlandRepos(repos);
	resetUserlandForTests();
});

test("starts empty and not hydrated", () => {
	const s = useUserland.getState();
	expect(s.items).toEqual({});
	expect(s.goals).toEqual({});
	expect(s.hydrated).toBe(false);
});

test("loadUserland hydrates items and goals from the repo", async () => {
	const repos = createIdbRepos();
	const item = await repos.collection.add({ cardId: "a" });
	const goal = await repos.goals.create({ name: "G" });
	setUserlandRepos(repos);
	resetUserlandForTests();

	await loadUserland();
	const s = useUserland.getState();
	expect(s.hydrated).toBe(true);
	expect(s.items[item.id]?.cardId).toBe("a");
	expect(s.goals[goal.id]?.name).toBe("G");
});

test("loadUserland is idempotent once hydrated", async () => {
	await loadUserland();
	const first = useUserland.getState();
	await loadUserland();
	expect(useUserland.getState().items).toBe(first.items); // same ref, no refetch
});

import {
	addCopy,
	bulkAddCopies,
	clearCollection,
	removeAllCopiesOfCard,
	removeCopy,
	updateCopy,
} from "./userland-store";

test("addCopy persists and commits to the cache", async () => {
	const item = await addCopy("base1-4", { pricePaid: 10 });
	expect(useUserland.getState().items[item.id]?.pricePaid).toBe(10);
	expect(await activeReposList()).toContain(item.id);
});

test("updateCopy patches cache and repo (null clears)", async () => {
	const item = await addCopy("a", { pricePaid: 5 });
	await updateCopy(item.id, { pricePaid: null });
	expect(useUserland.getState().items[item.id]?.pricePaid).toBeNull();
});

test("removeCopy removes one copy", async () => {
	const item = await addCopy("a");
	await removeCopy(item.id);
	expect(useUserland.getState().items[item.id]).toBeUndefined();
});

test("removeAllCopiesOfCard removes every copy of a card", async () => {
	await addCopy("dup");
	await addCopy("dup");
	await addCopy("other");
	await removeAllCopiesOfCard("dup");
	const remaining = Object.values(useUserland.getState().items);
	expect(remaining.every((i) => i.cardId === "other")).toBe(true);
	expect(remaining).toHaveLength(1);
});

test("bulkAddCopies adds many; clearCollection empties", async () => {
	await bulkAddCopies(["a", "b", "c"]);
	expect(Object.keys(useUserland.getState().items)).toHaveLength(3);
	await clearCollection();
	expect(useUserland.getState().items).toEqual({});
});

// helper used above
async function activeReposList(): Promise<string[]> {
	const { activeRepos } = await import("./userland-store");
	return (await activeRepos().collection.list()).map((i) => i.id);
}
