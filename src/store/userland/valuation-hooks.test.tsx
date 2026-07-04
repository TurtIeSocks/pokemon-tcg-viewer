import { afterEach, expect, test } from "bun:test";
import { renderHook } from "@testing-library/react";
import {
	makeCorpusCard,
	makeProfile,
	makeStack,
	seedCorpus,
	setupUserlandTest,
} from "../../test-utils";
import {
	resetPricesRuntimeForTests,
	usePricesRuntime,
} from "../corpus/prices-runtime";
import { addStack, createBinder, useUserland } from "./userland-store";
import {
	useBinderValue,
	useHideValue,
	useStackMarketValue,
} from "./valuation-hooks";

afterEach(async () => {
	await setupUserlandTest(); // resets userland between cases
	await resetPricesRuntimeForTests();
});

test("useHideValue reflects the profile flag, defaulting false", async () => {
	await setupUserlandTest();
	expect(renderHook(() => useHideValue()).result.current).toBe(false);
	useUserland.setState({
		profile: makeProfile({ hideValue: true }),
	});
	expect(renderHook(() => useHideValue()).result.current).toBe(true);
});

test("useStackMarketValue returns market value + P&L in display currency", async () => {
	await setupUserlandTest();
	usePricesRuntime.setState({
		byId: new Map([["base1-4", { tp: { N: [1000, null] } }]]), // $10 unit
		meta: {
			date: "x",
			sources: { tp: "x", cm: null },
			fx: { base: "EUR", date: "x", rates: { USD: 1.09 } },
		},
		status: "ready",
	});
	const stack = makeStack({
		cardId: "base1-4",
		quantity: 2,
		pricePaid: 400,
		currency: "USD",
		condition: "NM",
		grading: null,
		printing: null,
	});
	const { result } = renderHook(() => useStackMarketValue(stack));
	expect(result.current.marketValue).toBe(2000); // $10 × 2
	expect(result.current.pnl).toBe(1200); // 2000 − 800
	expect(result.current.currency).toBe("USD");
});

test("useStackMarketValue is null-safe when unpriced", async () => {
	await setupUserlandTest();
	await resetPricesRuntimeForTests();
	const stack = makeStack({ cardId: "nope", pricePaid: 400, currency: "USD" });
	const { result } = renderHook(() => useStackMarketValue(stack));
	expect(result.current.marketValue).toBeNull();
	expect(result.current.pnl).toBeNull();
});

test("useBinderValue is null when prices aren't loaded", async () => {
	await setupUserlandTest();
	await resetPricesRuntimeForTests();
	const card = makeCorpusCard({ id: "base1-1", name: "Bulbasaur" });
	seedCorpus([card]);
	await addStack(card.id);
	const binder = await createBinder({ name: "Value Binder" });
	useUserland.setState((s) => ({
		binders: {
			...s.binders,
			[binder.id]: { ...binder, includeCardIds: [card.id] },
		},
	}));

	const { result } = renderHook(() => useBinderValue(binder.id));
	expect(result.current.value).toBeNull();
	expect(result.current.currency).toBe("USD");
});

test("useBinderValue sums owned member stacks' market value in display currency", async () => {
	await setupUserlandTest();
	const card = makeCorpusCard({ id: "base1-1", name: "Bulbasaur" });
	seedCorpus([card]);
	usePricesRuntime.setState({
		byId: new Map([["base1-1", { tp: { N: [1000, null] } }]]), // $10 unit
		meta: {
			date: "x",
			sources: { tp: "x", cm: null },
			fx: { base: "EUR", date: "x", rates: { USD: 1.09 } },
		},
		status: "ready",
	});
	await addStack(card.id, {
		quantity: 2,
		condition: "NM",
		grading: null,
		printing: null,
	});
	const binder = await createBinder({ name: "Value Binder" });
	useUserland.setState((s) => ({
		binders: {
			...s.binders,
			[binder.id]: { ...binder, includeCardIds: [card.id] },
		},
	}));

	const { result } = renderHook(() => useBinderValue(binder.id));
	expect(result.current.value).toBe(2000); // $10 × 2, USD display currency
	expect(result.current.currency).toBe("USD");
});

test("useBinderValue converts a USD market value into a non-USD display currency (GBP)", async () => {
	// The other positive test above uses displayCurrency "USD", so its
	// convertMinorUnits(usd, "USD", "USD", fx) call is a same-currency identity
	// and never exercises real cross-rate math. This test locks in a genuine
	// EUR-table cross-conversion (USD -> GBP, both non-base currencies).
	await setupUserlandTest();
	const card = makeCorpusCard({ id: "base1-1", name: "Bulbasaur" });
	seedCorpus([card]);
	usePricesRuntime.setState({
		byId: new Map([["base1-1", { tp: { N: [1000, null] } }]]), // $10 unit
		meta: {
			date: "x",
			sources: { tp: "x", cm: null },
			fx: { base: "EUR", date: "x", rates: { USD: 1.09, GBP: 0.85 } },
		},
		status: "ready",
	});
	await addStack(card.id, {
		quantity: 2,
		condition: "NM",
		grading: null,
		printing: null,
	});
	const binder = await createBinder({ name: "Value Binder" });
	useUserland.setState((s) => ({
		binders: {
			...s.binders,
			[binder.id]: { ...binder, includeCardIds: [card.id] },
		},
		profile: makeProfile({ displayCurrency: "GBP" }),
	}));

	const { result } = renderHook(() => useBinderValue(binder.id));
	// USD market value: $10 x 2 = 2000 USD cents. Convert via the EUR-based
	// table: 2000 / 1.09 * 0.85 = 1559.63... -> rounds to 1560 GBP pence.
	const expectedGbpPence = Math.round((2000 / 1.09) * 0.85);
	expect(result.current.value).toBe(expectedGbpPence);
	expect(result.current.currency).toBe("GBP");
});
