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
import type { Stack } from "../../../store/userland/types";
import { useUserland } from "../../../store/userland/userland-store";
import {
	makeCorpusCard,
	makeStack,
	seedCorpus,
	setupUserlandTest,
} from "../../../test-utils";
import { VaultSetDetailInner } from "./$set";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const baseSet: PokemonSet = {
	id: "base1",
	name: "Base Set",
	series: "Base",
	releaseDate: "1999/01/09",
	total: 2,
	images: { symbol: "", logo: "" },
};

const cards = [
	makeCorpusCard({
		id: "base1-1",
		name: "Bulbasaur",
		setId: "base1",
		number: "1",
	}),
	makeCorpusCard({
		id: "base1-2",
		name: "Ivysaur",
		setId: "base1",
		number: "2",
	}),
];

function makeItem(id: string, cardId: string): Stack {
	return makeStack({ id, cardId, isPrimary: true });
}

async function renderSetDetail(setId: string, items: Stack[] = []) {
	const itemsRecord: Record<string, Stack> = {};
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
	await setupUserlandTest();
	useStore.setState({ sets: [baseSet] });
	seedCorpus(cards);
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

	// Cards render as the unified HoloCard (name on the wrapper aria-label). Owned
	// card is full color, missing card grayscale (driven by `.holo-card--owned`).
	const bulbasaur = await screen.findByRole("button", { name: "Bulbasaur" });
	const ivysaur = await screen.findByRole("button", { name: "Ivysaur" });
	expect(bulbasaur.className).toContain("holo-card--owned");
	expect(ivysaur.className).not.toContain("holo-card--owned");
});

test("Owned mode shows only owned card", async () => {
	await renderSetDetail("base1", [makeItem("c1", "base1-1")]);

	await waitFor(() => {
		expect(screen.getByText("Base Set")).toBeTruthy();
	});

	const ownedBtn = screen.getByRole("button", { name: /owned/i });
	fireEvent.click(ownedBtn);

	expect(await screen.findByRole("button", { name: "Bulbasaur" })).toBeTruthy();
	expect(screen.queryByRole("button", { name: "Ivysaur" })).toBeNull();
});

test("Missing mode shows only missing card", async () => {
	await renderSetDetail("base1", [makeItem("c1", "base1-1")]);

	await waitFor(() => {
		expect(screen.getByText("Base Set")).toBeTruthy();
	});

	const missingBtn = screen.getByRole("button", { name: /missing/i });
	fireEvent.click(missingBtn);

	expect(await screen.findByRole("button", { name: "Ivysaur" })).toBeTruthy();
	expect(screen.queryByRole("button", { name: "Bulbasaur" })).toBeNull();
});

test("bad set id shows not-found state", async () => {
	await renderSetDetail("does-not-exist");

	await waitFor(() => {
		expect(screen.getByText(/set not found/i)).toBeTruthy();
	});
});

test("resolves an owned asia set even though the west `sets` field never loaded it (cross-region)", async () => {
	const asiaSet: PokemonSet = {
		id: "sv1a",
		name: "Shiny Treasure ex",
		series: "Scarlet & Violet",
		releaseDate: "2023/12/01",
		total: 2,
		images: { symbol: "", logo: "" },
	};
	const asiaCards = [
		makeCorpusCard({
			id: "sv1a-1",
			name: "Pikachu ex",
			setId: "sv1a",
			number: "1",
		}),
		makeCorpusCard({
			id: "sv1a-2",
			name: "Eevee ex",
			setId: "sv1a",
			number: "2",
		}),
	];
	seedCorpus([...cards, ...asiaCards]);
	// Only `sets` (west) has base1; sv1a lives exclusively under setsByRegion.asia --
	// mirrors an owned card whose set was never loaded into the west list.
	useStore.setState((s) => ({
		setsByRegion: { ...s.setsByRegion, asia: [asiaSet] },
	}));

	await renderSetDetail("sv1a", [makeItem("c1", "sv1a-1")]);

	await waitFor(() => {
		expect(screen.getByText("Shiny Treasure ex")).toBeTruthy();
	});
	expect(screen.getByText(/1\/2 owned/)).toBeTruthy();
});
