import { expect, test } from "bun:test";
import {
	createMemoryHistory,
	createRootRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { SidebarProvider } from "@/components/ui/sidebar";
import type { NavTree } from "../../lib/nav-tree";
import { AppSidebar } from "./app-sidebar";

const tree: NavTree = [
	{
		name: "Sword & Shield",
		slug: "sword-shield",
		year: 2020,
		sets: [
			{
				id: "swsh9",
				name: "Brilliant Stars",
				slug: "brilliant-stars",
				logo: "l",
				symbol: "y",
				total: 172,
			},
		],
	},
	{
		name: "Base",
		slug: "base",
		year: 1999,
		sets: [
			{
				id: "base1",
				name: "Base Set",
				slug: "base-set",
				logo: "l",
				symbol: "y",
				total: 102,
			},
		],
	},
];

async function renderInRouter(
	ui: React.ReactNode,
	{
		initialPath = "/",
		defaultOpen = true,
	}: { initialPath?: string; defaultOpen?: boolean } = {},
) {
	const rootRoute = createRootRoute({
		component: () => (
			<SidebarProvider defaultOpen={defaultOpen}>{ui}</SidebarProvider>
		),
	});
	const history = createMemoryHistory({ initialEntries: [initialPath] });
	const router = createRouter({ routeTree: rootRoute, history });
	await router.load();
	return render(<RouterProvider router={router} />);
}

/**
 * Render `<AppSidebar>` with the shared `tree` and no active series/set — the
 * default arrangement for most tests. Pass `initialPath` to drive Vault routing.
 */
function renderSidebar(
	opts: { initialPath?: string; defaultOpen?: boolean } = {},
) {
	return renderInRouter(
		<AppSidebar tree={tree} activeSeriesSlug={null} activeSetSlug={null} />,
		opts,
	);
}

/** Assert the four Vault child links are present. */
function expectVaultLinks() {
	expect(screen.getByRole("link", { name: "Overview" })).toBeDefined();
	expect(screen.getByRole("link", { name: "All cards" })).toBeDefined();
	expect(screen.getByRole("link", { name: "Sets" })).toBeDefined();
	expect(screen.getByRole("link", { name: "Binders" })).toBeDefined();
}

test("AppSidebar lists all series", async () => {
	await renderSidebar();
	expect(screen.getByText("Sword & Shield")).toBeDefined();
	expect(screen.getByText("Base")).toBeDefined();
});

test("active series' set is visible", async () => {
	await renderInRouter(
		<AppSidebar
			tree={tree}
			activeSeriesSlug="sword-shield"
			activeSetSlug="brilliant-stars"
		/>,
	);
	expect(screen.getByText("Brilliant Stars")).toBeDefined();
});

test("Vault group renders Overview / All cards / Sets / Binders links at /vault", async () => {
	await renderSidebar({ initialPath: "/vault" });
	expectVaultLinks();
});

test("Vault Overview link points to /vault", async () => {
	await renderSidebar({ initialPath: "/vault" });
	const overview = screen.getByRole("link", { name: "Overview" });
	expect((overview as HTMLAnchorElement).getAttribute("href")).toBe("/vault");
});

test("Vault All cards link points to /vault/cards", async () => {
	await renderSidebar({ initialPath: "/vault" });
	const cards = screen.getByRole("link", { name: "All cards" });
	expect((cards as HTMLAnchorElement).getAttribute("href")).toBe(
		"/vault/cards",
	);
});

test("Vault Sets link points to /vault/sets", async () => {
	await renderSidebar({ initialPath: "/vault" });
	const sets = screen.getByRole("link", { name: "Sets" });
	expect((sets as HTMLAnchorElement).getAttribute("href")).toBe("/vault/sets");
});

test("Vault Binders link points to /vault/binders", async () => {
	await renderSidebar({ initialPath: "/vault" });
	const binders = screen.getByRole("link", { name: "Binders" });
	expect((binders as HTMLAnchorElement).getAttribute("href")).toBe(
		"/vault/binders",
	);
});

test("Vault group is expanded when path starts with /vault", async () => {
	await renderSidebar({ initialPath: "/vault/binders" });
	expectVaultLinks();
});

test("Binders child is aria-current=page at /vault/binders", async () => {
	await renderSidebar({ initialPath: "/vault/binders" });
	const binders = screen.getByRole("link", { name: "Binders" });
	expect(binders.getAttribute("aria-current")).toBe("page");
	const overview = screen.getByRole("link", { name: "Overview" });
	expect(overview.getAttribute("aria-current")).toBeNull();
});

test("Overview child is aria-current=page at /vault", async () => {
	await renderSidebar({ initialPath: "/vault" });
	const overview = screen.getByRole("link", { name: "Overview" });
	expect(overview.getAttribute("aria-current")).toBe("page");
	const sets = screen.getByRole("link", { name: "Sets" });
	expect(sets.getAttribute("aria-current")).toBeNull();
});

test("Sets child is aria-current=page at /vault/sets", async () => {
	await renderSidebar({ initialPath: "/vault/sets" });
	const setsLink = screen.getByRole("link", { name: "Sets" });
	expect(setsLink.getAttribute("aria-current")).toBe("page");
});

test("Vault items are always visible (flat group, matches mock)", async () => {
	await renderSidebar({ initialPath: "/" });
	// Flat group (no collapsible parent): vault children render regardless of path
	expectVaultLinks();
});

test("About and RepoLink are present in sidebar footer", async () => {
	await renderSidebar();
	expect(screen.getByRole("button", { name: /about/i })).toBeDefined();
	expect(screen.getByRole("link", { name: /github/i })).toBeDefined();
});

test("footer links to the profile page", async () => {
	await renderSidebar();
	const profileLink = screen.getByRole("link", { name: /collector/i });
	expect((profileLink as HTMLAnchorElement).getAttribute("href")).toBe(
		"/profile",
	);
});

test("series rows show a 2-char monogram badge", async () => {
	await renderSidebar();
	expect(screen.getByText("SS")).toBeDefined(); // Sword & Shield
	expect(screen.getByText("BA")).toBeDefined(); // Base
});

test("Vault links render a leading icon", async () => {
	await renderSidebar({ initialPath: "/vault" });
	const overview = screen.getByRole("link", { name: "Overview" });
	expect(overview.querySelector("svg")).not.toBeNull();
});

test("collapsed series row is a link to its series page", async () => {
	await renderSidebar({ initialPath: "/", defaultOpen: false });
	const link = screen.getByRole("link", { name: /Sword & Shield/ });
	expect(link.getAttribute("href")).toBe("/sword-shield");
});
