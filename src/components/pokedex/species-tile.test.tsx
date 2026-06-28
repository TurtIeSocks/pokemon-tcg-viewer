// src/components/pokedex/species-tile.test.tsx
import { expect, test } from "bun:test";
import {
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { spriteUrl } from "../../lib/pokedex";
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
