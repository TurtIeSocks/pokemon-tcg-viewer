// src/store/userland/stats.test.ts
import { expect, test } from "bun:test";
import { renderHook } from "@testing-library/react";
import { makeStack, seedCorpus, setupUserlandTest } from "../../test-utils";
import { formatPrice } from "./money";
import { earliestAcquired, useCollectionStats } from "./stats";
import { useUserland } from "./userland-store";

test("earliestAcquired returns null for an empty collection", () => {
	expect(earliestAcquired({})).toBeNull();
});

test("earliestAcquired returns the minimum acquiredAt", () => {
	const a = makeStack({ id: "a", acquiredAt: 300 });
	const b = makeStack({ id: "b", acquiredAt: 100 });
	const c = makeStack({ id: "c", acquiredAt: 200 });
	expect(earliestAcquired({ a, b, c })).toBe(100);
});

test("useCollectionStats: estValueCurrency is the single currency when all priced stacks share one", async () => {
	await setupUserlandTest();
	seedCorpus([]);
	useUserland.setState({
		items: {
			a: makeStack({ id: "a", pricePaid: 500, currency: "USD", quantity: 1 }),
			b: makeStack({ id: "b", pricePaid: 250, currency: "USD", quantity: 2 }),
		},
	});
	const { result } = renderHook(() => useCollectionStats());
	expect(result.current.estValueCurrency).toBe("USD");
	expect(result.current.estValue).toBe(500 * 1 + 250 * 2);
});

test("useCollectionStats: estValueCurrency is null when priced stacks span multiple currencies", async () => {
	await setupUserlandTest();
	seedCorpus([]);
	useUserland.setState({
		items: {
			a: makeStack({ id: "a", pricePaid: 500, currency: "USD", quantity: 1 }),
			b: makeStack({ id: "b", pricePaid: 350, currency: "JPY", quantity: 1 }),
		},
	});
	const { result } = renderHook(() => useCollectionStats());
	expect(result.current.estValueCurrency).toBeNull();
});

test("useCollectionStats: a JPY-only collection sums the raw yen and reports JPY", async () => {
	await setupUserlandTest();
	seedCorpus([]);
	useUserland.setState({
		items: {
			a: makeStack({ id: "a", pricePaid: 350, currency: "JPY", quantity: 1 }),
			b: makeStack({ id: "b", pricePaid: 350, currency: "JPY", quantity: 1 }),
		},
	});
	const { result } = renderHook(() => useCollectionStats());
	expect(result.current.estValueCurrency).toBe("JPY");
	expect(result.current.estValue).toBe(700);
	// Exponent-aware format (JPY has 0 minor-unit digits) — not /100 like USD.
	expect(
		formatPrice(
			result.current.estValue,
			result.current.estValueCurrency as string,
		),
	).toBe("¥700");
});

test("useCollectionStats: no priced stacks yields estValue and estValueCurrency null", async () => {
	await setupUserlandTest();
	seedCorpus([]);
	useUserland.setState({
		items: {
			a: makeStack({ id: "a", pricePaid: null }),
		},
	});
	const { result } = renderHook(() => useCollectionStats());
	expect(result.current.estValue).toBeNull();
	expect(result.current.estValueCurrency).toBeNull();
});
