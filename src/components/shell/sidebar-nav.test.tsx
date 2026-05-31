import { expect, test } from "bun:test";
import {
	createRootRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import type { NavTree } from "../../server/nav-tree";
import { SidebarNav } from "./sidebar-nav";

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
];

// SidebarNav renders TanStack <Link>s; mount inside a minimal router so Link resolves.
// Must await router.load() before render to ensure the router is initialized.
async function renderInRouter(ui: React.ReactNode) {
	const rootRoute = createRootRoute({ component: () => <>{ui}</> });
	const router = createRouter({ routeTree: rootRoute });
	await router.load();
	return render(<RouterProvider router={router} />);
}

test("SidebarNav lists series and their sets", async () => {
	await renderInRouter(
		<SidebarNav tree={tree} activeSeriesSlug={null} activeSetSlug={null} />,
	);
	expect(screen.getByText("Sword & Shield")).toBeDefined();
	expect(screen.getByText("Brilliant Stars")).toBeDefined();
});
