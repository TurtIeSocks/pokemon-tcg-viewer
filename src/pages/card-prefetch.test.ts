import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const getCardById = mock(async (id: string) => ({ id }) as never);
mock.module("../api", () => ({ getCardById }));

// Import AFTER the module mock so the module binds the mocked api.
const { prefetchCard, getPrefetched } = await import("./card-prefetch");

beforeEach(() => getCardById.mockClear());
afterEach(() => getCardById.mockClear());

describe("card-prefetch", () => {
	test("prefetchCard fetches once and dedups concurrent calls for the same id", () => {
		prefetchCard("swsh4-43");
		prefetchCard("swsh4-43");
		expect(getCardById).toHaveBeenCalledTimes(1);
	});

	test("getPrefetched returns the in-flight promise after prefetch", async () => {
		const p = prefetchCard("base1-1");
		expect(getPrefetched("base1-1")).toBe(p);
		await p;
	});

	test("getPrefetched is undefined for an unseen id", () => {
		expect(getPrefetched("never")).toBeUndefined();
	});
});
