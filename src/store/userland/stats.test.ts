// src/store/userland/stats.test.ts
import { expect, test } from "bun:test";
import { makeStack } from "../../test-utils";
import { earliestAcquired } from "./stats";

test("earliestAcquired returns null for an empty collection", () => {
	expect(earliestAcquired({})).toBeNull();
});

test("earliestAcquired returns the minimum acquiredAt", () => {
	const a = makeStack({ id: "a", acquiredAt: 300 });
	const b = makeStack({ id: "b", acquiredAt: 100 });
	const c = makeStack({ id: "c", acquiredAt: 200 });
	expect(earliestAcquired({ a, b, c })).toBe(100);
});
