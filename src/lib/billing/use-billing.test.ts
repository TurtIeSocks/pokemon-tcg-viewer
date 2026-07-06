// src/lib/billing/use-billing.test.ts
//
// reconcileBilling() must distinguish a real failure (500 + { ok: false }, per
// the reconcile RPC contract) from success (200 + { ok: true }) so the billing
// route can show an explicit error state instead of assuming activation
// succeeded. A thrown/network error is treated the same as a failed reconcile.

import { afterEach, expect, mock, test } from "bun:test";
import { reconcileBilling } from "./use-billing";

const realFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = realFetch;
});

test("reconcileBilling → true on 200 { ok: true }", async () => {
	globalThis.fetch = mock(
		async () =>
			new Response(JSON.stringify({ ok: true, reconciled: 1 }), {
				status: 200,
			}),
	) as unknown as typeof fetch;
	expect(await reconcileBilling()).toBe(true);
});

test("reconcileBilling → false on 500 { ok: false, failed }", async () => {
	globalThis.fetch = mock(
		async () =>
			new Response(JSON.stringify({ ok: false, reconciled: 0, failed: 1 }), {
				status: 500,
			}),
	) as unknown as typeof fetch;
	expect(await reconcileBilling()).toBe(false);
});

test("reconcileBilling → false on network error", async () => {
	globalThis.fetch = mock(async () => {
		throw new Error("network down");
	}) as unknown as typeof fetch;
	expect(await reconcileBilling()).toBe(false);
});
