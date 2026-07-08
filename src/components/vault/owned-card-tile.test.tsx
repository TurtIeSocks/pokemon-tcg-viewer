// owned-card-tile.test.tsx
import { beforeEach, expect, test } from "bun:test";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { PokemonSet } from "../../server/card-mappers";
import { buildIndex, hydrateCard } from "../../store/corpus/corpus-engine";
import { useCorpusRuntime } from "../../store/corpus/corpus-runtime-store";
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

/** An asia-only set (absent from the west `sets` list entirely). */
const asiaSet: PokemonSet = {
	id: "sv1a",
	name: "Shiny Treasure ex",
	series: "Scarlet & Violet",
	releaseDate: "2023-12-01",
	total: 1,
	images: {},
};

function makeRow(stacks: number): CardRow {
	const card = hydrateCard(testCard, setsById);
	const copyList = Array.from({ length: stacks }, (_, i) =>
		makeStack({ id: `copy-${i + 1}`, cardId: testCard.id }),
	);
	return { card, stacks: copyList, primary: copyList[0], count: stacks };
}

beforeEach(async () => {
	await setupUserlandTest();

	// Reset the non-persisted corpus runtime + region sets cache so a prior
	// test's asia index/sets can't leak into this one.
	useCorpusRuntime.setState({
		indices: {},
		activeRegion: "west",
		loading: {},
		index: null,
	});
	useStore.setState({ sets: null, setsByRegion: {}, setsByRegionLoading: {} });

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

test("renders in full color (owned) with the unified mini-nav", async () => {
	await renderInRouter(<OwnedCardTile row={makeRow(1)} />);
	// Vault owned tiles are always owned → full color (holo-card--owned), never
	// grayscale.
	const card = await screen.findByRole("button", { name: "Charizard" });
	expect(card.className).toContain("holo-card--owned");
	// The unified glass mini-nav is present (expand opens the detail modal).
	expect(
		await screen.findByRole("button", { name: /expand charizard/i }),
	).toBeDefined();
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
		setId: "sv1a",
		number: "1",
		region: "asia",
	});
	// The tile resolves an owned card's route via ITS OWN region's index + sets
	// (see cardRouteParamsForRegion), so an asia-tagged card must actually live
	// in the asia index/sets -- not just be "seeded" into the west index with a
	// west setId, which was only ever a west-only-resolution-era convenience.
	useCorpusRuntime.getState().setIndex("asia", buildIndex([asiaCard], "asia"));
	useStore.setState((s) => ({
		setsByRegion: { ...s.setsByRegion, asia: [asiaSet] },
	}));

	const card = hydrateCard(asiaCard, new Map([[asiaSet.id, asiaSet]]));
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

test("an owned asia card (asia-only set, activeRegion still west) is clickable once asia index + asia sets are loaded (fix E: cross-region tile)", async () => {
	// Genuinely cross-region: the card lives in the ASIA index, under a set that
	// exists ONLY in setsByRegion.asia (not in the west `sets` list at all) --
	// this reproduces the bug where the tile resolved links via the
	// active-region (west) slug index and could never find the card, leaving
	// it non-clickable.
	const asiaCard = makeCorpusCard({
		id: "sv1a-001",
		name: "Nyoromo",
		setId: "sv1a",
		number: "1",
		region: "asia",
	});

	useCorpusRuntime.getState().setIndex("asia", buildIndex([asiaCard], "asia"));
	useStore.setState((s) => ({
		setsByRegion: { ...s.setsByRegion, asia: [asiaSet] },
	}));
	// activeRegion stays "west" -- the viewer is browsing the west catalog while
	// this asia card sits in their Vault (e.g. imported/synced ownership).
	expect(useCorpusRuntime.getState().activeRegion).toBe("west");

	const card = hydrateCard(asiaCard, new Map([[asiaSet.id, asiaSet]]));
	const copyList = [makeStack({ id: "copy-1", cardId: asiaCard.id })];
	const row: CardRow = {
		card,
		stacks: copyList,
		primary: copyList[0],
		count: 1,
	};

	await renderInRouter(<OwnedCardTile row={row} />);
	const link = screen.getByRole("link", { name: /manage stacks of Nyoromo/i });
	expect(link).not.toBeNull();
	const href = (link as HTMLAnchorElement).href ?? "";
	expect(href).toMatch(/\/manage/);
});

test("an owned asia card (asia-only set) is NON-clickable when asia sets have NOT loaded yet (pre-fix regression guard)", async () => {
	const asiaCard = makeCorpusCard({
		id: "sv1a-002",
		name: "Zenigame",
		setId: "sv1a",
		number: "2",
		region: "asia",
	});
	// Asia INDEX loaded, but its SETS are not -- exercises the "index alone
	// isn't enough" half of the fix (setsForRegion("asia") still undefined).
	useCorpusRuntime.getState().setIndex("asia", buildIndex([asiaCard], "asia"));

	const card = hydrateCard(asiaCard, new Map());
	const copyList = [makeStack({ id: "copy-2", cardId: asiaCard.id })];
	const row: CardRow = {
		card,
		stacks: copyList,
		primary: copyList[0],
		count: 1,
	};

	await renderInRouter(<OwnedCardTile row={row} />);
	expect(
		screen.queryByRole("link", { name: /manage stacks of Zenigame/i }),
	).toBeNull();
});
