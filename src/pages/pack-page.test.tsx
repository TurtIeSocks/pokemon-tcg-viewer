import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { PokemonSet } from "../api";
import type { HoloCardData } from "../components/holo-card";
import { useStore } from "../store";
import { PackPage } from "./pack-page";

function cardFx(id: string, rarity?: string): HoloCardData {
	return {
		id,
		imageUrl: `https://example.invalid/${id}.png`,
		name: id,
		rarity,
		setId: "base1",
		setName: "Base",
		setSeries: "Base",
		cardNumber: id.split("-")[1] ?? "1",
	};
}

const base1: PokemonSet = {
	id: "base1",
	name: "Base",
	series: "Base",
	releaseDate: "1999/01/09",
	total: 102,
	images: {
		symbol: "https://example.invalid/symbol.png",
		logo: "https://example.invalid/logo.png",
	},
};

function renderRoute(setId: string) {
	const router = createMemoryRouter(
		[{ path: "/pack/:setId", element: <PackPage /> }],
		{ initialEntries: [`/pack/${setId}`] },
	);
	return render(<RouterProvider router={router} />);
}

beforeEach(() => {
	const pool: HoloCardData[] = [];
	for (let i = 0; i < 12; i++) pool.push(cardFx(`c-${i}`, "Common"));
	for (let i = 0; i < 6; i++) pool.push(cardFx(`u-${i}`, "Uncommon"));
	for (let i = 0; i < 3; i++) pool.push(cardFx(`r-${i}`, "Rare Holo"));
	useStore.setState({
		sets: [base1],
		packCards: { base1: pool },
		packCardsFetchedAt: { base1: Date.now() },
		packCardsLoading: {},
	});
});

afterEach(() => {
	useStore.setState({ sets: null, packCards: {}, packCardsFetchedAt: {} });
});

describe("<PackPage />", () => {
	test("renders the closed booster when no pack has been rolled yet", () => {
		renderRoute("base1");
		expect(
			screen.getByRole("button", { name: /open .* booster/i }),
		).toBeDefined();
	});

	test("reveals 10 cards after clicking the booster", async () => {
		renderRoute("base1");
		fireEvent.click(screen.getByRole("button", { name: /open .* booster/i }));
		// The pack page uses a setTimeout for the rip animation; wait it out.
		await new Promise((r) => setTimeout(r, 380));
		const cards = await screen.findAllByRole("button");
		// Includes the cards (10) + the "Open another pack" button.
		const cardCount = cards.filter(
			(b) =>
				(!/open another/i.test(b.textContent ?? "") &&
					b.getAttribute("aria-label")?.startsWith("c-")) ||
				b.getAttribute("aria-label")?.startsWith("u-") ||
				b.getAttribute("aria-label")?.startsWith("r-"),
		).length;
		expect(cardCount).toBe(10);
	});
});
