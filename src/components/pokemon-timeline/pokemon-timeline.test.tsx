import { describe, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { HoloCardData } from "../holo-card";
import { PokemonTimeline } from "./pokemon-timeline";

function fixture(overrides: Partial<HoloCardData>): HoloCardData {
	return {
		id: overrides.id ?? "test-1",
		imageUrl: overrides.imageUrl ?? "https://example.invalid/test.png",
		name: overrides.name ?? "Test",
		setId: overrides.setId ?? "test",
		setName: overrides.setName ?? "Test Set",
		setSeries: overrides.setSeries ?? "Base",
		setReleaseDate: overrides.setReleaseDate,
		cardNumber: overrides.cardNumber ?? "1",
		...overrides,
	};
}

const SAMPLE_CARDS: HoloCardData[] = [
	fixture({
		id: "base1-58",
		name: "Pikachu",
		setId: "base1",
		setName: "Base",
		setSeries: "Base",
		setReleaseDate: "1999-01-09",
	}),
	fixture({
		id: "neo1-12",
		name: "Pikachu",
		setId: "neo1",
		setName: "Neo Genesis",
		setSeries: "Neo",
		setReleaseDate: "2000-12-16",
	}),
	fixture({
		id: "swsh4-43",
		name: "Pikachu V",
		setId: "swsh4",
		setName: "Vivid Voltage",
		setSeries: "Sword & Shield",
		setReleaseDate: "2020-11-13",
	}),
];

function renderInRouter(ui: React.ReactElement) {
	return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("<PokemonTimeline />", () => {
	test("renders a section per era", () => {
		renderInRouter(
			<PokemonTimeline
				cards={SAMPLE_CARDS}
				loading={false}
				hasMore={false}
				onLoadMore={() => {}}
			/>,
		);
		expect(screen.getByRole("heading", { name: /Base/i })).toBeDefined();
		expect(screen.getByRole("heading", { name: /Neo/i })).toBeDefined();
		expect(
			screen.getByRole("heading", { name: /Sword & Shield/i }),
		).toBeDefined();
	});

	test("renders eras in chronological order (oldest first)", () => {
		const { container } = renderInRouter(
			<PokemonTimeline
				cards={SAMPLE_CARDS}
				loading={false}
				hasMore={false}
				onLoadMore={() => {}}
			/>,
		);
		const headings = Array.from(
			container.querySelectorAll(".pokemon-timeline-era-name"),
		).map((el) => el.textContent);
		expect(headings).toEqual(["Base", "Neo", "Sword & Shield"]);
	});

	test("renders era header with year and count", () => {
		renderInRouter(
			<PokemonTimeline
				cards={SAMPLE_CARDS}
				loading={false}
				hasMore={false}
				onLoadMore={() => {}}
			/>,
		);
		expect(screen.getByText(/1999/)).toBeDefined();
		expect(screen.getByText(/2000/)).toBeDefined();
		expect(screen.getByText(/2020/)).toBeDefined();
		// Three "1 card" labels (one per era, one card each)
		expect(screen.getAllByText(/1 card/i)).toHaveLength(3);
	});

	test("renders 'Load more' button when hasMore is true and not loading", () => {
		renderInRouter(
			<PokemonTimeline
				cards={SAMPLE_CARDS}
				loading={false}
				hasMore={true}
				onLoadMore={() => {}}
			/>,
		);
		expect(screen.getByRole("button", { name: /load more/i })).toBeDefined();
	});

	test("does not render 'Load more' when hasMore is false", () => {
		renderInRouter(
			<PokemonTimeline
				cards={SAMPLE_CARDS}
				loading={false}
				hasMore={false}
				onLoadMore={() => {}}
			/>,
		);
		expect(screen.queryByRole("button", { name: /load more/i })).toBeNull();
	});

	test("calls onLoadMore when Load more is clicked", () => {
		let calls = 0;
		renderInRouter(
			<PokemonTimeline
				cards={SAMPLE_CARDS}
				loading={false}
				hasMore={true}
				onLoadMore={() => calls++}
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: /load more/i }));
		expect(calls).toBe(1);
	});

	test("renders empty-state when no cards", () => {
		renderInRouter(
			<PokemonTimeline
				cards={[]}
				loading={false}
				hasMore={false}
				onLoadMore={() => {}}
			/>,
		);
		expect(screen.getByText(/no cards/i)).toBeDefined();
	});

	test("hoverOverlay slot is wired through to each card", () => {
		renderInRouter(
			<PokemonTimeline
				cards={[SAMPLE_CARDS[0]]}
				loading={false}
				hasMore={false}
				onLoadMore={() => {}}
				renderOverlay={(card) => (
					<span data-testid={`overlay-${card.id}`}>OL</span>
				)}
			/>,
		);
		expect(screen.getByTestId("overlay-base1-58")).toBeDefined();
	});
});
