// owned-card-tile.test.tsx
import { beforeEach, expect, test } from "bun:test";
import {
	createRootRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import type { PokemonSet } from "../../server/card-mappers";
import { buildIndex, hydrateCard } from "../../store/corpus/corpus-engine";
import { useCorpusRuntime } from "../../store/corpus/corpus-runtime";
import type { CorpusCard } from "../../store/corpus/corpus-types";
import { useStore } from "../../store/index";
import type { CardRow } from "../../store/userland/card-rows";
import { createIdbRepos } from "../../store/userland/idb-repo";
import {
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

async function renderInRouter(ui: React.ReactNode) {
	const rootRoute = createRootRoute({ component: () => <>{ui}</> });
	const router = createRouter({ routeTree: rootRoute });
	await router.load();
	return render(<RouterProvider router={router} />);
}

let repos = createIdbRepos();
beforeEach(async () => {
	repos = createIdbRepos();
	await repos.collection.clear();
	await repos.binders.clear();
	setUserlandRepos(repos);
	resetUserlandForTests();

	// Pre-seed corpus + sets so useSlugIndex resolves inside OwnedCardTile.
	useCorpusRuntime.setState({ index: buildIndex([testCard]) });
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
		name: /manage copies of Charizard/i,
	});
	expect(link).not.toBeNull();
	const href = (link as HTMLAnchorElement).href ?? "";
	expect(href).toMatch(/\/manage/);
});
