import { expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import type { HoloCardData } from "../holo-card";
import { OwnedMissingGrid } from "./owned-missing-grid";

function makeCard(id: string, name: string): HoloCardData {
	return {
		id,
		name,
		imageUrl: `https://example.com/${id}.png`,
		imageUrlSmall: `https://example.com/${id}-sm.png`,
		setId: "base1",
		setName: "Base Set",
		setSeries: "Base",
		cardNumber: "1",
	};
}

const cardA = makeCard("base1-1", "Bulbasaur");
const cardB = makeCard("base1-2", "Ivysaur");

// "base1-1" owned; "base1-2" missing
const ownedSet = new Set(["base1-1"]);

test("owned card is rendered without grayscale class", () => {
	render(<OwnedMissingGrid cards={[cardA, cardB]} ownedCardIds={ownedSet} />);
	const ownedImg = screen.getByAltText("Bulbasaur");
	expect(ownedImg.className).not.toContain("grayscale");
});

test("missing card is rendered with grayscale class", () => {
	render(<OwnedMissingGrid cards={[cardA, cardB]} ownedCardIds={ownedSet} />);
	const missingImg = screen.getByAltText("Ivysaur");
	expect(missingImg.className).toContain("grayscale");
});

test("mode=owned hides missing cards", () => {
	render(
		<OwnedMissingGrid
			cards={[cardA, cardB]}
			ownedCardIds={ownedSet}
			mode="owned"
		/>,
	);
	expect(screen.getByAltText("Bulbasaur")).toBeDefined();
	expect(screen.queryByAltText("Ivysaur")).toBeNull();
});

test("mode=missing hides owned cards", () => {
	render(
		<OwnedMissingGrid
			cards={[cardA, cardB]}
			ownedCardIds={ownedSet}
			mode="missing"
		/>,
	);
	expect(screen.queryByAltText("Bulbasaur")).toBeNull();
	expect(screen.getByAltText("Ivysaur")).toBeDefined();
});

test("owned indicator dot has aria-label=owned", () => {
	render(<OwnedMissingGrid cards={[cardA]} ownedCardIds={ownedSet} />);
	expect(screen.getByLabelText("owned")).toBeDefined();
});

test("missing indicator dot has aria-label=missing", () => {
	render(<OwnedMissingGrid cards={[cardB]} ownedCardIds={ownedSet} />);
	expect(screen.getByLabelText("missing")).toBeDefined();
});

// --- onToggleOwned ---

test("with onToggleOwned, clicking a card calls it with the cardId", () => {
	const onToggle = mock(() => {});
	render(
		<OwnedMissingGrid
			cards={[cardA, cardB]}
			ownedCardIds={ownedSet}
			onToggleOwned={onToggle}
		/>,
	);
	// Each card should be a button; click the first one (Bulbasaur)
	const btn = screen.getByRole("button", { name: /bulbasaur/i });
	fireEvent.click(btn);
	expect(onToggle).toHaveBeenCalledTimes(1);
	expect(onToggle).toHaveBeenCalledWith("base1-1");
});

test("with onToggleOwned, clicking missing card calls it with the correct cardId", () => {
	const onToggle = mock(() => {});
	render(
		<OwnedMissingGrid
			cards={[cardA, cardB]}
			ownedCardIds={ownedSet}
			onToggleOwned={onToggle}
		/>,
	);
	const btn = screen.getByRole("button", { name: /ivysaur/i });
	fireEvent.click(btn);
	expect(onToggle).toHaveBeenCalledWith("base1-2");
});

test("without onToggleOwned, cards are not buttons", () => {
	render(<OwnedMissingGrid cards={[cardA, cardB]} ownedCardIds={ownedSet} />);
	// No buttons rendered when prop is absent
	expect(screen.queryAllByRole("button")).toHaveLength(0);
});
