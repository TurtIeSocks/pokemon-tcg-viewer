// src/store/userland/backup.test.ts
import { expect, test } from "bun:test";
import { isValidSnapshot, parseSnapshot, snapshotFilename } from "./backup";
import type { UserDataSnapshot } from "./types";

const good: UserDataSnapshot = {
	schemaVersion: 5,
	exportedAt: 0,
	collection: [
		{
			id: "1",
			cardId: "a",
			quantity: 1,
			source: null,
			storageLocation: null,
			acquiredAt: 1,
			createdAt: 1,
			updatedAt: 1,
			deletedAt: null,
			label: null,
			pricePaid: null,
			currency: "USD",
			language: "en",
			variant: null,
			notes: null,
			condition: null,
			grading: null,
			isPrimary: false,
		},
	],
	binders: [
		{
			id: "b1",
			name: "My Binder",
			description: null,
			rules: [],
			includeCardIds: [],
			excludeCardIds: [],
			createdAt: 1,
			updatedAt: 1,
			deletedAt: null,
		},
	],
	profile: null,
};

test("isValidSnapshot accepts a v2 snapshot", () => {
	expect(isValidSnapshot({ ...good, schemaVersion: 2 })).toBe(true);
});

test("isValidSnapshot accepts a snapshot with empty binders", () => {
	expect(isValidSnapshot({ ...good, binders: [] })).toBe(true);
});

test("isValidSnapshot rejects unsupported version / shape", () => {
	expect(isValidSnapshot({ ...good, schemaVersion: 0 })).toBe(false);
	expect(isValidSnapshot({ ...good, collection: "x" })).toBe(false);
	expect(
		isValidSnapshot({ ...good, collection: [{ id: 1, cardId: "a" }] }),
	).toBe(false);
	expect(isValidSnapshot(null)).toBe(false);
	expect(isValidSnapshot({ schemaVersion: 1 })).toBe(false);
});

test("isValidSnapshot rejects snapshot missing binders", () => {
	const { binders: _b, ...withoutBinders } = good;
	expect(isValidSnapshot(withoutBinders)).toBe(false);
});

test("isValidSnapshot rejects snapshot with goals instead of binders", () => {
	// Old snapshot format with goals field but no binders
	expect(
		isValidSnapshot({
			schemaVersion: 1,
			exportedAt: 0,
			collection: [],
			goals: [],
		}),
	).toBe(false);
});

test("isValidSnapshot rejects binder item missing id", () => {
	expect(
		isValidSnapshot({
			...good,
			binders: [{ name: "No id binder" }],
		}),
	).toBe(false);
});

test("isValidSnapshot rejects binder item missing name", () => {
	expect(
		isValidSnapshot({
			...good,
			binders: [{ id: "b1" }],
		}),
	).toBe(false);
});

test("parseSnapshot returns the snapshot for valid JSON", () => {
	expect(parseSnapshot(JSON.stringify(good))).toEqual(good);
});

test("parseSnapshot throws on bad JSON and bad shape", () => {
	expect(() => parseSnapshot("{not json")).toThrow();
	expect(() => parseSnapshot(JSON.stringify({ schemaVersion: 9 }))).toThrow();
});

test("parseSnapshot throws when binders is missing", () => {
	const { binders: _b, ...withoutBinders } = good;
	expect(() => parseSnapshot(JSON.stringify(withoutBinders))).toThrow();
});

test("parseSnapshot upgrades a v1 snapshot to v5 (quantity=1, dollars→cents, null provenance, language=en)", () => {
	const v1 = JSON.stringify({
		schemaVersion: 1,
		exportedAt: 0,
		collection: [
			{
				id: "a",
				cardId: "base1-4",
				acquiredAt: 0,
				createdAt: 0,
				pricePaid: 3.5, // dollars in the old schema
				variant: null,
				notes: null,
				condition: null,
				grading: null,
			},
		],
		binders: [],
	});
	const snap = parseSnapshot(v1);
	expect(snap.schemaVersion).toBe(5);
	expect(snap.collection[0].quantity).toBe(1);
	expect(snap.collection[0].pricePaid).toBe(350); // $3.50 → 350 cents
	expect(snap.collection[0].currency).toBe("USD");
	expect(snap.collection[0].language).toBe("en");
	expect(snap.collection[0].deletedAt).toBeNull();
	expect(snap.collection[0].source).toBeNull();
	expect(snap.collection[0].storageLocation).toBeNull();
	expect(snap.profile).toBeNull();
});

test("parseSnapshot leaves a v4 snapshot's cents prices untouched (no double-scale) and upgrades to v5", () => {
	const v4 = {
		...good,
		schemaVersion: 4,
		collection: [{ ...good.collection[0], pricePaid: 350 }],
	};
	const snap = parseSnapshot(JSON.stringify(v4));
	expect(snap.schemaVersion).toBe(5);
	expect(snap.collection[0].pricePaid).toBe(350);
});

test("upgrade backfills required Stack fields on a minimal collection item", () => {
	// isValidSnapshot only guarantees id + cardId; everything else may be absent.
	const minimal = JSON.stringify({
		schemaVersion: 2,
		exportedAt: 0,
		collection: [{ id: "x", cardId: "base1-4" }],
		binders: [],
	});
	const s = parseSnapshot(minimal).collection[0];
	expect(s.quantity).toBe(1);
	expect(typeof s.createdAt).toBe("number");
	expect(s.acquiredAt).toBe(s.createdAt);
	expect(s.pricePaid).toBeNull();
	expect(s.variant).toBeNull();
	expect(s.notes).toBeNull();
	expect(s.condition).toBeNull();
	expect(s.grading).toBeNull();
	expect(s.source).toBeNull();
	expect(s.storageLocation).toBeNull();
});

test("isValidSnapshot accepts v1–v5; rejects other versions", () => {
	expect(isValidSnapshot({ ...good, schemaVersion: 1 })).toBe(true);
	expect(isValidSnapshot({ ...good, schemaVersion: 2 })).toBe(true);
	expect(isValidSnapshot({ ...good, schemaVersion: 3 })).toBe(true);
	expect(isValidSnapshot({ ...good, schemaVersion: 4 })).toBe(true);
	expect(isValidSnapshot({ ...good, schemaVersion: 5 })).toBe(true);
	expect(isValidSnapshot({ ...good, schemaVersion: 6 })).toBe(false);
});

test("parseSnapshot keeps a valid profile on a v3 snapshot", () => {
	const withProfile = {
		...good,
		profile: {
			id: "me",
			displayName: "Ash",
			bio: null,
			avatarPreset: "dusk",
			favoriteSetId: null,
			createdAt: 1,
			updatedAt: 1,
		},
	};
	const snap = parseSnapshot(JSON.stringify(withProfile));
	expect(snap.profile?.displayName).toBe("Ash");
});

test("parseSnapshot backfills a partial v3 profile (no undefined fields)", () => {
	const partial = {
		schemaVersion: 3,
		exportedAt: 0,
		collection: [],
		binders: [],
		profile: { id: "me" }, // every other field missing
	};
	const snap = parseSnapshot(JSON.stringify(partial));
	expect(snap.profile).toEqual({
		id: "me",
		displayName: "Collector",
		bio: null,
		avatarPreset: "dusk",
		favoriteSetId: null,
		createdAt: 0,
		updatedAt: 0,
		deletedAt: null,
	});
});

test("snapshotFilename formats the date", () => {
	expect(snapshotFilename(new Date("2026-06-02T10:00:00Z"))).toBe(
		"pokemon-tcg-collection-2026-06-02.json",
	);
});

// --- v5: language + grading cert ---

const goodV5: UserDataSnapshot = {
	schemaVersion: 5,
	exportedAt: 0,
	collection: [
		{
			id: "1",
			cardId: "a",
			quantity: 1,
			source: null,
			storageLocation: null,
			acquiredAt: 1,
			createdAt: 1,
			updatedAt: 1,
			deletedAt: null,
			label: null,
			pricePaid: null,
			currency: "USD",
			language: "en",
			variant: null,
			notes: null,
			condition: null,
			grading: null,
			isPrimary: false,
		},
	],
	binders: [],
	profile: null,
};

test("isValidSnapshot accepts v5", () => {
	expect(isValidSnapshot(goodV5)).toBe(true);
});

test("isValidSnapshot rejects v6", () => {
	expect(isValidSnapshot({ ...goodV5, schemaVersion: 6 })).toBe(false);
});

test("parseSnapshot upgrades a v4 snapshot to v5 — backfills language=en + grading cert=null", () => {
	const v4 = JSON.stringify({
		schemaVersion: 4,
		exportedAt: 0,
		collection: [
			{
				id: "1",
				cardId: "a",
				quantity: 1,
				acquiredAt: 1,
				createdAt: 1,
				updatedAt: 1,
				deletedAt: null,
				label: null,
				pricePaid: null,
				currency: "USD",
				variant: null,
				notes: null,
				condition: null,
				grading: { company: "PSA", grade: 10 },
				source: null,
				storageLocation: null,
				isPrimary: false,
			},
		],
		binders: [],
	});
	const snap = parseSnapshot(v4);
	expect(snap.schemaVersion).toBe(5);
	expect(snap.collection[0].language).toBe("en");
	expect(snap.collection[0].grading?.cert).toBeNull();
});

test("parseSnapshot preserves language on v4 snapshot that already has it", () => {
	const v4WithLang = JSON.stringify({
		schemaVersion: 4,
		exportedAt: 0,
		collection: [
			{
				id: "1",
				cardId: "a",
				quantity: 1,
				acquiredAt: 1,
				createdAt: 1,
				updatedAt: 1,
				deletedAt: null,
				label: null,
				pricePaid: null,
				currency: "USD",
				language: "ja",
				variant: null,
				notes: null,
				condition: null,
				grading: null,
				source: null,
				storageLocation: null,
				isPrimary: false,
			},
		],
		binders: [],
	});
	const snap = parseSnapshot(v4WithLang);
	expect(snap.collection[0].language).toBe("ja");
});

test("parseSnapshot passes a v5 snapshot through unchanged (language + cert preserved)", () => {
	const snap = parseSnapshot(JSON.stringify(goodV5));
	expect(snap.schemaVersion).toBe(5);
	expect(snap.collection[0].language).toBe("en");
});
