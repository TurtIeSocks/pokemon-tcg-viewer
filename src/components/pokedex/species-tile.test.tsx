// src/components/pokedex/species-tile.test.tsx
import { expect, test } from "bun:test";
import {
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { type ReactNode, useState } from "react";
import { type PokedexRow, spriteUrl } from "../../lib/pokedex";
import { SpeciesTile } from "./species-tile";

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

test("renders the species sprite, name, dex and card count", async () => {
	await mount(
		<SpeciesTile
			row={{ dex: 6, name: "charizard", count: 248, type: "Fire" }}
		/>,
	);
	const img = screen.getByRole("img", {
		name: "charizard",
	}) as HTMLImageElement;
	expect(img.src).toBe(spriteUrl(6));
	expect(screen.getByText("Charizard")).toBeDefined();
	expect(screen.getByText("#006")).toBeDefined();
	expect(screen.getByText(/248 cards/)).toBeDefined();
});

test("falls back to a placeholder when the sprite fails to load", async () => {
	await mount(
		<SpeciesTile
			row={{ dex: 9999, name: "missingno", count: 1, type: null }}
		/>,
	);
	const img = screen.getByRole("img", {
		name: "missingno",
	}) as HTMLImageElement;
	fireEvent.error(img);
	expect(img.getAttribute("src")).not.toBe(spriteUrl(9999));
});

test("updates the sprite when the row prop changes without remounting", async () => {
	// The virtualized grid keys items by index, so on sort/filter it reuses a
	// tile instance and only swaps the `row` prop. The sprite must follow the
	// new dex, not stay seeded from the first render.
	let setRow!: (r: PokedexRow) => void;
	function Harness() {
		const [row, set] = useState<PokedexRow>({
			dex: 1,
			name: "bulbasaur",
			count: 5,
			type: "Grass",
		});
		setRow = set;
		return <SpeciesTile row={row} />;
	}
	await mount(<Harness />);
	expect((screen.getByRole("img") as HTMLImageElement).src).toBe(spriteUrl(1));

	act(() => setRow({ dex: 25, name: "pikachu", count: 9, type: "Lightning" }));
	expect((screen.getByRole("img") as HTMLImageElement).src).toBe(spriteUrl(25));
});
