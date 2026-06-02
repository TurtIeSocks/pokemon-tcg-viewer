import { expect, test } from "bun:test";
import {
	createRootRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import type { NavTree } from "../../lib/nav-tree";
import { AppToolbar } from "./app-toolbar";

const tree: NavTree = [];

async function renderInRouter(ui: React.ReactNode) {
	const rootRoute = createRootRoute({ component: () => <>{ui}</> });
	const router = createRouter({ routeTree: rootRoute });
	await router.load();
	return render(<RouterProvider router={router} />);
}

test("toolbar has no Vault link or button", async () => {
	await renderInRouter(
		<AppToolbar tree={tree} activeSeriesSlug={null} activeSetSlug={null} />,
	);
	// There should be no link/button with accessible name "Vault"
	expect(screen.queryByRole("link", { name: "Vault" })).toBeNull();
	expect(screen.queryByRole("button", { name: "Vault" })).toBeNull();
});

test("toolbar still has About and repo link", async () => {
	await renderInRouter(
		<AppToolbar tree={tree} activeSeriesSlug={null} activeSetSlug={null} />,
	);
	// About dialog trigger — aria-label="About & credits"
	expect(screen.getByRole("button", { name: /about/i })).toBeDefined();
	// RepoLink — aria-label="View source on GitHub"
	expect(screen.getByRole("link", { name: /github/i })).toBeDefined();
});
