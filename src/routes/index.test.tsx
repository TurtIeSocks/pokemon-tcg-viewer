import { afterEach, expect, test } from "bun:test";
import {
	createRootRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen } from "@testing-library/react";
import type { NavTree } from "../lib/nav-tree";
import { useCommandPalette } from "../store/command-palette";
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

async function renderHome() {
	// Pre-seed an empty corpus so HomeBrowse's loadCorpus() early-returns (no
	// network); the singleton is reset in afterEach so it doesn't leak.
	useCorpusRuntime.setState({ index: buildIndex([]) });
	const rootRoute = createRootRoute({
		loader: () => TREE,
		component: HomeHero,
	});
	const router = createRouter({ routeTree: rootRoute });
	await router.load();
	return render(<RouterProvider router={router} />);
}

afterEach(() => {
	useCorpusRuntime.setState({ index: null });
	useCommandPalette.setState({ open: false });
});

test("HomeHero renders the Cardstack title", async () => {
	await renderHome();
	expect(screen.getByRole("heading", { level: 1 }).textContent).toContain(
		"Cardstack",
	);
});

test("the old search-bar form and quick-search input are gone", async () => {
	const { container } = await renderHome();
	// The launch pad replaces the pill search bar — no <form>, no searchbox.
	expect(container.querySelector("form")).toBeNull();
	expect(screen.queryByRole("searchbox")).toBeNull();
});

test("the Search launch card opens the command palette", async () => {
	await renderHome();
	expect(useCommandPalette.getState().open).toBe(false);
	// The Search card is a button; its accessible name folds in the subtitle.
	fireEvent.click(screen.getByRole("button", { name: /find any card/i }));
	expect(useCommandPalette.getState().open).toBe(true);
});

test("the card-type launch cards link to /pokemon, /trainer, and /energy", async () => {
	const { container } = await renderHome();
	expect(container.querySelector('a[href^="/pokemon"]')).toBeTruthy();
	expect(container.querySelector('a[href^="/trainer"]')).toBeTruthy();
	expect(container.querySelector('a[href^="/energy"]')).toBeTruthy();
	// ...and a Vault card links to the collection hub.
	expect(container.querySelector('a[href^="/vault"]')).toBeTruthy();
});
