// src/components/shell/sidebar-user-menu.test.tsx
//
// needs_upgrade affordance: the upgrade CTA must render as a proper menu item
// inside the dropdown (never as an interactive element inside the trigger
// button), and only while sync status is needs_upgrade. Cross-module deps are
// stubbed via live-binding spyOn (never mock.module — leaks across Bun files).

import { afterEach, expect, spyOn, test } from "bun:test";
import type { Session } from "@supabase/supabase-js";
import {
	createRootRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as authMod from "@/components/auth/use-auth-session";
import * as displayMod from "@/components/sync/sync-status-display";
import { SidebarProvider } from "@/components/ui/sidebar";
import * as clientMod from "@/lib/supabase/client";
import { SidebarUserMenu } from "./sidebar-user-menu";

const spies: Array<{ mockRestore: () => void }> = [];
afterEach(() => {
	while (spies.length) spies.pop()?.mockRestore();
});

function stubSignedIn(status: displayMod.AccountStatusDisplay["status"]) {
	spies.push(
		spyOn(clientMod, "isCloudEnabled").mockReturnValue(true),
		spyOn(authMod, "useAuthSession").mockReturnValue({
			session: { user: { id: "u1" } } as unknown as Session,
			email: "collector@example.com",
			ready: true,
		}),
		spyOn(displayMod, "useAccountStatusDisplay").mockReturnValue({
			...displayMod.SYNC_STATUS_DISPLAY[status],
			status,
		}),
	);
}

async function renderMenu() {
	const rootRoute = createRootRoute({
		component: () => (
			<SidebarProvider>
				<SidebarUserMenu />
			</SidebarProvider>
		),
	});
	const router = createRouter({ routeTree: rootRoute });
	await router.load();
	return render(<RouterProvider router={router} />);
}

function openMenu() {
	const trigger = screen.getByRole("button", { name: /collector/i });
	fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
}

test("needs_upgrade → 'Upgrade to sync' menu item links to /billing", async () => {
	stubSignedIn("needs_upgrade");
	await renderMenu();
	openMenu();

	const item = await waitFor(() =>
		screen.getByRole("menuitem", { name: /upgrade to sync/i }),
	);
	expect(item.getAttribute("href")).toBe("/billing");
});

test("needs_upgrade → no interactive element inside the trigger button", async () => {
	stubSignedIn("needs_upgrade");
	await renderMenu();

	const trigger = screen.getByRole("button", { name: /collector/i });
	expect(trigger.querySelectorAll("a, button, [role='link']").length).toBe(0);
});

test("synced → no upgrade menu item", async () => {
	stubSignedIn("synced");
	await renderMenu();
	openMenu();

	// Menu is open (a known item is present) but the upgrade CTA is absent.
	await waitFor(() => screen.getByRole("menuitem", { name: /settings/i }));
	expect(
		screen.queryByRole("menuitem", { name: /upgrade to sync/i }),
	).toBeNull();
});

test("identity block is a focusable menu item that links to /profile", async () => {
	stubSignedIn("synced");
	await renderMenu();
	openMenu();

	// The identity item is the only menuitem carrying the signed-in email; it's a
	// real Link (role=menuitem) so keyboard/pointer users can open the profile.
	const identity = await waitFor(() =>
		screen.getByRole("menuitem", { name: /collector@example\.com/i }),
	);
	expect(identity.getAttribute("href")).toBe("/profile");
});

test("'Edit profile' opens the edit dialog in place instead of navigating", async () => {
	stubSignedIn("synced");
	await renderMenu();
	openMenu();

	const editItem = await waitFor(() =>
		screen.getByRole("menuitem", { name: /edit profile/i }),
	);
	// It's a plain action item now — no route navigation.
	expect(editItem.getAttribute("href")).toBeNull();
	// The controlled dialog is unmounted until the item is selected.
	expect(screen.queryByText(/your collector identity/i)).toBeNull();

	fireEvent.click(editItem);

	// Selecting the item opens ProfileFormDialog (identified by its description).
	await waitFor(() =>
		expect(screen.getByText(/your collector identity/i)).toBeDefined(),
	);
});
