import { afterEach, expect, test } from "bun:test";
import {
	createRootRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import type { NavTree } from "../lib/nav-tree";
import { buildIndex } from "../store/corpus/corpus-engine";
import { useCorpusRuntime } from "../store/corpus/corpus-runtime";
import { HomeHero } from "./index";

// HomeHero reads the nav tree from the root loader (getRouteApi("__root__")),
// so mount it under a router whose root loader supplies one — mirroring prod.
const TREE: NavTree = [
	{
		name: "Base",
		slug: "base",
		year: 1999,
		sets: [
			{
				id: "base",
				name: "Base",
				slug: "base",
				logo: "/x.png",
				symbol: "/x.png",
				total: 102,
			},
		],
	},
];

// Pre-seed an empty corpus so HomeBrowse's loadCorpus() early-returns (no
// network); reset after so the singleton doesn't leak to other test files.
afterEach(() => useCorpusRuntime.setState({ index: null }));

test("HomeHero renders the title and a search input", async () => {
	useCorpusRuntime.setState({ index: buildIndex([]) });
	const rootRoute = createRootRoute({
		loader: () => TREE,
		component: HomeHero,
	});
	const router = createRouter({ routeTree: rootRoute });
	await router.load();
	render(<RouterProvider router={router} />);

	expect(screen.getByRole("heading", { level: 1 }).textContent).toContain(
		"Cardstack",
	);
	expect(
		screen.getByRole("searchbox", { name: /search any card/i }),
	).toBeDefined();
});
