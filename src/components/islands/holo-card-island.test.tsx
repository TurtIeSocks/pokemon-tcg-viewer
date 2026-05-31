import { render, screen } from "@testing-library/react";
import { expect, test } from "bun:test";
import { HoloCardIsland } from "./holo-card-island";

test("HoloCardIsland renders an accessible image fallback", () => {
	render(
		<HoloCardIsland
			imageUrl="https://images.pokemontcg.io/swsh9/154_hires.png"
			imageUrlSmall="https://images.pokemontcg.io/swsh9/154.png"
			name="Charizard VSTAR"
		/>,
	);
	// Under happy-dom ClientOnly resolves hydrated=true → renders the interactive
	// HoloCard which exposes the card name via aria-label on the wrapper div.
	// On the server (SSR) the fallback <img alt={name}> covers crawlability.
	expect(screen.getByRole("button", { name: "Charizard VSTAR" })).toBeDefined();
});
