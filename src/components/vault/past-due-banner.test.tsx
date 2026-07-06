// src/components/vault/past-due-banner.test.tsx
//
// Render logic for the past_due banner. useBilling has no injectable seam of
// its own (it always fetches via getEntitlement/isBillingEnabled), so we spy
// on the module export directly (live-binding spy, same pattern as
// entitlement.test.ts / bulk-add-menu.test.tsx) rather than adding a mock
// framework.

import { afterEach, expect, spyOn, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Entitlement } from "@/lib/billing/entitlement";
import * as useBillingMod from "@/lib/billing/use-billing";
import { PastDueBanner } from "./past-due-banner";

let billingSpy: ReturnType<typeof spyOn> | undefined;
afterEach(() => billingSpy?.mockRestore());

function stubBilling(entitlement: Entitlement) {
	billingSpy = spyOn(useBillingMod, "useBilling").mockReturnValue({
		entitlement,
		billingEnabled: true,
		loading: false,
		refresh: () => {},
	});
}

test("renders nothing when entitlement status is not past_due", () => {
	stubBilling({ tier: "plus", status: "active", currentPeriodEnd: null });
	render(<PastDueBanner />);
	expect(screen.queryByRole("alert")).toBeNull();
});

test("renders nothing when there is no entitlement status (free/signed-out)", () => {
	stubBilling({ tier: "free", status: null, currentPeriodEnd: null });
	render(<PastDueBanner />);
	expect(screen.queryByRole("alert")).toBeNull();
});

test("renders the warning banner when entitlement status is past_due", () => {
	stubBilling({ tier: "plus", status: "past_due", currentPeriodEnd: null });
	render(<PastDueBanner />);
	expect(screen.getByRole("alert")).toBeTruthy();
	expect(
		screen.getByText(/Payment issue\. Update your card to keep syncing\./),
	).toBeTruthy();
	expect(screen.getByRole("button", { name: /update card/i })).toBeTruthy();
});

test("dismiss button hides the banner", () => {
	stubBilling({ tier: "plus", status: "past_due", currentPeriodEnd: null });
	render(<PastDueBanner />);
	fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
	expect(screen.queryByRole("alert")).toBeNull();
});
