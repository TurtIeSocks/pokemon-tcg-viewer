import { beforeEach, expect, test } from "bun:test";
import {
	createMemoryHistory,
	createRootRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen } from "@testing-library/react";
import { useCommandPalette } from "../../store/command-palette";
import { BottomNav } from "./bottom-nav";
import { BOTTOM_NAV_ITEMS } from "./command-palette-data";

async function renderNav(initialPath = "/") {
	const rootRoute = createRootRoute({ component: () => <BottomNav /> });
	const history = createMemoryHistory({ initialEntries: [initialPath] });
	const router = createRouter({ routeTree: rootRoute, history });
	await router.load();
	return render(<RouterProvider router={router} />);
}

beforeEach(() => {
	useCommandPalette.setState({ open: false });
});

// ── data shape (the dest() helper + ordering) ──

test("BOTTOM_NAV_ITEMS is Browse / Vault / Scan / Search / Profile in order", () => {
	expect(BOTTOM_NAV_ITEMS.map((i) => i.label())).toEqual([
		"Browse",
		"Vault",
		"Scan",
		"Search",
		"Profile",
	]);
});

test("Scan is the center FAB and Search is the action slot", () => {
	const scan = BOTTOM_NAV_ITEMS.find((i) => i.label() === "Scan");
	const search = BOTTOM_NAV_ITEMS.find((i) => i.label() === "Search");
	expect(scan?.center).toBe(true);
	expect(scan?.to).toBe("/scan");
	expect(search?.action).toBe("search");
	expect(search?.to).toBeUndefined();
});

// ── render ──

test("renders all five slots", async () => {
	await renderNav();
	expect(screen.getByRole("link", { name: "Browse" })).toBeDefined();
	expect(screen.getByRole("link", { name: "Vault" })).toBeDefined();
	expect(screen.getByRole("link", { name: "Scan" })).toBeDefined();
	expect(screen.getByRole("button", { name: "Search" })).toBeDefined();
	expect(screen.getByRole("link", { name: "Profile" })).toBeDefined();
});

test("route slots point at their routes", async () => {
	await renderNav();
	const href = (name: string) =>
		(screen.getByRole("link", { name }) as HTMLAnchorElement).getAttribute(
			"href",
		);
	expect(href("Browse")).toBe("/");
	expect(href("Vault")).toBe("/vault");
	expect(href("Scan")).toBe("/scan");
	expect(href("Profile")).toBe("/profile");
});

test("nav is mobile-only (md:hidden)", async () => {
	await renderNav();
	const nav = screen.getByRole("navigation", { name: "Primary" });
	expect(nav.className).toContain("md:hidden");
});

// ── search → shared palette store ──

test("Search opens the command palette via the shared store", async () => {
	await renderNav();
	expect(useCommandPalette.getState().open).toBe(false);
	fireEvent.click(screen.getByRole("button", { name: "Search" }));
	expect(useCommandPalette.getState().open).toBe(true);
});

// ── active-route highlight ──

test("Vault is aria-current on /vault", async () => {
	await renderNav("/vault");
	expect(
		screen.getByRole("link", { name: "Vault" }).getAttribute("aria-current"),
	).toBe("page");
	expect(
		screen.getByRole("link", { name: "Browse" }).getAttribute("aria-current"),
	).toBeNull();
});

test("Vault stays active on nested /vault/cards (prefix match)", async () => {
	await renderNav("/vault/cards");
	expect(
		screen.getByRole("link", { name: "Vault" }).getAttribute("aria-current"),
	).toBe("page");
});

test("Browse is aria-current on / (exact match; inactivity elsewhere covered above)", async () => {
	await renderNav("/");
	expect(
		screen.getByRole("link", { name: "Browse" }).getAttribute("aria-current"),
	).toBe("page");
});

test("Search slot reflects palette-open state as aria-expanded", async () => {
	await renderNav();
	const btn = screen.getByRole("button", { name: "Search" });
	expect(btn.getAttribute("aria-expanded")).toBe("false");
	fireEvent.click(btn);
	expect(btn.getAttribute("aria-expanded")).toBe("true");
});
