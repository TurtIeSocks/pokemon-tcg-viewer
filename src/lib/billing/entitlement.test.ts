// src/lib/billing/entitlement.test.ts
//
// getEntitlement/isBillingEnabled are RENDER-ONLY and fail-open — they must never
// block the Vault. Cloud-disabled is the simplest fail-open path (no network), and
// proves the invariant: absent billing → free, false. (spyOn, never mock.module —
// module mocks leak across Bun test files.)

import { afterEach, expect, spyOn, test } from "bun:test";
import * as clientMod from "@/lib/supabase/client";
import { getEntitlement, isBillingEnabled } from "./entitlement";

let cloudSpy: ReturnType<typeof spyOn> | undefined;
afterEach(() => cloudSpy?.mockRestore());

test("getEntitlement → free when cloud is disabled (fail-open, no network)", async () => {
	cloudSpy = spyOn(clientMod, "isCloudEnabled").mockReturnValue(false);
	expect(await getEntitlement()).toEqual({
		tier: "free",
		status: null,
		currentPeriodEnd: null,
	});
});

test("isBillingEnabled → false when cloud is disabled", async () => {
	cloudSpy = spyOn(clientMod, "isCloudEnabled").mockReturnValue(false);
	expect(await isBillingEnabled()).toBe(false);
});
