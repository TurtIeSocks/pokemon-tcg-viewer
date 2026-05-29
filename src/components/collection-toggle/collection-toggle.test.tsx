import { afterEach, describe, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { useStore } from "../../store";
import type { HoloCardData } from "../holo-card";
import { CollectionToggle } from "./collection-toggle";

const card: HoloCardData = {
	id: "base1-58",
	imageUrl: "https://example.invalid/p.png",
	name: "Pikachu",
	setId: "base1",
	setName: "Base",
	setSeries: "Base",
	cardNumber: "58",
};

afterEach(() => {
	useStore.setState({ owned: {} });
});

describe("<CollectionToggle />", () => {
	test("renders '+' button when card is not owned", () => {
		render(<CollectionToggle card={card} />);
		const btn = screen.getByRole("button", { name: /add .* collection/i });
		expect(btn.textContent).toBe("+");
	});

	test("renders '✓' button when card is owned", () => {
		useStore.getState().addToCollection(card);
		render(<CollectionToggle card={card} />);
		const btn = screen.getByRole("button", {
			name: /remove .* collection/i,
		});
		expect(btn.textContent).toBe("✓");
	});

	test("click adds card when absent", () => {
		render(<CollectionToggle card={card} />);
		fireEvent.click(screen.getByRole("button"));
		expect(useStore.getState().owned[card.id]).toBeDefined();
	});

	test("click removes card when present", () => {
		useStore.getState().addToCollection(card);
		render(<CollectionToggle card={card} />);
		fireEvent.click(screen.getByRole("button"));
		expect(useStore.getState().owned[card.id]).toBeUndefined();
	});
});
