// src/store/userland/sync/cache-repo.test.ts
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { allRows, clearDirty, createCacheRepos, dirtyIds } from "./cache-repo";

// fake-indexeddb is preloaded via bunfig.toml; no explicit import needed.
// Each test uses distinct uid strings to achieve store isolation.

const UID_A = crypto.randomUUID();
const UID_B = crypto.randomUUID();

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
