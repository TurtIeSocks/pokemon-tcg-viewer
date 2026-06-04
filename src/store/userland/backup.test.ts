// src/store/userland/backup.test.ts
import { expect, test } from "bun:test";
import { isValidSnapshot, parseSnapshot, snapshotFilename } from "./backup";
import type { UserDataSnapshot } from "./types";

const good: UserDataSnapshot = {
	schemaVersion: 1,
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
			pricePaid: null,
			variant: null,
			notes: null,
			condition: null,
			grading: null,
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
		},
	],
};

test("isValidSnapshot accepts a v1 snapshot", () => {
	expect(isValidSnapshot(good)).toBe(true);
});

test("isValidSnapshot accepts a v1 snapshot with empty binders", () => {
	expect(isValidSnapshot({ ...good, binders: [] })).toBe(true);
});

test("isValidSnapshot rejects wrong version / shape", () => {
	expect(isValidSnapshot({ ...good, schemaVersion: 2 })).toBe(false);
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

test("snapshotFilename formats the date", () => {
	expect(snapshotFilename(new Date("2026-06-02T10:00:00Z"))).toBe(
		"pokemon-tcg-collection-2026-06-02.json",
	);
});
