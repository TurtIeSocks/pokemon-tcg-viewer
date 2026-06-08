// owned-card-tile.test.tsx
import { beforeEach, expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import type { PokemonSet } from "../../server/card-mappers";
import { hydrateCard } from "../../store/corpus/corpus-engine";
import { useStore } from "../../store/index";
import type { CardRow } from "../../store/userland/card-rows";
import {
	makeCorpusCard,
	makeStack,
	renderInRouter,
	seedCorpus,
	setupUserlandTest,
} from "../../test-utils";
import { OwnedCardTile } from "./owned-card-tile";

const testCard = makeCorpusCard({
	id: "base1-4",
	name: "Charizard",
	imageUrl: "https://example.com/charizard.png",
	imageUrlSmall: "https://example.com/charizard-sm.png",
	number: "4",
});

const testSet: PokemonSet = {
	id: "base1",
	name: "Base Set",
	series: "Base",
	releaseDate: "1999-01-09",
	total: 102,
	images: { symbol: "", logo: "" },
};

const setsById = new Map([[testSet.id, testSet]]);

function makeRow(stacks: number): CardRow {
	const card = hydrateCard(testCard, setsById);
	const copyList = Array.from({ length: stacks }, (_, i) =>
		makeStack({ id: `copy-${i + 1}`, cardId: testCard.id }),
	);
	return { card, stacks: copyList, primary: copyList[0], count: stacks };
}

beforeEach(async () => {
	await setupUserlandTest();

	// Pre-seed corpus + sets so useSlugIndex resolves inside OwnedCardTile.
	seedCorpus([testCard]);
	useStore.setState({ sets: [testSet] });
});

test("does not show ×N badge when count=1", async () => {
	await renderInRouter(<OwnedCardTile row={makeRow(1)} />);
	expect(screen.queryByText(/×/)).toBeNull();
});

test("shows ×2 badge when count=2", async () => {
	await renderInRouter(<OwnedCardTile row={makeRow(2)} />);
	expect(screen.getByText("×2")).toBeDefined();
});

test("renders a link targeting the manage face (href contains /manage)", async () => {
	await renderInRouter(<OwnedCardTile row={makeRow(1)} />);
	const link = screen.getByRole("link", {
		name: /manage stacks of Charizard/i,
	});
	expect(link).not.toBeNull();
	const href = (link as HTMLAnchorElement).href ?? "";
	expect(href).toMatch(/\/manage/);
});
