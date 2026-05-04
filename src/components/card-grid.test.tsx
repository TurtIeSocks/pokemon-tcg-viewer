import { describe, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, Link, RouterProvider } from "react-router";
import { VirtuosoGridMockContext } from "react-virtuoso";
import { CardGrid } from "./card-grid";
import type { HoloCardData } from "./holo-card";

const fixture: HoloCardData = {
	id: "swsh4-43",
	imageUrl: "https://example.invalid/swsh4-43.png",
	name: "Pikachu V",
	setId: "swsh4",
	setName: "Vivid Voltage",
	cardNumber: "43",
};

function renderGridWithOverlay() {
	const router = createMemoryRouter(
		[
			{
				path: "/",
				element: (
					<VirtuosoGridMockContext.Provider
						value={{
							viewportHeight: 600,
							viewportWidth: 800,
							itemHeight: 400,
							itemWidth: 300,
						}}
					>
						<CardGrid
							setId="swsh4"
							cards={[fixture]}
							onEndReached={() => {}}
							renderOverlay={() => (
								<Link to="/pokemon?dex=25" data-testid="overlay-link">
									View all Pikachu
								</Link>
							)}
						/>
					</VirtuosoGridMockContext.Provider>
				),
			},
			{ path: "/pokemon", element: <div data-testid="pokemon-page" /> },
			{ path: "/card/:id", element: <div data-testid="card-page" /> },
		],
		{ initialEntries: ["/"] },
	);
	return render(<RouterProvider router={router} />);
}

describe("<CardGrid />", () => {
	test("clicking the overlay link routes to the link's href, not /card/:id", async () => {
		renderGridWithOverlay();
		// Wait for the grid to render the card (Virtuoso needs mock context to render items)
		const overlayLink = await screen.findByTestId("overlay-link");
		fireEvent.click(overlayLink);
		// After click, the pokemon page renders. If C1 regressed, card-page would render instead.
		expect(await screen.findByTestId("pokemon-page")).toBeDefined();
		expect(screen.queryByTestId("card-page")).toBeNull();
	});
});
