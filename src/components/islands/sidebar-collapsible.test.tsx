import { expect, test } from "bun:test";
import {
	createRootRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import type { NavTree } from "../../lib/nav-tree";
import { SidebarCollapsible } from "./sidebar-collapsible";

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
				name: "Base",
				slug: "base",
				logo: "l",
				symbol: "y",
				total: 102,
			},
		],
	},
];

async function renderInRouter(ui: React.ReactNode) {
	const rootRoute = createRootRoute({ component: () => <>{ui}</> });
	const router = createRouter({ routeTree: rootRoute });
	await router.load();
	return render(<RouterProvider router={router} />);
}

test("SidebarCollapsible lists every series; active series' set is visible", async () => {
	await renderInRouter(
		<SidebarCollapsible
			tree={tree}
			activeSeriesSlug="sword-shield"
			activeSetSlug="brilliant-stars"
		/>,
	);
	expect(screen.getByText("Sword & Shield")).toBeDefined();
	expect(screen.getByText("Base")).toBeDefined();
	// active series open → its set link is rendered
	expect(screen.getByText("Brilliant Stars")).toBeDefined();
});
