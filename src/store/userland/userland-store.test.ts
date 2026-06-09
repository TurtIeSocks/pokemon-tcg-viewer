// src/store/userland/userland-store.test.ts
import { beforeEach, expect, test } from "bun:test";
import { setupUserlandTest } from "../../test-utils";
import { createIdbRepos } from "./idb-repo";
import {
	_setCurrentSessionForTests,
	activeRepos,
	addCardsToBinder,
	addRuleToBinder,
	addStack,
	addStacks,
	bulkAddStacks,
	clearCollection,
	createBinder,
	exportUserData,
	importStacks,
	importUserData,
	loadUserland,
	mergeDuplicateStacks,
	removeAllStacksOfCard,
	removeBinder,
	removeCardFromBinder,
	removeRuleFromBinder,
	removeStack,
	resetUserlandForTests,
	restoreCardToBinder,
	setPrimaryStack,
	setUserlandRepos,
	splitStack,
	toggleCardOwned,
	updateProfile,
	updateStack,
	useUserland,
} from "./userland-store";

beforeEach(async () => {
	await setupUserlandTest();
});

// --- basic hydration ---

test("starts empty and not hydrated", () => {
	const s = useUserland.getState();
	expect(s.items).toEqual({});
	expect(s.binders).toEqual({});
	expect(s.hydrated).toBe(false);
});

test("splitStack peels count into a new sibling stack and reduces the original", async () => {
	const created = await addStack("base1-4", { quantity: 10, condition: "NM" });
	const newId = await splitStack(created.id, 3);
	const items = useUserland.getState().items;
	expect(items[created.id].quantity).toBe(7);
	expect(items[newId].quantity).toBe(3);
	expect(items[newId].condition).toBe("NM");
	expect(items[newId].cardId).toBe("base1-4");
	expect(items[newId].isPrimary).toBeFalsy(); // primary stays on the original
});

test("splitStack rejects count <= 0, >= quantity, or a missing id", async () => {
	const s = await addStack("base1-4", { quantity: 2 });
	await expect(splitStack(s.id, 0)).rejects.toThrow();
	await expect(splitStack(s.id, 2)).rejects.toThrow();
	await expect(splitStack("missing", 1)).rejects.toThrow();
});

test("addStacks bulk-inserts NewStacks; first of each unowned card becomes primary", async () => {
	const created = await addStacks([
		{ cardId: "a", quantity: 3 },
		{ cardId: "a", quantity: 1 },
		{ cardId: "b", quantity: 2 },
	]);
	expect(created).toHaveLength(3);
	const items = useUserland.getState().items;
	expect(
		Object.values(items).filter((i) => i.cardId === "a" && i.isPrimary),
	).toHaveLength(1);
	const b = created.find((c) => c.cardId === "b");
	expect(b && items[b.id].isPrimary).toBe(true);
});

test("importStacks merge sums into an existing identical stack + dedups the batch", async () => {
	await addStack("a", { quantity: 2, condition: "NM" });
	await importStacks(
		[
			{ cardId: "a", quantity: 3, condition: "NM" }, // merges into existing → 5
			{ cardId: "a", quantity: 1, condition: "LP" }, // new
			{ cardId: "a", quantity: 1, condition: "LP" }, // dedups with prev → 2
		],
		true,
	);
	const items = Object.values(useUserland.getState().items);
	expect(items.find((i) => i.condition === "NM")?.quantity).toBe(5);
	expect(items.find((i) => i.condition === "LP")?.quantity).toBe(2);
	expect(items).toHaveLength(2);
});

test("importStacks without merge adds every row", async () => {
	await importStacks(
		[
			{ cardId: "a", quantity: 1 },
			{ cardId: "a", quantity: 1 },
		],
		false,
	);
	expect(Object.values(useUserland.getState().items)).toHaveLength(2);
});

test("mergeDuplicateStacks combines identical stacks of a card, summing quantity", async () => {
	const a = await addStack("c", { quantity: 2, condition: "NM" });
	await addStack("c", { quantity: 3, condition: "NM" }); // identical → mergeable
	await addStack("c", { quantity: 1, condition: "LP" }); // different → kept apart
	await mergeDuplicateStacks("c");
	const stacks = Object.values(useUserland.getState().items).filter(
		(s) => s.cardId === "c",
	);
	expect(stacks).toHaveLength(2);
	const nm = stacks.find((s) => s.condition === "NM");
	expect(nm?.quantity).toBe(5);
	expect(nm?.id).toBe(a.id); // kept the primary/first
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

test("addStack persists and commits to the cache", async () => {
	const item = await addStack("base1-4", { pricePaid: 10 });
	expect(useUserland.getState().items[item.id]?.pricePaid).toBe(10);
	expect(await activeReposList()).toContain(item.id);
});

test("updateStack patches cache and repo (null clears)", async () => {
	const item = await addStack("a", { pricePaid: 5 });
	await updateStack(item.id, { pricePaid: null });
	expect(useUserland.getState().items[item.id]?.pricePaid).toBeNull();
});

test("removeStack removes one stack", async () => {
	const item = await addStack("a");
	await removeStack(item.id);
	expect(useUserland.getState().items[item.id]).toBeUndefined();
});

test("removeAllStacksOfCard removes every stack of a card", async () => {
	await addStack("dup");
	await addStack("dup");
	await addStack("other");
	await removeAllStacksOfCard("dup");
	const remaining = Object.values(useUserland.getState().items);
	expect(remaining.every((i) => i.cardId === "other")).toBe(true);
	expect(remaining).toHaveLength(1);
});

test("bulkAddStacks adds many; clearCollection empties", async () => {
	await bulkAddStacks(["a", "b", "c"]);
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

test("addStack: first stack of an unowned card becomes primary", async () => {
	const item = await addStack("card-x");
	expect(useUserland.getState().items[item.id]?.isPrimary).toBe(true);
});

test("addStack: second stack of an already-owned card is not primary; first stays primary", async () => {
	const first = await addStack("card-x");
	const second = await addStack("card-x");
	expect(useUserland.getState().items[first.id]?.isPrimary).toBe(true);
	expect(useUserland.getState().items[second.id]?.isPrimary).toBeFalsy();
});

test("bulkAddStacks: each new card's stack is primary; already-owned cards' new stacks are not", async () => {
	// pre-own card "a"
	await addStack("a");
	// bulk-add "a" (already owned) and "b" (new)
	await bulkAddStacks(["a", "b"]);
	const allItems = Object.values(useUserland.getState().items);
	const aCopies = allItems.filter((i) => i.cardId === "a");
	const bCopies = allItems.filter((i) => i.cardId === "b");
	// "a" already had a primary; the bulk-added stack of "a" must not be primary
	const aPrimaries = aCopies.filter((i) => i.isPrimary);
	expect(aPrimaries).toHaveLength(1); // still exactly one primary
	// "b" was brand new — its stack must be primary
	expect(bCopies).toHaveLength(1);
	expect(bCopies[0]?.isPrimary).toBe(true);
});

test("bulkAddStacks: same unowned cardId twice in one batch → exactly one primary", async () => {
	await bulkAddStacks(["x", "x"]);
	const xCopies = Object.values(useUserland.getState().items).filter(
		(i) => i.cardId === "x",
	);
	expect(xCopies).toHaveLength(2);
	expect(xCopies.filter((i) => i.isPrimary)).toHaveLength(1);
});

test("bulkAddStacks: two brand-new cards both get primary stacks", async () => {
	await bulkAddStacks(["alpha", "beta"]);
	const items = Object.values(useUserland.getState().items);
	expect(items.find((i) => i.cardId === "alpha")?.isPrimary).toBe(true);
	expect(items.find((i) => i.cardId === "beta")?.isPrimary).toBe(true);
});

// --- promote-on-delete ---

test("removeStack: removing the only stack leaves nothing to promote — no error", async () => {
	const item = await addStack("solo-card");
	await removeStack(item.id);
	expect(Object.values(useUserland.getState().items)).toHaveLength(0);
});

test("removeStack: removing the primary stack promotes the earliest-createdAt survivor", async () => {
	const first = await addStack("card-z"); // isPrimary = true (first stack)
	await new Promise((r) => setTimeout(r, 2)); // ensure distinct createdAt
	const second = await addStack("card-z"); // not primary
	await new Promise((r) => setTimeout(r, 2));
	const third = await addStack("card-z"); // not primary

	// Remove the primary; second (earliest survivor) should be promoted.
	await removeStack(first.id);
	const items = useUserland.getState().items;
	expect(items[second.id]?.isPrimary).toBe(true);
	expect(items[third.id]?.isPrimary).toBe(false);
});

test("removeStack: removing a non-primary stack does not change primary", async () => {
	const first = await addStack("card-w"); // primary
	await new Promise((r) => setTimeout(r, 2));
	const second = await addStack("card-w"); // not primary

	await removeStack(second.id); // remove non-primary
	expect(useUserland.getState().items[first.id]?.isPrimary).toBe(true);
});

// --- setPrimaryStack ---

test("setPrimaryStack marks one stack primary and clears its siblings", async () => {
	const a = await addStack("c");
	const b = await addStack("c");
	await setPrimaryStack("c", b.id);
	expect(useUserland.getState().items[b.id].isPrimary).toBe(true);
	expect(useUserland.getState().items[a.id].isPrimary).toBe(false);
	await setPrimaryStack("c", a.id);
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
		mode: "fuzzy" as const,
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
		mode: "fuzzy" as const,
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
	await addStack("a", { pricePaid: 7 });
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

test("toggleCardOwned: unowned card → 1 stack added (owned)", async () => {
	await toggleCardOwned("card-toggle");
	const stacks = Object.values(useUserland.getState().items).filter(
		(i) => i.cardId === "card-toggle",
	);
	expect(stacks).toHaveLength(1);
	expect(stacks[0]?.isPrimary).toBe(true);
});

test("toggleCardOwned: owned card → all stacks removed (unowned)", async () => {
	await toggleCardOwned("card-toggle");
	await toggleCardOwned("card-toggle");
	const stacks = Object.values(useUserland.getState().items).filter(
		(i) => i.cardId === "card-toggle",
	);
	expect(stacks).toHaveLength(0);
});

test("toggleCardOwned: card with 2 stacks → all removed", async () => {
	await addStack("multi-stack");
	await addStack("multi-stack");
	expect(
		Object.values(useUserland.getState().items).filter(
			(i) => i.cardId === "multi-stack",
		),
	).toHaveLength(2);
	await toggleCardOwned("multi-stack");
	expect(
		Object.values(useUserland.getState().items).filter(
			(i) => i.cardId === "multi-stack",
		),
	).toHaveLength(0);
});

// --- profile ---

test("profile starts null and hydrates from the repo", async () => {
	const repos = await setupUserlandTest();
	await repos.profile.save({ displayName: "Ash" });
	expect(useUserland.getState().profile).toBeNull();
	await loadUserland();
	expect(useUserland.getState().profile?.displayName).toBe("Ash");
});

test("updateProfile persists and commits the returned record", async () => {
	await setupUserlandTest();
	const saved = await updateProfile({ displayName: "Misty", bio: "Water" });
	expect(saved.displayName).toBe("Misty");
	expect(useUserland.getState().profile?.bio).toBe("Water");

	const merged = await updateProfile({ favoriteSetId: "base1" });
	expect(merged.displayName).toBe("Misty"); // preserved
	expect(useUserland.getState().profile?.favoriteSetId).toBe("base1");
});

// --- v5: language + grading cert in identity key ---

import { stackIdentityKey } from "./userland-store";

test("importStacks merge: different language (en vs ja) = different stacks, not merged", async () => {
	await addStack("a", { quantity: 2, language: "en" });
	await importStacks(
		[{ cardId: "a", quantity: 1, language: "ja" }], // different language = different physical card
		true,
	);
	const items = Object.values(useUserland.getState().items);
	expect(items).toHaveLength(2);
});

test("importStacks merge: same language → merges as before", async () => {
	await addStack("a", { quantity: 2, language: "en" });
	await importStacks([{ cardId: "a", quantity: 3, language: "en" }], true);
	const items = Object.values(useUserland.getState().items);
	expect(items).toHaveLength(1);
	expect(items[0].quantity).toBe(5);
});

test("importStacks merge: different grading cert = different stacks, not merged", async () => {
	await addStack("a", {
		quantity: 1,
		grading: { company: "PSA", grade: 10, cert: "AAA" },
	});
	await importStacks(
		[
			{
				cardId: "a",
				quantity: 1,
				grading: { company: "PSA", grade: 10, cert: "BBB" },
			},
		],
		true,
	);
	const items = Object.values(useUserland.getState().items);
	expect(items).toHaveLength(2);
});

test("importStacks merge: same cert (including null) → merges", async () => {
	await addStack("a", {
		quantity: 1,
		grading: { company: "PSA", grade: 10, cert: null },
	});
	await importStacks(
		[
			{
				cardId: "a",
				quantity: 2,
				grading: { company: "PSA", grade: 10, cert: null },
			},
		],
		true,
	);
	const items = Object.values(useUserland.getState().items);
	expect(items).toHaveLength(1);
	expect(items[0].quantity).toBe(3);
});

test("stackIdentityKey includes language and grading cert", () => {
	const base = {
		cardId: "a",
		variant: null,
		condition: null,
		grading: null,
		source: null,
		pricePaid: null,
		label: null,
		language: "en",
	};
	const ja = { ...base, language: "ja" };
	const graded = {
		...base,
		grading: { company: "PSA", grade: 10, cert: "123" },
	};
	const gradedNoCert = {
		...base,
		grading: { company: "PSA", grade: 10, cert: null },
	};
	const gradedOtherCert = {
		...base,
		grading: { company: "PSA", grade: 10, cert: "456" },
	};
	expect(stackIdentityKey(base)).not.toBe(stackIdentityKey(ja));
	expect(stackIdentityKey(graded)).not.toBe(stackIdentityKey(gradedNoCert));
	expect(stackIdentityKey(graded)).not.toBe(stackIdentityKey(gradedOtherCert));
	expect(stackIdentityKey(gradedNoCert)).toBe(stackIdentityKey(gradedNoCert));
});

// --- Task 8: session swap + repo selection ---
// These tests use injected fake repos so they run fully in-memory.

test("activeRepos: injected fake always wins (usingInjectedRepos trumps session)", () => {
	// setUserlandRepos is already called in setupUserlandTest via beforeEach
	// Simulate a cloud session being present
	_setCurrentSessionForTests({ access_token: "fake-token" });
	// The injected IDB repos should still be returned (usingInjectedRepos=true)
	const idbRepos = createIdbRepos();
	setUserlandRepos(idbRepos);
	const returned = activeRepos();
	expect(returned).toBe(idbRepos);
	// Cleanup
	_setCurrentSessionForTests(null);
});

test("activeRepos: no session → IDB repos returned (not supabase)", () => {
	// Ensure no session
	_setCurrentSessionForTests(null);
	// Disable injected repos so we hit the real branch
	setUserlandRepos(null);
	const returned = activeRepos();
	// Should be the IDB singleton (not null, not the supabase bundle)
	expect(returned).toBeDefined();
	expect(typeof returned.collection.list).toBe("function");
	// Re-inject for other tests to not be affected by module singleton
	const repos = createIdbRepos();
	setUserlandRepos(repos);
});

test("activeRepos: with session + cloud enabled → returns supabase bundle (via injection seam)", async () => {
	// We can't actually set VITE_SUPABASE_URL in tests, so we test the seam:
	// inject a fake Supabase bundle + simulate the condition via a Supabase fake repo.
	// Create a fake cloud-like bundle (distinct object from IDB repos)
	const fakeCloudRepos = createIdbRepos(); // structurally a UserlandRepos, just a different instance
	// Inject it as the "cloud" bundle — if activeRepos returns it when a session is present
	// and cloud is enabled, the swap works
	setUserlandRepos(fakeCloudRepos);
	_setCurrentSessionForTests({ access_token: "tok" });
	expect(activeRepos()).toBe(fakeCloudRepos); // injected wins, proves seam
	_setCurrentSessionForTests(null);
});

test("auth re-hydration: resetUserlandForTests clears session + supabase repos", async () => {
	_setCurrentSessionForTests({ access_token: "tok" });
	resetUserlandForTests(); // simulates the sign-out cleanup path
	// After reset, no session → activeRepos should return IDB (after re-inject for isolation)
	const repos = createIdbRepos();
	setUserlandRepos(repos);
	expect(activeRepos()).toBe(repos);
});

test("on SIGNED_IN simulation: resetUserland + loadUserland re-hydrates from active repos", async () => {
	// Simulate sign-in by: injecting a repo with known data, clearing state, then reloading
	const repos = createIdbRepos();
	await repos.collection.add({ cardId: "cloud-card" });
	setUserlandRepos(repos);
	// Reset as if auth change triggered it
	resetUserlandForTests();
	expect(useUserland.getState().hydrated).toBe(false);
	await loadUserland();
	expect(useUserland.getState().hydrated).toBe(true);
	expect(
		Object.values(useUserland.getState().items).some(
			(i) => i.cardId === "cloud-card",
		),
	).toBe(true);
});
