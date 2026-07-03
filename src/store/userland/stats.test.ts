// src/store/userland/stats.test.ts
import { afterEach, expect, test } from "bun:test";
import { renderHook } from "@testing-library/react";
import {
	makeProfile,
	makeStack,
	seedCorpus,
	setupUserlandTest,
} from "../../test-utils";
import { usePricesRuntime } from "../corpus/prices-runtime";
import { formatPrice } from "./money";
import { earliestAcquired, useCollectionStats } from "./stats";
import { useUserland } from "./userland-store";

afterEach(() => {
	usePricesRuntime.setState({ byId: null, meta: null, status: "idle" });
});

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

test("marketValue, costBasis, and P&L compute in the profile display currency", async () => {
	await setupUserlandTest();
	seedCorpus([]);
	// One card, tcgplayer Normal market $10.00 (1000 USD cents).
	usePricesRuntime.setState({
		byId: new Map([["base1-4", { tp: { N: [1000, null] } }]]),
		meta: {
			date: "2026-07-03",
			sources: { tp: "2026-07-03", cm: null },
			fx: { base: "EUR", date: "2026-07-03", rates: { USD: 1.09 } },
		},
		status: "ready",
	});
	useUserland.setState({
		profile: makeProfile({ displayCurrency: "USD" }),
		items: {
			a: makeStack({
				id: "a",
				cardId: "base1-4",
				quantity: 2,
				condition: "NM",
				pricePaid: 400,
				currency: "USD",
			}),
		},
	});
	const { result } = renderHook(() => useCollectionStats());
	// marketValue = 1000 (unit) * 2 (qty) * 1 (NM) = 2000 USD cents.
	expect(result.current.marketValue).toBe(2000);
	// costBasisConverted = 400 (per-unit) * 2 (qty) = 800 USD cents.
	expect(result.current.costBasisConverted).toBe(800);
	expect(result.current.unrealizedPnL).toBe(1200);
	expect(result.current.valueCurrency).toBe("USD");
});

test("marketValue is null when the prices blob is not loaded", async () => {
	await setupUserlandTest();
	seedCorpus([]);
	usePricesRuntime.setState({ byId: null, meta: null, status: "idle" });
	useUserland.setState({
		items: {
			a: makeStack({
				id: "a",
				cardId: "base1-4",
				quantity: 1,
				pricePaid: 400,
				currency: "USD",
			}),
		},
	});
	const { result } = renderHook(() => useCollectionStats());
	expect(result.current.marketValue).toBeNull();
	expect(result.current.unrealizedPnL).toBeNull();
});
