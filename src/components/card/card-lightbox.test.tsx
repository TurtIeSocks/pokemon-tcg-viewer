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

	test("clicking the card itself also exits", () => {
		let closed = 0;
		render(<CardLightbox open onClose={() => closed++} card={card} />);
		// The holo card is a role=button with the card's name; clicking it closes.
		fireEvent.click(screen.getByRole("button", { name: "Charizard" }));
		expect(closed).toBe(1);
	});

	test("closes on Escape", () => {
		let closed = 0;
		render(<CardLightbox open onClose={() => closed++} card={card} />);
		fireEvent.keyDown(window, { key: "Escape" });
		expect(closed).toBe(1);
	});

	test("re-enables pointer events on the portal root (modal stacking)", () => {
		// When opened from the card MODAL, Radix + RemoveScroll set
		// pointer-events: none on <body>; the portal inherits it and every click
		// fell through to the modal underneath (dead backdrop/X, dead mouse
		// tilt, outside clicks dismissing the whole modal). The root must opt
		// back in.
		render(<CardLightbox open onClose={() => {}} card={card} />);
		const root = document.querySelector(".z-120");
		expect(root?.className).toContain("pointer-events-auto");
	});

	test("Escape is captured so a stacked Radix dialog does not also close", () => {
		let closed = 0;
		let reachedDocument = 0;
		// Stand-in for Radix's document-level Escape listener (capture, like
		// DismissableLayer). The lightbox's window-capture listener fires first
		// and must stop propagation so only the lightbox peels off.
		const radixStandIn = (e: KeyboardEvent) => {
			if (e.key === "Escape") reachedDocument++;
		};
		document.addEventListener("keydown", radixStandIn, { capture: true });
		try {
			render(<CardLightbox open onClose={() => closed++} card={card} />);
			fireEvent.keyDown(document.body, { key: "Escape" });
			expect(closed).toBe(1);
			expect(reachedDocument).toBe(0);
		} finally {
			document.removeEventListener("keydown", radixStandIn, {
				capture: true,
			});
		}
	});
});
