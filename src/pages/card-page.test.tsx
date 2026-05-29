import { describe, expect, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { FocusCardData } from "../api";
import { CardPage } from "./card-page";

const POKEMON_FIXTURE: FocusCardData = {
	id: "swsh4-43",
	imageUrl: "https://example.invalid/swsh4-43.png",
	name: "Pikachu V",
	rarity: "Rare Holo V",
	subtypes: ["Basic", "V"],
	supertype: "Pokémon",
	setId: "swsh4",
	setName: "Vivid Voltage",
	setSeries: "Sword & Shield",
	setLogo: "https://example.invalid/swsh4-logo.png",
	cardNumber: "43",
	nationalPokedexNumbers: [25],
	hp: "190",
	types: ["Lightning"],
	abilities: [],
	attacks: [
		{
			name: "Thunder Surge",
			cost: ["Lightning"],
			damage: "30",
			text: "Flip a coin. If heads, this attack does 30 more damage.",
		},
		{
			name: "Circle Circuit",
			cost: ["Lightning", "Lightning"],
			damage: "20×",
			text: "This attack does 20 damage for each of your Benched Pokémon.",
		},
	],
	weaknesses: [{ type: "Fighting", value: "×2" }],
	resistances: [],
	retreatCost: ["Colorless", "Colorless"],
	flavorText: "When you take it by the hand, it gives you a static shock.",
	artist: "5ban Graphics",
	tcgplayer: {
		url: "https://prices.pokemontcg.io/tcgplayer/swsh4-43",
		updatedAt: "2024-03-15",
		prices: {
			holofoil: { market: 5.43, low: 4.0, mid: 5.5, high: 12.0 },
		},
	},
	cardmarket: {
		url: "https://prices.pokemontcg.io/cardmarket/swsh4-43",
		updatedAt: "2024-03-15",
		prices: { averageSellPrice: 4.2, avg30: 4.05, trendPrice: 4.5 },
	},
};

const TRAINER_FIXTURE: FocusCardData = {
	id: "swsh4-145",
	imageUrl: "https://example.invalid/swsh4-145.png",
	name: "Boss's Orders",
	rarity: "Rare Holo",
	subtypes: ["Supporter"],
	supertype: "Trainer",
	setId: "swsh4",
	setName: "Vivid Voltage",
	setSeries: "Sword & Shield",
	cardNumber: "145",
	rules: [
		"Switch 1 of your opponent's Benched Pokémon with their Active Pokémon.",
		"You may play only 1 Supporter card during your turn.",
	],
	artist: "5ban Graphics",
};

const PRICELESS_FIXTURE: FocusCardData = {
	id: "old-card-1",
	imageUrl: "https://example.invalid/old-card.png",
	name: "Some Old Card",
	supertype: "Pokémon",
	setId: "base1",
	setName: "Base",
	setSeries: "Base",
	cardNumber: "1",
	hp: "60",
	types: ["Grass"],
};

function renderWithFixture(card: FocusCardData) {
	const router = createMemoryRouter(
		[
			{
				path: "/card/:id",
				element: <CardPage />,
				loader: () => card,
			},
		],
		{ initialEntries: [`/card/${card.id}`] },
	);
	return render(<RouterProvider router={router} />);
}

describe("<CardPage />", () => {
	test("renders Pokémon card with name, set, and HP", async () => {
		renderWithFixture(POKEMON_FIXTURE);
		await waitFor(() => expect(screen.getByText("Pikachu V")).toBeDefined());
		expect(screen.getAllByText(/Vivid Voltage/).length).toBeGreaterThan(0);
		expect(screen.getByText(/HP 190/)).toBeDefined();
	});

	test("renders Pokémon card attacks", async () => {
		renderWithFixture(POKEMON_FIXTURE);
		await waitFor(() =>
			expect(screen.getByText("Thunder Surge")).toBeDefined(),
		);
		expect(screen.getByText("Circle Circuit")).toBeDefined();
		expect(screen.getByText(/each of your Benched Pokémon/)).toBeDefined();
	});

	test("renders pricing block when tcgplayer/cardmarket present", async () => {
		renderWithFixture(POKEMON_FIXTURE);
		await waitFor(() => expect(screen.getByText(/TCGPlayer/i)).toBeDefined());
		expect(screen.getByText(/Cardmarket/i)).toBeDefined();
	});

	test("renders Trainer card rules and no attacks", async () => {
		renderWithFixture(TRAINER_FIXTURE);
		await waitFor(() =>
			expect(screen.getByText("Boss's Orders")).toBeDefined(),
		);
		expect(
			screen.getByText(/Switch 1 of your opponent's Benched Pokémon/),
		).toBeDefined();
		expect(screen.queryByText(/HP/)).toBeNull();
	});

	test("omits pricing block when neither tcgplayer nor cardmarket present", async () => {
		renderWithFixture(PRICELESS_FIXTURE);
		await waitFor(() =>
			expect(screen.getByText("Some Old Card")).toBeDefined(),
		);
		expect(screen.queryByText(/TCGPlayer/i)).toBeNull();
		expect(screen.queryByText(/Cardmarket/i)).toBeNull();
	});

	test("renders cross-link to set", async () => {
		renderWithFixture(POKEMON_FIXTURE);
		await waitFor(() => {
			const setLink = screen.getByRole("link", {
				name: /Go to Vivid Voltage/i,
			});
			expect(setLink.getAttribute("href")).toBe("/?setId=swsh4");
		});
	});

	test("renders cross-link to Pokémon view (per pokédex number)", async () => {
		renderWithFixture(POKEMON_FIXTURE);
		await waitFor(() => {
			const dexLink = screen.getByRole("link", { name: /View all #25/i });
			expect(dexLink.getAttribute("href")).toBe("/pokemon?dex=25");
		});
	});

	test("renders Back button", async () => {
		renderWithFixture(POKEMON_FIXTURE);
		await waitFor(() =>
			expect(screen.getByRole("button", { name: /back/i })).toBeDefined(),
		);
	});

	test("clicking Back navigates home when there is no history (direct visit)", async () => {
		const router = createMemoryRouter(
			[
				{
					path: "/",
					element: <div>Home</div>,
				},
				{
					path: "/card/:id",
					element: <CardPage />,
					loader: () => POKEMON_FIXTURE,
				},
			],
			{ initialEntries: [`/card/${POKEMON_FIXTURE.id}`] },
		);
		const { findByRole, findByText } = render(
			<RouterProvider router={router} />,
		);
		// Wait for the loader to resolve and the Back button to appear
		const backButton = await findByRole("button", { name: /back/i });
		fireEvent.click(backButton);
		// After clicking back, we should land on home (since /card/:id was the first entry).
		return findByText("Home");
	});
});
