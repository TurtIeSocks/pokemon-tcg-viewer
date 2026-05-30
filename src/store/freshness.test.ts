import { expect, test } from "bun:test";
import { shouldRefetch } from "./freshness";

const DAY = 24 * 60 * 60 * 1000;

test("cards: never-fetched is stale", () => {
	expect(shouldRefetch({ lastFetchedAt: null, kind: "cards" })).toBe(true);
});

test("cards: fetched 1h ago is fresh", () => {
	expect(
		shouldRefetch({
			lastFetchedAt: Date.now() - 60 * 60 * 1000,
			kind: "cards",
		}),
	).toBe(false);
});

test("cards: fetched 25h ago is stale", () => {
	expect(
		shouldRefetch({
			lastFetchedAt: Date.now() - 25 * 60 * 60 * 1000,
			kind: "cards",
		}),
	).toBe(true);
});

test("cards TTL is one day", () => {
	expect(
		shouldRefetch({ lastFetchedAt: Date.now() - (DAY - 1000), kind: "cards" }),
	).toBe(false);
	expect(
		shouldRefetch({ lastFetchedAt: Date.now() - (DAY + 1000), kind: "cards" }),
	).toBe(true);
});
