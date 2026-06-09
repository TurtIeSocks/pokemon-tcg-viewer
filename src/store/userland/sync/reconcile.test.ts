// src/store/userland/sync/reconcile.test.ts
import { describe, expect, test } from "bun:test";
import type { Binder, Profile, Stack } from "../types";
import {
	reconcileBinders,
	reconcileProfiles,
	reconcileStacks,
} from "./reconcile";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStack(id: string, overrides: Partial<Stack> = {}): Stack {
	return {
		id,
		cardId: "sv1-1",
		quantity: 1,
		acquiredAt: 1000,
		createdAt: 1000,
		updatedAt: 2000,
		deletedAt: null,
		label: null,
		pricePaid: null,
		currency: "USD",
		language: "en",
		variant: null,
		notes: null,
		condition: null,
		grading: null,
		source: null,
		storageLocation: null,
		isPrimary: false,
		...overrides,
	};
}

function makeProfile(id: string, overrides: Partial<Profile> = {}): Profile {
	return {
		id,
		displayName: "Collector",
		bio: null,
		avatarPreset: "default",
		favoriteSetId: null,
		createdAt: 1000,
		updatedAt: 2000,
		deletedAt: null,
		...overrides,
	};
}

function makeBinder(id: string, overrides: Partial<Binder> = {}): Binder {
	return {
		id,
		name: "Test Binder",
		description: null,
		rules: [],
		includeCardIds: [],
		excludeCardIds: [],
		createdAt: 1000,
		updatedAt: 2000,
		deletedAt: null,
		...overrides,
	};
}

// ---------------------------------------------------------------------------
// reconcileStacks (row-LWW)
// ---------------------------------------------------------------------------

describe("reconcileStacks", () => {
	test("pulled row, cache NOT dirty → accept pulled (cloud wins)", () => {
		const pulled = makeStack("s1", { updatedAt: 9000 });
		const cached = makeStack("s1", { updatedAt: 5000 });
		const result = reconcileStacks({
			cache: new Map([["s1", cached]]),
			pulled: [pulled],
			dirtyIds: new Set(),
		});
		expect(result.merged.get("s1")).toEqual(pulled);
		expect(result.toPush).toHaveLength(0);
	});

	test("pulled row, cache dirty → keep local, put in toPush (local wins)", () => {
		const pulled = makeStack("s1", { updatedAt: 9000, notes: "cloud note" });
		const cached = makeStack("s1", { updatedAt: 5000, notes: "local note" });
		const result = reconcileStacks({
			cache: new Map([["s1", cached]]),
			pulled: [pulled],
			dirtyIds: new Set(["s1"]),
		});
		expect(result.merged.get("s1")).toEqual(cached);
		expect(result.toPush).toContainEqual(cached);
	});

	test("pulled tombstone, cache NOT dirty → merged row has deletedAt set", () => {
		const tombstone = makeStack("s1", { deletedAt: 8000 });
		const cached = makeStack("s1", { deletedAt: null });
		const result = reconcileStacks({
			cache: new Map([["s1", cached]]),
			pulled: [tombstone],
			dirtyIds: new Set(),
		});
		expect(result.merged.get("s1")?.deletedAt).toBe(8000);
		expect(result.toPush).toHaveLength(0);
	});

	test("pulled tombstone, cache dirty → keep local (resurrect path)", () => {
		const tombstone = makeStack("s1", { deletedAt: 8000 });
		const cached = makeStack("s1", { deletedAt: null, notes: "alive" });
		const result = reconcileStacks({
			cache: new Map([["s1", cached]]),
			pulled: [tombstone],
			dirtyIds: new Set(["s1"]),
		});
		// local wins — keep live row, push it back
		expect(result.merged.get("s1")?.deletedAt).toBeNull();
		expect(result.toPush).toContainEqual(cached);
	});

	test("dirty id NOT in pulled → still in toPush (local change cloud hasn't seen)", () => {
		const cached = makeStack("s2", { notes: "unseen" });
		const result = reconcileStacks({
			cache: new Map([["s2", cached]]),
			pulled: [],
			dirtyIds: new Set(["s2"]),
		});
		expect(result.merged.get("s2")).toEqual(cached);
		expect(result.toPush).toContainEqual(cached);
	});

	test("empty pulled + empty dirty → no-op (merged == cache, toPush empty)", () => {
		const cached = makeStack("s3");
		const result = reconcileStacks({
			cache: new Map([["s3", cached]]),
			pulled: [],
			dirtyIds: new Set(),
		});
		expect(result.merged.size).toBe(1);
		expect(result.merged.get("s3")).toEqual(cached);
		expect(result.toPush).toHaveLength(0);
	});

	test("completely empty inputs → empty merged + empty toPush", () => {
		const result = reconcileStacks({
			cache: new Map(),
			pulled: [],
			dirtyIds: new Set(),
		});
		expect(result.merged.size).toBe(0);
		expect(result.toPush).toHaveLength(0);
	});

	test("new pulled row not in cache → accept into merged", () => {
		const pulled = makeStack("new1");
		const result = reconcileStacks({
			cache: new Map(),
			pulled: [pulled],
			dirtyIds: new Set(),
		});
		expect(result.merged.get("new1")).toEqual(pulled);
		expect(result.toPush).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// reconcileProfiles (row-LWW, same semantics)
// ---------------------------------------------------------------------------

describe("reconcileProfiles", () => {
	test("pulled profile, cache NOT dirty → accept pulled", () => {
		const pulled = makeProfile("me", { displayName: "Cloud Name" });
		const cached = makeProfile("me", { displayName: "Local Name" });
		const result = reconcileProfiles({
			cache: new Map([["me", cached]]),
			pulled: [pulled],
			dirtyIds: new Set(),
		});
		expect(result.merged.get("me")?.displayName).toBe("Cloud Name");
		expect(result.toPush).toHaveLength(0);
	});

	test("pulled profile, cache dirty → keep local, put in toPush", () => {
		const pulled = makeProfile("me", { displayName: "Cloud Name" });
		const cached = makeProfile("me", { displayName: "Local Name" });
		const result = reconcileProfiles({
			cache: new Map([["me", cached]]),
			pulled: [pulled],
			dirtyIds: new Set(["me"]),
		});
		expect(result.merged.get("me")?.displayName).toBe("Local Name");
		expect(result.toPush).toContainEqual(cached);
	});

	test("dirty profile NOT in pulled → still in toPush", () => {
		const cached = makeProfile("me", { displayName: "Local Only" });
		const result = reconcileProfiles({
			cache: new Map([["me", cached]]),
			pulled: [],
			dirtyIds: new Set(["me"]),
		});
		expect(result.toPush).toContainEqual(cached);
	});

	test("empty pulled + empty dirty → no-op", () => {
		const cached = makeProfile("me");
		const result = reconcileProfiles({
			cache: new Map([["me", cached]]),
			pulled: [],
			dirtyIds: new Set(),
		});
		expect(result.merged.get("me")).toEqual(cached);
		expect(result.toPush).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// reconcileBinders (array-merge)
// ---------------------------------------------------------------------------

describe("reconcileBinders", () => {
	test("pulled binder, cache NOT dirty → accept pulled", () => {
		const pulled = makeBinder("b1", { name: "Cloud Name" });
		const cached = makeBinder("b1", { name: "Local Name" });
		const result = reconcileBinders({
			cache: new Map([["b1", cached]]),
			pulled: [pulled],
			dirtyIds: new Set(),
		});
		expect(result.merged.get("b1")?.name).toBe("Cloud Name");
		expect(result.toPush).toHaveLength(0);
	});

	test("binder dirty + pulled → union includeCardIds, union excludeCardIds, rules merged by id; result in toPush", () => {
		const localBinder = makeBinder("b1", {
			includeCardIds: ["cardA", "cardB"],
			excludeCardIds: ["cardX"],
			rules: [
				{
					id: "r1",
					query: {
						text: "local-r1",
						setId: null,
						dexNumber: null,
						types: [],
						rarities: [],
						supertypes: [],
						subtypes: [],
						yearMin: null,
						yearMax: null,
						mode: "fuzzy",
					},
				},
				{
					id: "r2",
					query: {
						text: "local-r2",
						setId: null,
						dexNumber: null,
						types: [],
						rarities: [],
						supertypes: [],
						subtypes: [],
						yearMin: null,
						yearMax: null,
						mode: "fuzzy",
					},
				},
			],
		});
		const pulledBinder = makeBinder("b1", {
			includeCardIds: ["cardB", "cardC"],
			excludeCardIds: ["cardY"],
			rules: [
				{
					id: "r1",
					query: {
						text: "cloud-r1",
						setId: null,
						dexNumber: null,
						types: [],
						rarities: [],
						supertypes: [],
						subtypes: [],
						yearMin: null,
						yearMax: null,
						mode: "fuzzy",
					},
				},
				{
					id: "r3",
					query: {
						text: "cloud-r3",
						setId: null,
						dexNumber: null,
						types: [],
						rarities: [],
						supertypes: [],
						subtypes: [],
						yearMin: null,
						yearMax: null,
						mode: "fuzzy",
					},
				},
			],
		});
		const result = reconcileBinders({
			cache: new Map([["b1", localBinder]]),
			pulled: [pulledBinder],
			dirtyIds: new Set(["b1"]),
		});
		const merged = result.merged.get("b1")!;
		// union includeCardIds
		expect(merged.includeCardIds.sort()).toEqual(
			["cardA", "cardB", "cardC"].sort(),
		);
		// union excludeCardIds
		expect(merged.excludeCardIds.sort()).toEqual(["cardX", "cardY"].sort());
		// rules: local r1 wins (same id), r2 kept (local only), r3 added (cloud only)
		const ruleIds = merged.rules.map((r) => r.id).sort();
		expect(ruleIds).toEqual(["r1", "r2", "r3"].sort());
		const r1 = merged.rules.find((r) => r.id === "r1")!;
		expect(r1.query.text).toBe("local-r1"); // local wins on same id
		// result in toPush
		expect(result.toPush).toContainEqual(merged);
	});

	test("card in both include + exclude after merge → both lists kept (exclude wins at membership level, not here)", () => {
		const localBinder = makeBinder("b1", {
			includeCardIds: ["cardA"],
			excludeCardIds: [],
		});
		const pulledBinder = makeBinder("b1", {
			includeCardIds: [],
			excludeCardIds: ["cardA"],
		});
		const result = reconcileBinders({
			cache: new Map([["b1", localBinder]]),
			pulled: [pulledBinder],
			dirtyIds: new Set(["b1"]),
		});
		const merged = result.merged.get("b1")!;
		// Both lists contain cardA — no cross-deduplication
		expect(merged.includeCardIds).toContain("cardA");
		expect(merged.excludeCardIds).toContain("cardA");
	});

	test("pulled tombstone binder, cache NOT dirty → tombstone accepted", () => {
		const tombstone = makeBinder("b1", { deletedAt: 7000 });
		const cached = makeBinder("b1", { deletedAt: null });
		const result = reconcileBinders({
			cache: new Map([["b1", cached]]),
			pulled: [tombstone],
			dirtyIds: new Set(),
		});
		expect(result.merged.get("b1")?.deletedAt).toBe(7000);
		expect(result.toPush).toHaveLength(0);
	});

	test("dirty binder NOT in pulled → in toPush", () => {
		const cached = makeBinder("b2", { name: "Local Only" });
		const result = reconcileBinders({
			cache: new Map([["b2", cached]]),
			pulled: [],
			dirtyIds: new Set(["b2"]),
		});
		expect(result.toPush).toContainEqual(cached);
	});

	test("empty pulled + empty dirty → no-op", () => {
		const cached = makeBinder("b3");
		const result = reconcileBinders({
			cache: new Map([["b3", cached]]),
			pulled: [],
			dirtyIds: new Set(),
		});
		expect(result.merged.size).toBe(1);
		expect(result.toPush).toHaveLength(0);
	});
});
