import { afterEach, expect, test } from "bun:test";
import { renderHook } from "@testing-library/react";
import { makeProfile, makeStack, setupUserlandTest } from "../../test-utils";
import {
	resetPricesRuntimeForTests,
	usePricesRuntime,
} from "../corpus/prices-runtime";
import { useUserland } from "./userland-store";
import { useHideValue, useStackMarketValue } from "./valuation-hooks";

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
