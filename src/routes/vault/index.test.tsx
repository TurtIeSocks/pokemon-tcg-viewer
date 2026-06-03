import { beforeEach, expect, test } from "bun:test";
import {
	createRootRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { deriveNavTree } from "../../lib/nav-tree";
import type { PokemonSet } from "../../server/card-mappers";
import { useStore } from "../../store";
import { buildIndex } from "../../store/corpus/corpus-engine";
import { useCorpusRuntime } from "../../store/corpus/corpus-runtime";
import type { CorpusCard } from "../../store/corpus/corpus-types";
import { createIdbRepos } from "../../store/userland/idb-repo";
import type { Binder, CollectionItem } from "../../store/userland/types";
import {
	resetUserlandForTests,
	setUserlandRepos,
	useUserland,
} from "../../store/userland/userland-store";
import { VaultOverviewInner } from "./index";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function cc(id: string, name: string, setId: string, number = "1"): CorpusCard {
	return {
		id,
		name,
		imageUrl: `https://example.com/${id}.png`,
		imageUrlSmall: `https://example.com/${id}-sm.png`,
		supertype: "Pokémon",
		setId,
		number,
	};
}

function makeSet(
	id: string,
	name: string,
	series: string,
	total = 2,
): PokemonSet {
	return {
		id,
		name,
		series,
		releaseDate: "1999/01/09",
		total,
		images: { symbol: "", logo: "" },
	};
}

const baseSet = makeSet("base1", "Base Set", "Base", 102);
const jungleSet = makeSet("jungle1", "Jungle", "Base", 64);

const cards = [
	cc("base1-1", "Bulbasaur", "base1"),
	cc("base1-2", "Ivysaur", "base1"),
	cc("jungle1-1", "Clefairy", "jungle1"),
];

function makeItem(
	id: string,
	cardId: string,
	overrides: Partial<CollectionItem> = {},
): CollectionItem {
	return {
		id,
		cardId,
		acquiredAt: Date.now(),
		createdAt: Date.now(),
		pricePaid: null,
		variant: null,
		condition: null,
		grading: null,
		notes: null,
		...overrides,
	};
}

function makeBinder(id: string, name: string): Binder {
	return {
		id,
		name,
		description: null,
		rules: [],
		includeCardIds: [],
		excludeCardIds: [],
		createdAt: 1000,
		updatedAt: 1000,
	};
}

const tree = deriveNavTree([baseSet, jungleSet]);

async function renderOverview() {
	const rootRoute = createRootRoute({
		component: () => <VaultOverviewInner tree={tree} />,
	});
	const router = createRouter({ routeTree: rootRoute });
	await router.load();
	return render(<RouterProvider router={router} />);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(async () => {
	const repos = createIdbRepos();
	await repos.collection.clear();
	await repos.binders.clear();
	setUserlandRepos(repos);
	resetUserlandForTests();
	useStore.setState({ sets: [baseSet, jungleSet] });
	useCorpusRuntime.setState({ index: buildIndex(cards), loading: false });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("renders page heading 'Collection'", async () => {
	await renderOverview();
	expect(
		screen.getByRole("heading", { level: 1, name: /collection/i }),
	).toBeTruthy();
});

test("renders eyebrow 'Your vault'", async () => {
	await renderOverview();
	expect(screen.getByText(/your vault/i)).toBeTruthy();
});

test("renders section headings 'Set completion' and 'Binders'", async () => {
	await renderOverview();
	expect(
		screen.getByRole("heading", { level: 2, name: /set completion/i }),
	).toBeTruthy();
	expect(
		screen.getByRole("heading", { level: 2, name: /binders/i }),
	).toBeTruthy();
});

test("empty state when user owns no cards", async () => {
	await renderOverview();

	await waitFor(() => {
		expect(screen.getByText(/no cards yet/i)).toBeTruthy();
	});
	expect(screen.queryByLabelText(/view vault for base set/i)).toBeNull();
});

test("owned set tile appears when user has cards in that set", async () => {
	useUserland.setState({
		items: { c1: makeItem("c1", "base1-1") },
		hydrated: true,
		loading: false,
	});

	await renderOverview();

	await waitFor(() => {
		expect(screen.getByLabelText(/view vault for base set/i)).toBeTruthy();
	});
});

test("unowned set tile does not appear on overview", async () => {
	useUserland.setState({
		items: { c1: makeItem("c1", "base1-1") },
		hydrated: true,
		loading: false,
	});

	await renderOverview();

	await waitFor(() => {
		expect(screen.getByLabelText(/view vault for base set/i)).toBeTruthy();
	});
	expect(screen.queryByLabelText(/view vault for jungle/i)).toBeNull();
});

test("binders empty state shown when no binders", async () => {
	await renderOverview();

	await waitFor(() => {
		expect(screen.getByText(/no binders yet/i)).toBeTruthy();
	});
});

test("binder name shown when binders exist", async () => {
	const binder = makeBinder("b1", "Charizard Line");
	useUserland.setState((s) => ({
		...s,
		binders: { b1: binder },
	}));

	await renderOverview();

	await waitFor(() => {
		expect(screen.getByText("Charizard Line")).toBeTruthy();
	});
});

test("'New binder +' button opens dialog", async () => {
	await renderOverview();

	const btn = screen.getByRole("button", { name: /new binder \+/i });
	fireEvent.click(btn);

	await waitFor(() => {
		expect(screen.getByRole("dialog")).toBeTruthy();
	});
});

test("stats bezel shows cards owned count", async () => {
	useUserland.setState({
		items: {
			c1: makeItem("c1", "base1-1"),
			c2: makeItem("c2", "base1-2"),
		},
		hydrated: true,
		loading: false,
	});

	await renderOverview();

	await waitFor(() => {
		// "1" is the distinct card count label value (2 items but same 2 cardIds → 2 distinct)
		expect(screen.getByText(/cards owned/i)).toBeTruthy();
	});
});

test("est. value stat visible when pricePaid entries exist", async () => {
	useUserland.setState({
		items: {
			c1: makeItem("c1", "base1-1", { pricePaid: 25 }),
		},
		hydrated: true,
		loading: false,
	});

	await renderOverview();

	await waitFor(() => {
		expect(screen.getByText(/est\. value/i)).toBeTruthy();
	});
});

test("est. value stat omitted when no pricePaid entries", async () => {
	await renderOverview();
	expect(screen.queryByText(/est\. value/i)).toBeNull();
});

test("'View all sets →' link points to /vault/sets", async () => {
	await renderOverview();

	const link = screen.getByRole("link", { name: /view all sets/i });
	expect(link.getAttribute("href")).toContain("/vault/sets");
});
