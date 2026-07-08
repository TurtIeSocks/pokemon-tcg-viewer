import { beforeEach, expect, test } from "bun:test";
import {
	createRootRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import type { PokemonSet } from "../../server/card-mappers";
import { useStore } from "../../store";
import {
	type BinderSnapshot,
	encodeSnapshot,
} from "../../store/userland/share";
import {
	makeCorpusCard,
	seedCorpus,
	setupUserlandTest,
} from "../../test-utils";
import { SharedBinderInner } from "./shared";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const oneSet: PokemonSet = {
	id: "base1",
	name: "Base Set",
	series: "Base",
	releaseDate: "1999/01/09",
	total: 2,
	images: { symbol: "", logo: "" },
};

const cards = [
	makeCorpusCard({ id: "base1-1", name: "Bulbasaur", setId: "base1" }),
	makeCorpusCard({ id: "base1-2", name: "Ivysaur", setId: "base1" }),
];

function makeSnapshot(overrides: Partial<BinderSnapshot> = {}): BinderSnapshot {
	return {
		v: 1,
		name: "My Shared Binder",
		description: "A test description",
		sharedAt: new Date("2025-03-15").getTime(),
		scope: "all",
		cards: [
			{ cardId: "base1-1", owned: true },
			{ cardId: "base1-2", owned: false },
		],
		...overrides,
	};
}

async function renderInner() {
	const rootRoute = createRootRoute({
		component: () => <SharedBinderInner />,
	});
	const router = createRouter({ routeTree: rootRoute });
	await router.load();
	return render(<RouterProvider router={router} />);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(async () => {
	// The unified card mini-nav reads the userland store (binders + ownership),
	// so give each test a clean, hydrated userland.
	await setupUserlandTest();
	useStore.setState({ sets: [oneSet] });
	seedCorpus(cards);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("renders binder name and description from snapshot", async () => {
	const snapshot = makeSnapshot();
	const encoded = encodeSnapshot(snapshot);
	window.location.hash = `#b=${encoded}`;

	await renderInner();

	expect(screen.getByText("My Shared Binder")).toBeTruthy();
	expect(screen.getByText("A test description")).toBeTruthy();
});

test("renders snapshot banner with date and 'not live'", async () => {
	const snapshot = makeSnapshot();
	const encoded = encodeSnapshot(snapshot);
	window.location.hash = `#b=${encoded}`;

	await renderInner();

	// Banner must mention the date and "not live"
	const banner = screen.getByRole("note");
	expect(banner.textContent).toContain("not live");
	// Date should be a localeDateString of 2025-03-15
	const expectedDate = new Date(snapshot.sharedAt).toLocaleDateString();
	expect(banner.textContent).toContain(expectedDate);
});

test("snapshot-owned card renders in full color, missing card renders grayscale", async () => {
	const snapshot = makeSnapshot();
	const encoded = encodeSnapshot(snapshot);
	window.location.hash = `#b=${encoded}`;

	await renderInner();

	// The snapshot marks Bulbasaur owned and Ivysaur missing. Cards render as the
	// unified HoloCard: name on the wrapper aria-label, grayscale driven by the
	// `.holo-card--owned` class (present for the frozen snapshot's owned cards).
	const ownedCard = await screen.findByRole("button", { name: "Bulbasaur" });
	const missingCard = await screen.findByRole("button", { name: "Ivysaur" });

	expect(ownedCard.className).toContain("holo-card--owned");
	expect(missingCard.className).not.toContain("holo-card--owned");
});

test("garbage hash renders friendly error state", async () => {
	window.location.hash = "#b=garbage!!!notvalid";

	await renderInner();

	expect(
		screen.getByText(
			/couldn't read this shared binder\. the link may be broken or incomplete/i,
		),
	).toBeTruthy();
});

test("empty hash renders friendly error state", async () => {
	window.location.hash = "";

	await renderInner();

	expect(
		screen.getByText(
			/couldn't read this shared binder\. the link may be broken or incomplete/i,
		),
	).toBeTruthy();
});

test("snapshot without description renders only name", async () => {
	const snapshot = makeSnapshot({ description: null });
	const encoded = encodeSnapshot(snapshot);
	window.location.hash = `#b=${encoded}`;

	await renderInner();

	expect(screen.getByText("My Shared Binder")).toBeTruthy();
	// "A test description" should not appear
	expect(screen.queryByText("A test description")).toBeNull();
});

test("resolves a card from a snapshot whose set only lives under an asia region cache (cross-region)", async () => {
	const asiaSet: PokemonSet = {
		id: "sv1a",
		name: "Shiny Treasure ex",
		series: "Scarlet & Violet",
		releaseDate: "2023/12/01",
		total: 1,
		images: { symbol: "", logo: "" },
	};
	seedCorpus([
		...cards,
		makeCorpusCard({ id: "sv1a-1", name: "Pikachu ex", setId: "sv1a" }),
	]);
	// Only `sets` (west) has base1; sv1a lives exclusively under setsByRegion.asia.
	useStore.setState((s) => ({
		setsByRegion: { ...s.setsByRegion, asia: [asiaSet] },
	}));

	const snapshot = makeSnapshot({
		cards: [{ cardId: "sv1a-1", owned: true }],
	});
	const encoded = encodeSnapshot(snapshot);
	window.location.hash = `#b=${encoded}`;

	await renderInner();

	// Card name lives on the unified HoloCard wrapper's aria-label (role=button);
	// the internal <img> is decorative (alt="").
	expect(
		await screen.findByRole("button", { name: "Pikachu ex" }),
	).toBeTruthy();
});
