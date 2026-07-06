// src/components/profile/danger-zone.test.tsx
//
// useAuthSession and useBilling have no injectable seam (both fetch directly),
// so we spy on the module exports directly (live-binding spy, same pattern as
// past-due-banner.test.tsx / entitlement.test.ts) rather than adding a mock
// framework.

import { afterEach, expect, spyOn, test } from "bun:test";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { AuthSessionState } from "@/components/auth/use-auth-session";
import * as authSessionMod from "@/components/auth/use-auth-session";
import type { BillingState } from "@/lib/billing/use-billing";
import * as useBillingMod from "@/lib/billing/use-billing";
import { renderInRouter } from "@/test-utils";
import { DangerZone } from "./danger-zone";

let authSpy: ReturnType<typeof spyOn> | undefined;
let billingSpy: ReturnType<typeof spyOn> | undefined;
let fetchSpy: ReturnType<typeof spyOn> | undefined;
let assignSpy: ReturnType<typeof spyOn> | undefined;

afterEach(() => {
	authSpy?.mockRestore();
	billingSpy?.mockRestore();
	fetchSpy?.mockRestore();
	assignSpy?.mockRestore();
});

function stubAuth(email: string | null) {
	authSpy = spyOn(authSessionMod, "useAuthSession").mockReturnValue({
		session: email ? ({ user: { email } } as never) : null,
		email,
		ready: true,
	} satisfies AuthSessionState);
}

function stubBilling(billingEnabled: boolean) {
	billingSpy = spyOn(useBillingMod, "useBilling").mockReturnValue({
		entitlement: { tier: "plus", status: "active", currentPeriodEnd: null },
		billingEnabled,
		loading: false,
		refresh: () => {},
	} satisfies BillingState);
}

test("renders nothing when signed out", async () => {
	stubAuth(null);
	stubBilling(true);
	await renderInRouter(<DangerZone />);
	expect(screen.queryByText("Danger zone")).toBeNull();
});

test("renders nothing when billing isn't configured (self-host)", async () => {
	stubAuth("ash@example.com");
	stubBilling(false);
	await renderInRouter(<DangerZone />);
	expect(screen.queryByText("Danger zone")).toBeNull();
});

test("renders the danger zone when signed in with billing configured", async () => {
	stubAuth("ash@example.com");
	stubBilling(true);
	await renderInRouter(<DangerZone />);
	expect(screen.getByText("Danger zone")).toBeTruthy();
	expect(screen.getByText("Export my data")).toBeTruthy();
	expect(screen.getByRole("button", { name: /delete account/i })).toBeTruthy();
});

test("delete is disabled until the typed email matches, then POSTs and redirects", async () => {
	stubAuth("ash@example.com");
	stubBilling(true);
	fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
		new Response(JSON.stringify({ ok: true }), { status: 200 }),
	);
	assignSpy = spyOn(window.location, "assign").mockImplementation(() => {});

	await renderInRouter(<DangerZone />);
	fireEvent.click(screen.getByRole("button", { name: /delete account/i }));

	const confirmButton = screen.getByRole("button", {
		name: /delete my account/i,
	}) as HTMLButtonElement;
	expect(confirmButton.disabled).toBe(true);

	const input = screen.getByLabelText(/type your email to confirm/i);
	fireEvent.change(input, { target: { value: "wrong@example.com" } });
	expect(confirmButton.disabled).toBe(true);

	fireEvent.change(input, { target: { value: "ash@example.com" } });
	expect(confirmButton.disabled).toBe(false);

	fireEvent.click(confirmButton);

	await waitFor(() => {
		expect(fetchSpy).toHaveBeenCalledWith("/api/account/delete", {
			method: "POST",
		});
	});
	await waitFor(() => {
		expect(assignSpy).toHaveBeenCalledWith("/");
	});
});

test("a failed delete shows an error and does not sign out", async () => {
	stubAuth("ash@example.com");
	stubBilling(true);
	fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
		new Response(null, { status: 500 }),
	);
	assignSpy = spyOn(window.location, "assign").mockImplementation(() => {});

	await renderInRouter(<DangerZone />);
	fireEvent.click(screen.getByRole("button", { name: /delete account/i }));
	const input = screen.getByLabelText(/type your email to confirm/i);
	fireEvent.change(input, { target: { value: "ash@example.com" } });
	fireEvent.click(screen.getByRole("button", { name: /delete my account/i }));

	await waitFor(() => {
		expect(screen.getByText(/something went wrong/i)).toBeTruthy();
	});
	expect(assignSpy).not.toHaveBeenCalled();
});
