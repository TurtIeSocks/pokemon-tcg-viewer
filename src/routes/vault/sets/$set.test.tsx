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
