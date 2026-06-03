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
	{ initialPath = "/" }: { initialPath?: string } = {},
) {
	const rootRoute = createRootRoute({
		component: () => <SidebarProvider>{ui}</SidebarProvider>,
	});
	const history = createMemoryHistory({ initialEntries: [initialPath] });
	const router = createRouter({ routeTree: rootRoute, history });
	await router.load();
	return render(<RouterProvider router={router} />);
}

test("AppSidebar lists all series", async () => {
	await renderInRouter(
		<AppSidebar tree={tree} activeSeriesSlug={null} activeSetSlug={null} />,
	);
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

test("Vault group renders Cards / Sets / Binders links at /vault", async () => {
	await renderInRouter(
		<AppSidebar tree={tree} activeSeriesSlug={null} activeSetSlug={null} />,
		{ initialPath: "/vault" },
	);
	expect(screen.getByRole("link", { name: "Cards" })).toBeDefined();
	expect(screen.getByRole("link", { name: "Sets" })).toBeDefined();
	expect(screen.getByRole("link", { name: "Binders" })).toBeDefined();
});

test("Vault Cards link points to /vault", async () => {
	await renderInRouter(
		<AppSidebar tree={tree} activeSeriesSlug={null} activeSetSlug={null} />,
		{ initialPath: "/vault" },
	);
	const cards = screen.getByRole("link", { name: "Cards" });
	expect((cards as HTMLAnchorElement).getAttribute("href")).toBe("/vault");
});

test("Vault Sets link points to /vault/sets", async () => {
	await renderInRouter(
		<AppSidebar tree={tree} activeSeriesSlug={null} activeSetSlug={null} />,
		{ initialPath: "/vault" },
	);
	const sets = screen.getByRole("link", { name: "Sets" });
	expect((sets as HTMLAnchorElement).getAttribute("href")).toBe("/vault/sets");
});

test("Vault Binders link points to /vault/binders", async () => {
	await renderInRouter(
		<AppSidebar tree={tree} activeSeriesSlug={null} activeSetSlug={null} />,
		{ initialPath: "/vault" },
	);
	const binders = screen.getByRole("link", { name: "Binders" });
	expect((binders as HTMLAnchorElement).getAttribute("href")).toBe(
		"/vault/binders",
	);
});

test("Vault group is expanded when path starts with /vault", async () => {
	await renderInRouter(
		<AppSidebar tree={tree} activeSeriesSlug={null} activeSetSlug={null} />,
		{ initialPath: "/vault/binders" },
	);
	expect(screen.getByRole("link", { name: "Cards" })).toBeDefined();
	expect(screen.getByRole("link", { name: "Sets" })).toBeDefined();
	expect(screen.getByRole("link", { name: "Binders" })).toBeDefined();
});

test("Binders child is aria-current=page at /vault/binders", async () => {
	await renderInRouter(
		<AppSidebar tree={tree} activeSeriesSlug={null} activeSetSlug={null} />,
		{ initialPath: "/vault/binders" },
	);
	const binders = screen.getByRole("link", { name: "Binders" });
	expect(binders.getAttribute("aria-current")).toBe("page");
	const cards = screen.getByRole("link", { name: "Cards" });
	expect(cards.getAttribute("aria-current")).toBeNull();
});

test("Cards child is aria-current=page at /vault", async () => {
	await renderInRouter(
		<AppSidebar tree={tree} activeSeriesSlug={null} activeSetSlug={null} />,
		{ initialPath: "/vault" },
	);
	const cards = screen.getByRole("link", { name: "Cards" });
	expect(cards.getAttribute("aria-current")).toBe("page");
	const sets = screen.getByRole("link", { name: "Sets" });
	expect(sets.getAttribute("aria-current")).toBeNull();
});

test("Sets child is aria-current=page at /vault/sets", async () => {
	await renderInRouter(
		<AppSidebar tree={tree} activeSeriesSlug={null} activeSetSlug={null} />,
		{ initialPath: "/vault/sets" },
	);
	const setsLink = screen.getByRole("link", { name: "Sets" });
	expect(setsLink.getAttribute("aria-current")).toBe("page");
});

test("Vault group is collapsed when path is /", async () => {
	await renderInRouter(
		<AppSidebar tree={tree} activeSeriesSlug={null} activeSetSlug={null} />,
		{ initialPath: "/" },
	);
	// None of the vault children should be visible when collapsed
	expect(screen.queryByRole("link", { name: "Cards" })).toBeNull();
	expect(screen.queryByRole("link", { name: "Sets" })).toBeNull();
	expect(screen.queryByRole("link", { name: "Binders" })).toBeNull();
});

test("About and RepoLink are present in sidebar footer", async () => {
	await renderInRouter(
		<AppSidebar tree={tree} activeSeriesSlug={null} activeSetSlug={null} />,
	);
	expect(screen.getByRole("button", { name: /about/i })).toBeDefined();
	expect(screen.getByRole("link", { name: /github/i })).toBeDefined();
});
