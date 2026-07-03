// src/store/userland/sync/cache-repo.test.ts
import { describe, expect, test } from "bun:test";
import { allRows, clearDirty, createCacheRepos, dirtyIds } from "./cache-repo";

// fake-indexeddb is preloaded via bunfig.toml; no explicit import needed.
// Each test uses distinct uid strings to achieve store isolation.

const UID_A = crypto.randomUUID();

// ---------------------------------------------------------------------------
// Collection (stack) dirty-marking tests
// ---------------------------------------------------------------------------

describe("cache-repo collection", () => {
	test("add marks row dirty", async () => {
		const repos = createCacheRepos(UID_A);
		const stack = await repos.collection.add({ cardId: "sv1-1" });
		const dirty = await dirtyIds(UID_A, "stacks");
		expect(dirty.has(stack.id)).toBe(true);
	});

	test("bulkAdd marks all rows dirty", async () => {
		const uid = crypto.randomUUID();
		const repos = createCacheRepos(uid);
		const stacks = await repos.collection.bulkAdd([
			{ cardId: "sv1-2" },
			{ cardId: "sv1-3" },
		]);
		const dirty = await dirtyIds(uid, "stacks");
		for (const s of stacks) {
			expect(dirty.has(s.id)).toBe(true);
		}
	});

	test("update marks row dirty", async () => {
		const uid = crypto.randomUUID();
		const repos = createCacheRepos(uid);
		const stack = await repos.collection.add({ cardId: "sv1-4" });
		await clearDirty(uid, "stacks", [stack.id]);
		// Confirm cleared
		expect((await dirtyIds(uid, "stacks")).has(stack.id)).toBe(false);
		// Update re-marks
		await repos.collection.update(stack.id, { notes: "updated" });
		expect((await dirtyIds(uid, "stacks")).has(stack.id)).toBe(true);
	});

	test("remove soft-deletes: deletedAt set, row stays in allRows, marked dirty", async () => {
		const uid = crypto.randomUUID();
		const repos = createCacheRepos(uid);
		const stack = await repos.collection.add({ cardId: "sv1-5" });
		await clearDirty(uid, "stacks", [stack.id]);

		await repos.collection.remove(stack.id);

		const all = await allRows(uid, "stacks");
		const row = all.find((s) => s.id === stack.id);
		expect(row).toBeDefined();
		expect(row?.deletedAt).not.toBeNull();

		const dirty = await dirtyIds(uid, "stacks");
		expect(dirty.has(stack.id)).toBe(true);
	});

	test("removeMany soft-deletes all rows, marks all dirty", async () => {
		const uid = crypto.randomUUID();
		const repos = createCacheRepos(uid);
		const [s1, s2] = await repos.collection.bulkAdd([
			{ cardId: "sv1-6" },
			{ cardId: "sv1-7" },
		]);
		await clearDirty(uid, "stacks", [s1.id, s2.id]);

		await repos.collection.removeMany([s1.id, s2.id]);

		const all = await allRows(uid, "stacks");
		for (const id of [s1.id, s2.id]) {
			const row = all.find((s) => s.id === id);
			expect(row?.deletedAt).not.toBeNull();
		}
		const dirty = await dirtyIds(uid, "stacks");
		expect(dirty.has(s1.id)).toBe(true);
		expect(dirty.has(s2.id)).toBe(true);
	});

	test("list filters out soft-deleted rows", async () => {
		const uid = crypto.randomUUID();
		const repos = createCacheRepos(uid);
		const [live, dead] = await repos.collection.bulkAdd([
			{ cardId: "sv1-8" },
			{ cardId: "sv1-9" },
		]);
		await repos.collection.remove(dead.id);

		const listed = await repos.collection.list();
		const ids = listed.map((s) => s.id);
		expect(ids).toContain(live.id);
		expect(ids).not.toContain(dead.id);
	});

	test("clearDirty removes specified ids from dirty set", async () => {
		const uid = crypto.randomUUID();
		const repos = createCacheRepos(uid);
		const [s1, s2] = await repos.collection.bulkAdd([
			{ cardId: "sv1-10" },
			{ cardId: "sv1-11" },
		]);
		await clearDirty(uid, "stacks", [s1.id]);
		const dirty = await dirtyIds(uid, "stacks");
		expect(dirty.has(s1.id)).toBe(false);
		expect(dirty.has(s2.id)).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Binders dirty-marking tests
// ---------------------------------------------------------------------------

describe("cache-repo binders", () => {
	test("create marks binder dirty", async () => {
		const uid = crypto.randomUUID();
		const repos = createCacheRepos(uid);
		const binder = await repos.binders.create({ name: "My Binder" });
		const dirty = await dirtyIds(uid, "binders");
		expect(dirty.has(binder.id)).toBe(true);
	});

	test("update marks binder dirty", async () => {
		const uid = crypto.randomUUID();
		const repos = createCacheRepos(uid);
		const binder = await repos.binders.create({ name: "My Binder" });
		await clearDirty(uid, "binders", [binder.id]);

		await repos.binders.update(binder.id, { name: "Renamed" });
		expect((await dirtyIds(uid, "binders")).has(binder.id)).toBe(true);
	});

	test("remove soft-deletes binder, marks dirty", async () => {
		const uid = crypto.randomUUID();
		const repos = createCacheRepos(uid);
		const binder = await repos.binders.create({ name: "To Delete" });
		await clearDirty(uid, "binders", [binder.id]);

		await repos.binders.remove(binder.id);

		const all = await allRows(uid, "binders");
		const row = all.find((b) => b.id === binder.id);
		expect(row?.deletedAt).not.toBeNull();

		expect((await dirtyIds(uid, "binders")).has(binder.id)).toBe(true);
	});

	test("list filters out soft-deleted binders", async () => {
		const uid = crypto.randomUUID();
		const repos = createCacheRepos(uid);
		const live = await repos.binders.create({ name: "Live" });
		const dead = await repos.binders.create({ name: "Dead" });
		await repos.binders.remove(dead.id);

		const listed = await repos.binders.list();
		const ids = listed.map((b) => b.id);
		expect(ids).toContain(live.id);
		expect(ids).not.toContain(dead.id);
	});
});

// ---------------------------------------------------------------------------
// Profile dirty-marking tests
// ---------------------------------------------------------------------------

describe("cache-repo profile", () => {
	test("save marks profile dirty", async () => {
		const uid = crypto.randomUUID();
		const repos = createCacheRepos(uid);
		const profile = await repos.profile.save({ displayName: "Alice" });
		const dirty = await dirtyIds(uid, "profiles");
		expect(dirty.has(profile.id)).toBe(true);
	});

	test("clearDirty + save re-marks dirty", async () => {
		const uid = crypto.randomUUID();
		const repos = createCacheRepos(uid);
		const profile = await repos.profile.save({ displayName: "Alice" });
		await clearDirty(uid, "profiles", [profile.id]);
		expect((await dirtyIds(uid, "profiles")).has(profile.id)).toBe(false);

		await repos.profile.save({ displayName: "Alice 2" });
		expect((await dirtyIds(uid, "profiles")).has(profile.id)).toBe(true);
	});

	test("save serializes overlapping saves (no lost update)", async () => {
		const uid = crypto.randomUUID();
		const repos = createCacheRepos(uid);
		await Promise.all([
			repos.profile.save({ displayName: "A" }),
			repos.profile.save({ bio: "B" }),
		]);
		const stored = await repos.profile.get();
		expect(stored?.displayName).toBe("A");
		expect(stored?.bio).toBe("B");
	});
});

// ---------------------------------------------------------------------------
// Per-uid isolation
// ---------------------------------------------------------------------------

describe("cache-repo uid isolation", () => {
	test("distinct uids use distinct stores (no cross-contamination)", async () => {
		const uidX = crypto.randomUUID();
		const uidY = crypto.randomUUID();
		const reposX = createCacheRepos(uidX);
		const reposY = createCacheRepos(uidY);

		await reposX.collection.add({ cardId: "sv1-99" });

		// Y's store should be empty
		const yList = await reposY.collection.list();
		expect(yList).toHaveLength(0);

		// X's dirty set should not bleed into Y's
		const xDirty = await dirtyIds(uidX, "stacks");
		const yDirty = await dirtyIds(uidY, "stacks");
		expect(xDirty.size).toBeGreaterThan(0);
		expect(yDirty.size).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// allRows includes tombstones
// ---------------------------------------------------------------------------

describe("allRows", () => {
	test("allRows includes tombstoned rows; list does not", async () => {
		const uid = crypto.randomUUID();
		const repos = createCacheRepos(uid);
		const stack = await repos.collection.add({ cardId: "sv1-100" });
		await repos.collection.remove(stack.id);

		const all = await allRows(uid, "stacks");
		const listed = await repos.collection.list();

		expect(all.some((s) => s.id === stack.id)).toBe(true);
		expect(listed.some((s) => s.id === stack.id)).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// collection.clear() soft-delete tests
// ---------------------------------------------------------------------------

describe("collection.clear()", () => {
	test("clear soft-deletes all live rows: list returns empty, allRows has tombstones, all dirty", async () => {
		const uid = crypto.randomUUID();
		const repos = createCacheRepos(uid);
		const [s1, s2] = await repos.collection.bulkAdd([
			{ cardId: "sv1-200" },
			{ cardId: "sv1-201" },
		]);
		// Flush dirty so we can confirm clear re-marks
		await clearDirty(uid, "stacks", [s1.id, s2.id]);

		await repos.collection.clear();

		// list() returns nothing (tombstones filtered)
		const listed = await repos.collection.list();
		expect(listed).toHaveLength(0);

		// allRows still has the rows with deletedAt set
		const all = await allRows(uid, "stacks");
		for (const id of [s1.id, s2.id]) {
			const row = all.find((s) => s.id === id);
			expect(row).toBeDefined();
			expect(row?.deletedAt).not.toBeNull();
		}

		// Both ids are dirty (so tombstones push to cloud)
		const dirty = await dirtyIds(uid, "stacks");
		expect(dirty.has(s1.id)).toBe(true);
		expect(dirty.has(s2.id)).toBe(true);
	});

	test("clear on already-tombstoned rows does not double-add to dirty", async () => {
		const uid = crypto.randomUUID();
		const repos = createCacheRepos(uid);
		const stack = await repos.collection.add({ cardId: "sv1-202" });
		// Already soft-deleted
		await repos.collection.remove(stack.id);
		await clearDirty(uid, "stacks", [stack.id]);

		// clear() only soft-deletes LIVE rows; tombstoned ones are skipped
		await repos.collection.clear();

		const dirty = await dirtyIds(uid, "stacks");
		// Already tombstoned before clear, so NOT re-touched by clear
		expect(dirty.has(stack.id)).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// backup.importAll dirty-marking tests
// ---------------------------------------------------------------------------

describe("backup.importAll", () => {
	const makeSnapshot = (cardIds: string[], binderNames: string[]) => ({
		schemaVersion: 5 as const,
		exportedAt: Date.now(),
		collection: cardIds.map((cardId) => ({
			id: crypto.randomUUID(),
			cardId,
			quantity: 1,
			createdAt: Date.now(),
			updatedAt: Date.now(),
			acquiredAt: Date.now(),
			deletedAt: null as null,
			label: null,
			pricePaid: null,
			currency: "USD" as const,
			language: "en" as const,
			variant: null,
			printing: null,
			notes: null,
			condition: null,
			grading: null,
			source: null,
			storageLocation: null,
			isPrimary: false,
		})),
		binders: binderNames.map((name) => ({
			id: crypto.randomUUID(),
			name,
			description: null,
			rules: [] as [],
			includeCardIds: [] as string[],
			excludeCardIds: [] as string[],
			createdAt: Date.now(),
			updatedAt: Date.now(),
			deletedAt: null as null,
		})),
		profile: null,
	});

	test("importAll(merge) marks all written stack+binder ids dirty", async () => {
		const uid = crypto.randomUUID();
		const repos = createCacheRepos(uid);
		const snapshot = makeSnapshot(["sv1-300", "sv1-301"], ["Binder A"]);

		await repos.backup.importAll(snapshot, "merge");

		const stackDirty = await dirtyIds(uid, "stacks");
		for (const s of snapshot.collection) {
			expect(stackDirty.has(s.id)).toBe(true);
		}
		const binderDirty = await dirtyIds(uid, "binders");
		for (const b of snapshot.binders) {
			expect(binderDirty.has(b.id)).toBe(true);
		}
	});

	test("importAll(replace) tombstones existing rows AND marks new snapshot ids dirty", async () => {
		const uid = crypto.randomUUID();
		const repos = createCacheRepos(uid);

		// Pre-existing rows
		const [old1] = await repos.collection.bulkAdd([{ cardId: "sv1-400" }]);
		const oldBinder = await repos.binders.create({ name: "Old Binder" });
		await clearDirty(uid, "stacks", [old1.id]);
		await clearDirty(uid, "binders", [oldBinder.id]);

		const snapshot = makeSnapshot(["sv1-401"], ["New Binder"]);
		await repos.backup.importAll(snapshot, "replace");

		// Old row should be tombstoned and dirty
		const allStacks = await allRows(uid, "stacks");
		const oldRow = allStacks.find((s) => s.id === old1.id);
		expect(oldRow?.deletedAt).not.toBeNull();
		const stackDirty = await dirtyIds(uid, "stacks");
		expect(stackDirty.has(old1.id)).toBe(true);

		const allBinders = await allRows(uid, "binders");
		const oldBinderRow = allBinders.find((b) => b.id === oldBinder.id);
		expect(oldBinderRow?.deletedAt).not.toBeNull();
		const binderDirty = await dirtyIds(uid, "binders");
		expect(binderDirty.has(oldBinder.id)).toBe(true);

		// New snapshot rows must also be dirty
		for (const s of snapshot.collection) {
			expect(stackDirty.has(s.id)).toBe(true);
		}
		for (const b of snapshot.binders) {
			expect(binderDirty.has(b.id)).toBe(true);
		}

		// list() only shows new snapshot rows (old ones are tombstoned)
		const listed = await repos.collection.list();
		const ids = listed.map((s) => s.id);
		expect(ids).not.toContain(old1.id);
		expect(ids).toContain(snapshot.collection[0].id);
	});

	test("importAll with profile marks profile dirty", async () => {
		const uid = crypto.randomUUID();
		const repos = createCacheRepos(uid);
		const snapshot = {
			...makeSnapshot([], []),
			profile: {
				id: "me",
				displayName: "Alice",
				bio: null,
				avatarPreset: "default",
				favoriteSetId: null,
				displayLanguage: "en",
				displayCurrency: "USD",
				hideValue: false,
				createdAt: Date.now(),
				updatedAt: Date.now(),
				deletedAt: null as null,
			},
		};

		await repos.backup.importAll(snapshot, "merge");

		const profileDirty = await dirtyIds(uid, "profiles");
		expect(profileDirty.has("me")).toBe(true);
	});
});
