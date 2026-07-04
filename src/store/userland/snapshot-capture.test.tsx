import { afterEach, expect, test } from "bun:test";
import { renderHook } from "@testing-library/react";
import { makeStack, setupUserlandTest } from "../../test-utils";
import {
	resetPricesRuntimeForTests,
	usePricesRuntime,
} from "../corpus/prices-runtime";
import { resetSnapshotsForTests } from "./idb-repo";
import { useCaptureSnapshot } from "./snapshot-capture";
import { useUserland } from "./userland-store";

afterEach(async () => {
	await resetPricesRuntimeForTests();
	await resetSnapshotsForTests();
});

test("captures a snapshot once per price-blob date when market value is known", async () => {
	await setupUserlandTest();
	// seed prices: one card at $10 tcgplayer normal, fx present; one owned stack of it.
	usePricesRuntime.setState({
		byId: new Map([["base1-4", { tp: { N: [1000, null] } }]]),
		meta: {
			date: "2026-07-03",
			sources: { tp: "2026-07-03", cm: null },
			fx: { base: "EUR", date: "x", rates: { USD: 1.09 } },
		},
		status: "ready",
	});
	useUserland.setState({
		items: {
			a: makeStack({
				id: "a",
				cardId: "base1-4",
				quantity: 1,
				pricePaid: 400,
				currency: "USD",
				condition: "NM",
				grading: null,
				printing: null,
			}),
		},
	});
	renderHook(() => useCaptureSnapshot());
	await new Promise((r) => setTimeout(r, 20)); // let the fire-and-forget capture settle
	const snaps = useUserland.getState().snapshots;
	expect(snaps.length).toBe(1);
	expect(snaps[0].priceDate).toBe("2026-07-03");
	// $10.00 tcgplayer normal price, USD -> USD display currency (no conversion needed).
	expect(snaps[0].totalCents).toBe(1000);
});
