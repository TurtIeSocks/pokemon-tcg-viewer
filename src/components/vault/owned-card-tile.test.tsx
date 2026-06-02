// owned-card-tile.test.tsx
import { beforeEach, expect, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { PokemonSet } from "../../server/card-mappers";
import { hydrateCard } from "../../store/corpus/corpus-engine";
import type { CorpusCard } from "../../store/corpus/corpus-types";
import type { CardRow } from "../../store/userland/card-rows";
import { createIdbRepos } from "../../store/userland/idb-repo";
import {
	addCopy,
	resetUserlandForTests,
	setUserlandRepos,
} from "../../store/userland/userland-store";
import { OwnedCardTile } from "./owned-card-tile";

const testCard: CorpusCard = {
	id: "base1-4",
	name: "Charizard",
	imageUrl: "https://example.com/charizard.png",
	imageUrlSmall: "https://example.com/charizard-sm.png",
	supertype: "Pokémon",
	setId: "base1",
	number: "4",
};

const testSet: PokemonSet = {
	id: "base1",
	name: "Base Set",
	series: "Base",
	releaseDate: "1999-01-09",
	total: 102,
	images: { symbol: "", logo: "" },
};

const setsById = new Map([[testSet.id, testSet]]);

function makeRow(copies: number): CardRow {
	const card = hydrateCard(testCard, setsById);
	const primary = {
		id: "copy-1",
		cardId: testCard.id,
		acquiredAt: 0,
		createdAt: 0,
		pricePaid: null,
		variant: null,
		notes: null,
		condition: null,
		grading: null,
	};
	const copyList = Array.from({ length: copies }, (_, i) => ({
		...primary,
		id: `copy-${i + 1}`,
	}));
	return { card, copies: copyList, primary, count: copies };
}

let repos = createIdbRepos();
beforeEach(async () => {
	repos = createIdbRepos();
	await repos.collection.clear();
	await repos.binders.clear();
	setUserlandRepos(repos);
	resetUserlandForTests();
});

test("does not show ×N badge when count=1", () => {
	render(<OwnedCardTile row={makeRow(1)} />);
	expect(screen.queryByText(/×/)).toBeNull();
});

test("shows ×2 badge when count=2", () => {
	render(<OwnedCardTile row={makeRow(2)} />);
	expect(screen.getByText("×2")).toBeDefined();
});

test("clicking the tile opens a dialog showing 'Your copies'", async () => {
	await addCopy(testCard.id);
	render(<OwnedCardTile row={makeRow(1)} />);
	fireEvent.click(
		screen.getByRole("button", { name: /manage copies of Charizard/i }),
	);
	await waitFor(() => expect(screen.getByText(/your copies/i)).toBeDefined());
});
