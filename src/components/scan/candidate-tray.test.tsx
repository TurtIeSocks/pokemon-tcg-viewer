// candidate-tray.test.tsx
import { beforeEach, expect, mock, test } from "bun:test";
import { fireEvent, render as rtlRender, screen } from "@testing-library/react";
import type { ScanCandidate } from "../../store/scan/scan-types";
import { seedCorpus } from "../../test-utils";
import { CandidateTray } from "./candidate-tray";

const CHARIZARD_ID = "sv1-86";
const PIKACHU_ID = "sv1-87";

function renderTray(candidates: ScanCandidate[]) {
	const onAdd = mock((_cardId: string, _quantity: number) => {});
	const onDismiss = mock(() => {});
	rtlRender(
		<CandidateTray
			candidates={candidates}
			onAdd={onAdd}
			onDismiss={onDismiss}
		/>,
	);
	return { onAdd, onDismiss };
}

beforeEach(() => {
	seedCorpus([
		{
			id: CHARIZARD_ID,
			name: "Charizard ex",
			imageUrl: "https://img.test/charizard.png",
			imageUrlSmall: "https://img.test/charizard-sm.png",
			supertype: "Pokémon",
			setId: "sv1",
			number: "86",
		},
		{
			id: PIKACHU_ID,
			name: "Pikachu",
			imageUrl: "https://img.test/pikachu.png",
			imageUrlSmall: "https://img.test/pikachu-sm.png",
			supertype: "Pokémon",
			setId: "sv1",
			number: "87",
		},
	]);
});

test("renders a thumb per candidate", () => {
	renderTray([
		{ cardId: CHARIZARD_ID, score: 0.9 },
		{ cardId: PIKACHU_ID, score: 0.6 },
	]);
	expect(screen.getByAltText("Charizard ex")).toBeDefined();
	expect(screen.getByAltText("Pikachu")).toBeDefined();
});

test("tap a candidate then confirm quantity calls onAdd with the card id and quantity", () => {
	const { onAdd } = renderTray([{ cardId: CHARIZARD_ID, score: 0.9 }]);

	fireEvent.click(screen.getByAltText("Charizard ex"));
	fireEvent.click(screen.getByRole("button", { name: /add to vault/i }));

	expect(onAdd).toHaveBeenCalledWith(CHARIZARD_ID, 1);
});

test("stepping quantity up before confirming passes the stepped value", () => {
	const { onAdd } = renderTray([{ cardId: CHARIZARD_ID, score: 0.9 }]);

	fireEvent.click(screen.getByAltText("Charizard ex"));
	fireEvent.click(screen.getByRole("button", { name: /increase quantity/i }));
	fireEvent.click(screen.getByRole("button", { name: /add to vault/i }));

	expect(onAdd).toHaveBeenCalledWith(CHARIZARD_ID, 2);
});

test("dismiss button calls onDismiss so the parent can clear candidates and resume scanning", () => {
	const { onDismiss } = renderTray([{ cardId: CHARIZARD_ID, score: 0.9 }]);

	fireEvent.click(
		screen.getByRole("button", { name: /not these, keep scanning/i }),
	);

	expect(onDismiss).toHaveBeenCalledTimes(1);
});
