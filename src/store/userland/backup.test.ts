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
			acquiredAt: 1,
			createdAt: 1,
			pricePaid: null,
			variant: null,
			notes: null,
			condition: null,
			grading: null,
		},
	],
	goals: [
		{
			id: "g1",
			name: "G",
			description: null,
			targets: [],
			createdAt: 1,
			updatedAt: 1,
		},
	],
};

test("isValidSnapshot accepts a v1 snapshot", () => {
	expect(isValidSnapshot(good)).toBe(true);
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

test("parseSnapshot returns the snapshot for valid JSON", () => {
	expect(parseSnapshot(JSON.stringify(good))).toEqual(good);
});

test("parseSnapshot throws on bad JSON and bad shape", () => {
	expect(() => parseSnapshot("{not json")).toThrow();
	expect(() => parseSnapshot(JSON.stringify({ schemaVersion: 9 }))).toThrow();
});

test("snapshotFilename formats the date", () => {
	expect(snapshotFilename(new Date("2026-06-02T10:00:00Z"))).toBe(
		"pokemon-tcg-collection-2026-06-02.json",
	);
});
