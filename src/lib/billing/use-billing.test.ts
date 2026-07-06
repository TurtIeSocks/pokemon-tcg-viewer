// src/lib/billing/use-billing.test.ts
//
// reconcileBilling() must distinguish a real failure (500 + { ok: false }, per
// the reconcile RPC contract) from success (200 + { ok: true }) from an
// expired-session return (401 — the user's cookie died between Checkout and
// the redirect back, not a reconcile failure) so the billing route can show
// the right state instead of assuming activation succeeded or telling a
// signed-out user "activation is retrying".

import { afterEach, expect, mock, test } from "bun:test";
import { reconcileBilling } from "./use-billing";

const realFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = realFetch;
});

test('reconcileBilling → "ok" on 200 { ok: true }', async () => {
	globalThis.fetch = mock(
		async () =>
			new Response(JSON.stringify({ ok: true, reconciled: 1 }), {
				status: 200,
			}),
	) as unknown as typeof fetch;
	expect(await reconcileBilling()).toBe("ok");
});

test('reconcileBilling → "failed" on 500 { ok: false, failed }', async () => {
	globalThis.fetch = mock(
		async () =>
			new Response(JSON.stringify({ ok: false, reconciled: 0, failed: 1 }), {
				status: 500,
			}),
	) as unknown as typeof fetch;
	expect(await reconcileBilling()).toBe("failed");
});

test('reconcileBilling → "unauthorized" on 401 (expired session)', async () => {
	globalThis.fetch = mock(
		async () =>
			new Response(JSON.stringify({ error: "not signed in" }), {
				status: 401,
			}),
	) as unknown as typeof fetch;
	expect(await reconcileBilling()).toBe("unauthorized");
});

test('reconcileBilling → "failed" on network error', async () => {
	globalThis.fetch = mock(async () => {
		throw new Error("network down");
	}) as unknown as typeof fetch;
	expect(await reconcileBilling()).toBe("failed");
});
