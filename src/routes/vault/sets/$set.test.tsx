import { beforeEach, expect, test } from "bun:test";
import { createMemoryHistory } from "@tanstack/history";
import {
	createRootRoute,
	createRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { PokemonSet } from "../../../server/card-mappers";
import { useStore } from "../../../store";
import { buildIndex } from "../../../store/corpus/corpus-engine";
import { useCorpusRuntime } from "../../../store/corpus/corpus-runtime";
import type { CorpusCard } from "../../../store/corpus/corpus-types";
import { createIdbRepos } from "../../../store/userland/idb-repo";
import type { CollectionItem } from "../../../store/userland/types";
import {
	resetUserlandForTests,
	setUserlandRepos,
	useUserland,
} from "../../../store/userland/userland-store";
import { VaultSetDetailInner } from "./$set";

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

const baseSet: PokemonSet = {
	id: "base1",
	name: "Base Set",
	series: "Base",
	releaseDate: "1999/01/09",
	total: 2,
	images: { symbol: "", logo: "" },
};

const cards = [
	cc("base1-1", "Bulbasaur", "base1", "1"),
	cc("base1-2", "Ivysaur", "base1", "2"),
];

function makeItem(id: string, cardId: string): CollectionItem {
	return {
		id,
		cardId,
		acquiredAt: Date.now(),
		pricePaid: null,
		variant: null,
		condition: null,
		grading: null,
		notes: null,
		isPrimary: true,
	};
}

async function renderSetDetail(setId: string, items: CollectionItem[] = []) {
	const itemsRecord: Record<string, CollectionItem> = {};
	for (const item of items) {
		itemsRecord[item.id] = item;
	}
	useUserland.setState({ items: itemsRecord, hydrated: true, loading: false });

	// Build a router that has the /vault/sets/$set param available
	const rootRoute = createRootRoute();
	const parentRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/vault/sets",
	});
	const setRoute = createRoute({
		getParentRoute: () => parentRoute,
		path: "/$set",
		component: () => <VaultSetDetailInner />,
	});
	const routeTree = rootRoute.addChildren([
		parentRoute.addChildren([setRoute]),
	]);
	const history = createMemoryHistory({
		initialEntries: [`/vault/sets/${setId}`],
	});
	const router = createRouter({ routeTree, history });
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
	useStore.setState({ sets: [baseSet] });
	useCorpusRuntime.setState({ index: buildIndex(cards), loading: false });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("renders set name and owned/total summary", async () => {
	await renderSetDetail("base1", [makeItem("c1", "base1-1")]);

	await waitFor(() => {
		expect(screen.getByText("Base Set")).toBeTruthy();
	});
	expect(screen.getByText(/1\/2 owned/)).toBeTruthy();
});

test("All mode shows both cards", async () => {
	await renderSetDetail("base1", [makeItem("c1", "base1-1")]);

	await waitFor(() => {
		// Both cards visible in All mode (default)
		expect(screen.getByAltText("Bulbasaur")).toBeTruthy();
		expect(screen.getByAltText("Ivysaur")).toBeTruthy();
	});

	// Owned card no grayscale, missing card has grayscale
	const bulbasaur = screen.getByAltText("Bulbasaur");
	const ivysaur = screen.getByAltText("Ivysaur");
	expect(bulbasaur.className).not.toContain("grayscale");
	expect(ivysaur.className).toContain("grayscale");
});

test("Owned mode shows only owned card", async () => {
	await renderSetDetail("base1", [makeItem("c1", "base1-1")]);

	await waitFor(() => {
		expect(screen.getByText("Base Set")).toBeTruthy();
	});

	const ownedBtn = screen.getByRole("button", { name: /owned/i });
	fireEvent.click(ownedBtn);

	await waitFor(() => {
		expect(screen.getByAltText("Bulbasaur")).toBeTruthy();
	});
	expect(screen.queryByAltText("Ivysaur")).toBeNull();
});

test("Missing mode shows only missing card", async () => {
	await renderSetDetail("base1", [makeItem("c1", "base1-1")]);

	await waitFor(() => {
		expect(screen.getByText("Base Set")).toBeTruthy();
	});

	const missingBtn = screen.getByRole("button", { name: /missing/i });
	fireEvent.click(missingBtn);

	await waitFor(() => {
		expect(screen.getByAltText("Ivysaur")).toBeTruthy();
	});
	expect(screen.queryByAltText("Bulbasaur")).toBeNull();
});

test("bad set id shows not-found state", async () => {
	await renderSetDetail("does-not-exist");

	await waitFor(() => {
		expect(screen.getByText(/set not found/i)).toBeTruthy();
	});
});
