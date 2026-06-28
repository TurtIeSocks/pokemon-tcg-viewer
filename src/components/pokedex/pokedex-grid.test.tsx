// src/components/pokedex/pokedex-grid.test.tsx
import { expect, test } from "bun:test";
import {
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import type { PokedexRow } from "../../lib/pokedex";
import { PokedexGrid } from "./pokedex-grid";

async function mount(ui: ReactNode) {
	const root = createRootRoute({ component: () => ui });
	const name = createRoute({
		getParentRoute: () => root,
		path: "/pokemon/$name",
		component: () => null,
	});
	const router = createRouter({ routeTree: root.addChildren([name]) });
	await router.load();
	render(<RouterProvider router={router} />);
}

const rows: PokedexRow[] = [
	{ dex: 1, name: "bulbasaur", count: 5, type: "Grass" },
	{ dex: 6, name: "charizard", count: 9, type: "Fire" },
];

test("renders a tile per row", async () => {
	await mount(<PokedexGrid rows={rows} />);
	expect(screen.getAllByRole("img")).toHaveLength(2);
});

test("shows an empty state when there are no rows", async () => {
	await mount(<PokedexGrid rows={[]} />);
	expect(screen.getByText(/no species match/i)).toBeDefined();
});
