import { afterEach, describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { VirtuosoGridMockContext } from "react-virtuoso";
import type { HoloCardData } from "../components/holo-card";
import { useStore } from "../store";
import { CollectionPage } from "./collection-page";

function fixture(
	id: string,
	overrides: Partial<HoloCardData> = {},
): HoloCardData {
	return {
		id,
		imageUrl: `https://example.invalid/${id}.png`,
		name: overrides.name ?? "Pikachu",
		setId: overrides.setId ?? "base1",
		setName: overrides.setName ?? "Base",
		setSeries: overrides.setSeries ?? "Base",
		setReleaseDate: overrides.setReleaseDate,
		cardNumber: overrides.cardNumber ?? "58",
		...overrides,
	};
}

function renderRoute(path: string) {
	const router = createMemoryRouter(
		[
			{
				path: "/collection",
				element: (
					<VirtuosoGridMockContext.Provider
						value={{
							viewportHeight: 600,
							viewportWidth: 800,
							itemHeight: 400,
							itemWidth: 300,
						}}
					>
						<CollectionPage />
					</VirtuosoGridMockContext.Provider>
				),
			},
		],
		{ initialEntries: [path] },
	);
	return render(<RouterProvider router={router} />);
}

afterEach(() => {
	useStore.setState({ owned: {} });
});

describe("<CollectionPage />", () => {
	test("renders empty state when no cards owned", () => {
		renderRoute("/collection");
		expect(screen.getByText(/no cards yet/i)).toBeDefined();
	});

	test("renders owned cards in grid view", async () => {
		useStore.getState().addToCollection(fixture("base1-58"));
		useStore.getState().addToCollection(fixture("base1-4"));
		renderRoute("/collection");
		// Virtuoso mock-context renders items synchronously, but the data path
		// still flushes through React's reconciler — use findAll for safety.
		const cards = await screen.findAllByLabelText("Pikachu");
		expect(cards).toHaveLength(2);
	});

	test("renders owned cards in timeline view when ?view=timeline", () => {
		useStore
			.getState()
			.addToCollection(fixture("base1-58", { setReleaseDate: "1999-01-09" }));
		useStore.getState().addToCollection(
			fixture("neo1-12", {
				setName: "Neo Genesis",
				setSeries: "Neo",
				setReleaseDate: "2000-12-16",
			}),
		);
		renderRoute("/collection?view=timeline");
		expect(screen.getByRole("heading", { name: /Base/i })).toBeDefined();
		expect(screen.getByRole("heading", { name: /Neo/i })).toBeDefined();
	});

	test("renders count summary in header (N copies · M unique)", () => {
		useStore.getState().addToCollection(fixture("base1-58"));
		useStore.getState().addToCollection(fixture("base1-4"));
		renderRoute("/collection");
		expect(screen.getByText(/2 copies · 2 unique/i)).toBeDefined();
	});
});
