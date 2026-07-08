import { describe, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import type { HoloCardData } from "../holo-card";
import { CardLightbox } from "./card-lightbox";

const card = {
	id: "base1-4",
	name: "Charizard",
	imageUrl: "https://images.pokemontcg.io/base1/4_hires.png",
	imageUrlSmall: "https://images.pokemontcg.io/base1/4.png",
	rarity: "Rare Holo",
	setId: "base1",
	cardNumber: "4",
	subtypes: ["Stage 2"],
	supertype: "Pokémon",
	types: ["Fire"],
	variants: ["holofoil"],
} as HoloCardData;

describe("<CardLightbox />", () => {
	test("renders nothing while closed", () => {
		const { container } = render(
			<CardLightbox open={false} onClose={() => {}} card={card} />,
		);
		expect(container.firstChild).toBeNull();
	});

	test("renders an interactive holo card when open, not a flat image", () => {
		render(<CardLightbox open onClose={() => {}} card={card} />);
		// The zoom is a real HoloCard (so the foil is interactive), identified by its
		// root class, rather than a plain <img>.
		expect(document.querySelector(".holo-card")).not.toBeNull();
	});

	test("closes on backdrop click", () => {
		let closed = 0;
		render(<CardLightbox open onClose={() => closed++} card={card} />);
		fireEvent.click(
			screen.getByRole("button", { name: /close enlarged view of charizard/i }),
		);
		expect(closed).toBe(1);
	});

	test("closes on Escape", () => {
		let closed = 0;
		render(<CardLightbox open onClose={() => closed++} card={card} />);
		fireEvent.keyDown(window, { key: "Escape" });
		expect(closed).toBe(1);
	});
});
