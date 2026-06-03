// src/store/userland/userland-store.test.ts
import { beforeEach, expect, test } from "bun:test";
import { createIdbRepos } from "./idb-repo";
import {
	addCardsToBinder,
	addCopy,
	addRuleToBinder,
	bulkAddCopies,
	clearCollection,
	createBinder,
	exportUserData,
	importUserData,
	loadUserland,
	removeAllCopiesOfCard,
	removeBinder,
	removeCardFromBinder,
	removeCopy,
	removeRuleFromBinder,
	resetUserlandForTests,
	restoreCardToBinder,
	setPrimaryCopy,
	setUserlandRepos,
	toggleCardOwned,
	updateCopy,
	useUserland,
} from "./userland-store";

beforeEach(async () => {
	const repos = createIdbRepos();
	await repos.collection.clear();
	await repos.binders.clear();
	setUserlandRepos(repos);
	resetUserlandForTests();
});

// --- basic hydration ---

test("starts empty and not hydrated", () => {
	const s = useUserland.getState();
	expect(s.items).toEqual({});
	expect(s.binders).toEqual({});
	expect(s.hydrated).toBe(false);
});

test("loadUserland hydrates items and binders from the repo", async () => {
	const repos = createIdbRepos();
	const item = await repos.collection.add({ cardId: "a" });
	const binder = await repos.binders.create({ name: "B1" });
	setUserlandRepos(repos);
	resetUserlandForTests();

	await loadUserland();
	const s = useUserland.getState();
	expect(s.hydrated).toBe(true);
	expect(s.items[item.id]?.cardId).toBe("a");
	expect(s.binders[binder.id]?.name).toBe("B1");
});

test("loadUserland is idempotent once hydrated", async () => {
	await loadUserland();
	const first = useUserland.getState();
	await loadUserland();
	expect(useUserland.getState().items).toBe(first.items); // same ref, no refetch
});

// --- collection basics ---

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

// --- auto-primary ---

test("addCopy: first copy of an unowned card becomes primary", async () => {
	const item = await addCopy("card-x");
	expect(useUserland.getState().items[item.id]?.isPrimary).toBe(true);
});

test("addCopy: second copy of an already-owned card is not primary; first stays primary", async () => {
	const first = await addCopy("card-x");
	const second = await addCopy("card-x");
	expect(useUserland.getState().items[first.id]?.isPrimary).toBe(true);
	expect(useUserland.getState().items[second.id]?.isPrimary).toBeFalsy();
});

test("bulkAddCopies: each new card's copy is primary; already-owned cards' new copies are not", async () => {
	// pre-own card "a"
	await addCopy("a");
	// bulk-add "a" (already owned) and "b" (new)
	await bulkAddCopies(["a", "b"]);
	const allItems = Object.values(useUserland.getState().items);
	const aCopies = allItems.filter((i) => i.cardId === "a");
	const bCopies = allItems.filter((i) => i.cardId === "b");
	// "a" already had a primary; the bulk-added copy of "a" must not be primary
	const aPrimaries = aCopies.filter((i) => i.isPrimary);
	expect(aPrimaries).toHaveLength(1); // still exactly one primary
	// "b" was brand new — its copy must be primary
	expect(bCopies).toHaveLength(1);
	expect(bCopies[0]?.isPrimary).toBe(true);
});

test("bulkAddCopies: same unowned cardId twice in one batch → exactly one primary", async () => {
	await bulkAddCopies(["x", "x"]);
	const xCopies = Object.values(useUserland.getState().items).filter(
		(i) => i.cardId === "x",
	);
	expect(xCopies).toHaveLength(2);
	expect(xCopies.filter((i) => i.isPrimary)).toHaveLength(1);
});

test("bulkAddCopies: two brand-new cards both get primary copies", async () => {
	await bulkAddCopies(["alpha", "beta"]);
	const items = Object.values(useUserland.getState().items);
	expect(items.find((i) => i.cardId === "alpha")?.isPrimary).toBe(true);
	expect(items.find((i) => i.cardId === "beta")?.isPrimary).toBe(true);
});

// --- promote-on-delete ---

test("removeCopy: removing the only copy leaves nothing to promote — no error", async () => {
	const item = await addCopy("solo-card");
	await removeCopy(item.id);
	expect(Object.values(useUserland.getState().items)).toHaveLength(0);
});

test("removeCopy: removing the primary copy promotes the earliest-createdAt survivor", async () => {
	const first = await addCopy("card-z"); // isPrimary = true (first copy)
	await new Promise((r) => setTimeout(r, 2)); // ensure distinct createdAt
	const second = await addCopy("card-z"); // not primary
	await new Promise((r) => setTimeout(r, 2));
	const third = await addCopy("card-z"); // not primary

	// Remove the primary; second (earliest survivor) should be promoted.
	await removeCopy(first.id);
	const items = useUserland.getState().items;
	expect(items[second.id]?.isPrimary).toBe(true);
	expect(items[third.id]?.isPrimary).toBe(false);
});

test("removeCopy: removing a non-primary copy does not change primary", async () => {
	const first = await addCopy("card-w"); // primary
	await new Promise((r) => setTimeout(r, 2));
	const second = await addCopy("card-w"); // not primary

	await removeCopy(second.id); // remove non-primary
	expect(useUserland.getState().items[first.id]?.isPrimary).toBe(true);
});

// --- setPrimaryCopy ---

test("setPrimaryCopy marks one copy primary and clears its siblings", async () => {
	const a = await addCopy("c");
	const b = await addCopy("c");
	await setPrimaryCopy("c", b.id);
	expect(useUserland.getState().items[b.id].isPrimary).toBe(true);
	expect(useUserland.getState().items[a.id].isPrimary).toBe(false);
	await setPrimaryCopy("c", a.id);
	expect(useUserland.getState().items[a.id].isPrimary).toBe(true);
	expect(useUserland.getState().items[b.id].isPrimary).toBe(false);
});

// --- binder actions ---

test("createBinder stores with empty rules/include/exclude", async () => {
	const b = await createBinder({ name: "My Binder" });
	const stored = useUserland.getState().binders[b.id];
	expect(stored?.name).toBe("My Binder");
	expect(stored?.rules).toEqual([]);
	expect(stored?.includeCardIds).toEqual([]);
	expect(stored?.excludeCardIds).toEqual([]);
	expect(stored?.description).toBeNull();
});

test("addRuleToBinder pushes a rule", async () => {
	const b = await createBinder({ name: "B" });
	const query = {
		text: null,
		setId: "base1",
		dexNumber: null,
		types: [],
		rarities: [],
		supertypes: [],
		subtypes: [],
		yearMin: null,
		yearMax: null,
		exact: false,
	};
	await addRuleToBinder(b.id, query);
	const stored = useUserland.getState().binders[b.id];
	expect(stored?.rules).toHaveLength(1);
	expect(stored?.rules[0]?.query.setId).toBe("base1");
	expect(stored?.rules[0]?.id).toBeString();
});

test("addCardsToBinder unions includes and clears matching excludes", async () => {
	const b = await createBinder({ name: "B" });
	// pre-load with exclude
	await addCardsToBinder(b.id, ["x", "y"]);
	// exclude "x"
	await removeCardFromBinder(b.id, "x");
	// re-add "x" via addCardsToBinder — should clear it from excludes
	await addCardsToBinder(b.id, ["x", "z"]);
	const stored = useUserland.getState().binders[b.id];
	expect(stored?.includeCardIds).toContain("x");
	expect(stored?.includeCardIds).toContain("y");
	expect(stored?.includeCardIds).toContain("z");
	expect(stored?.excludeCardIds).not.toContain("x"); // cleared
});

test("removeCardFromBinder removes from include and adds to exclude", async () => {
	const b = await createBinder({ name: "B" });
	await addCardsToBinder(b.id, ["card-a", "card-b"]);
	await removeCardFromBinder(b.id, "card-a");
	const stored = useUserland.getState().binders[b.id];
	expect(stored?.includeCardIds).not.toContain("card-a");
	expect(stored?.excludeCardIds).toContain("card-a");
	expect(stored?.includeCardIds).toContain("card-b"); // untouched
});

test("removeCardFromBinder is idempotent", async () => {
	const b = await createBinder({ name: "B" });
	await removeCardFromBinder(b.id, "ghost"); // not in include/exclude
	await removeCardFromBinder(b.id, "ghost"); // again
	const stored = useUserland.getState().binders[b.id];
	expect(stored?.excludeCardIds.filter((id) => id === "ghost")).toHaveLength(1);
});

test("restoreCardToBinder removes cardId from excludeCardIds", async () => {
	const b = await createBinder({ name: "B" });
	await removeCardFromBinder(b.id, "card-a");
	expect(useUserland.getState().binders[b.id]?.excludeCardIds).toContain(
		"card-a",
	);
	await restoreCardToBinder(b.id, "card-a");
	expect(useUserland.getState().binders[b.id]?.excludeCardIds).not.toContain(
		"card-a",
	);
});

test("removeRuleFromBinder drops the rule", async () => {
	const b = await createBinder({ name: "B" });
	const query = {
		text: null,
		setId: null,
		dexNumber: null,
		types: [],
		rarities: ["Rare Holo"],
		supertypes: [],
		subtypes: [],
		yearMin: null,
		yearMax: null,
		exact: false,
	};
	await addRuleToBinder(b.id, query);
	const ruleId = useUserland.getState().binders[b.id]?.rules[0]?.id as string;
	await removeRuleFromBinder(b.id, ruleId);
	expect(useUserland.getState().binders[b.id]?.rules).toHaveLength(0);
});

test("removeBinder deletes the binder from store", async () => {
	const b = await createBinder({ name: "ToDelete" });
	await removeBinder(b.id);
	expect(useUserland.getState().binders[b.id]).toBeUndefined();
});

// --- import / export ---

test("export then import (replace) round-trips through the cache", async () => {
	await addCopy("a", { pricePaid: 7 });
	await createBinder({ name: "G" });
	const snap = await exportUserData();

	await clearCollection();
	await importUserData(snap, "replace");

	const items = Object.values(useUserland.getState().items);
	expect(items).toHaveLength(1);
	expect(items[0].pricePaid).toBe(7);
	expect(Object.values(useUserland.getState().binders)).toHaveLength(1);
});

// --- toggleCardOwned ---

test("toggleCardOwned: unowned card → 1 copy added (owned)", async () => {
	await toggleCardOwned("card-toggle");
	const copies = Object.values(useUserland.getState().items).filter(
		(i) => i.cardId === "card-toggle",
	);
	expect(copies).toHaveLength(1);
	expect(copies[0]?.isPrimary).toBe(true);
});

test("toggleCardOwned: owned card → all copies removed (unowned)", async () => {
	await toggleCardOwned("card-toggle");
	await toggleCardOwned("card-toggle");
	const copies = Object.values(useUserland.getState().items).filter(
		(i) => i.cardId === "card-toggle",
	);
	expect(copies).toHaveLength(0);
});

test("toggleCardOwned: card with 2 copies → all removed", async () => {
	await addCopy("multi-copy");
	await addCopy("multi-copy");
	expect(
		Object.values(useUserland.getState().items).filter(
			(i) => i.cardId === "multi-copy",
		),
	).toHaveLength(2);
	await toggleCardOwned("multi-copy");
	expect(
		Object.values(useUserland.getState().items).filter(
			(i) => i.cardId === "multi-copy",
		),
	).toHaveLength(0);
});
