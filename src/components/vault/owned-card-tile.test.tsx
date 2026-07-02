// owned-card-tile.test.tsx
import { beforeEach, expect, test } from "bun:test";
import { fireEvent, screen, waitFor } from "@testing-library/react";
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

test("owned asia card's link carries lang=ja while display language is en", async () => {
	const asiaCard = makeCorpusCard({
		id: "sv1a-001",
		name: "Nyoromo",
		setId: "base1",
		number: "1",
		region: "asia",
	});
	seedCorpus([asiaCard]);
	useStore.setState({ sets: [testSet] });

	const card = hydrateCard(asiaCard, setsById);
	const copyList = [makeStack({ id: "copy-1", cardId: asiaCard.id })];
	const row: CardRow = {
		card,
		stacks: copyList,
		primary: copyList[0],
		count: 1,
	};

	// The manage-face nav masks the visible URL to the canonical
	// `/$series/$set/$card/manage` path (search/state deliberately hidden from
	// `href` by TanStack Router's masking design, same as `cardOverlay` state
	// -- see card-overlay.tsx). The real navigation target (what the app
	// actually matches/reads `useSearch` against) is the unmasked
	// `router.state.location`, so assert there instead of on `href`.
	const { router } = await renderInRouter(<OwnedCardTile row={row} />);
	const link = screen.getByRole("link", { name: /manage stacks of Nyoromo/i });
	fireEvent.click(link);
	await waitFor(() => {
		expect((router.state.location.search as { lang?: string }).lang).toBe("ja");
	});
});
