import { beforeEach, expect, test } from "bun:test";
import {
	createRootRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import type { PokemonSet } from "../../server/card-mappers";
import { useStore } from "../../store";
import { buildIndex } from "../../store/corpus/corpus-engine";
import { useCorpusRuntime } from "../../store/corpus/corpus-runtime";
import type { CorpusCard } from "../../store/corpus/corpus-types";
import {
	encodeSnapshot,
	type BinderSnapshot,
} from "../../store/userland/share";
import { SharedBinderInner } from "./shared";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function cc(id: string, name: string, setId: string): CorpusCard {
	return {
		id,
		name,
		imageUrl: `https://example.com/${id}.png`,
		imageUrlSmall: `https://example.com/${id}-sm.png`,
		supertype: "Pokémon",
		setId,
		number: "1",
	};
}

const oneSet: PokemonSet = {
	id: "base1",
	name: "Base Set",
	series: "Base",
	releaseDate: "1999/01/09",
	total: 2,
	images: { symbol: "", logo: "" },
};

const cards = [
	cc("base1-1", "Bulbasaur", "base1"),
	cc("base1-2", "Ivysaur", "base1"),
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

beforeEach(() => {
	useStore.setState({ sets: [oneSet] });
	useCorpusRuntime.setState({ index: buildIndex(cards), loading: false });
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

test("owned card renders in color (no grayscale), missing card renders greyscale", async () => {
	const snapshot = makeSnapshot();
	const encoded = encodeSnapshot(snapshot);
	window.location.hash = `#b=${encoded}`;

	await renderInner();

	// OwnedMissingGrid uses aria-label "owned"/"missing" on indicator dots
	const ownedDots = screen.getAllByRole("generic", { hidden: true }).filter(
		(el) => el.getAttribute("aria-label") === "owned",
	);
	const missingDots = screen.getAllByRole("generic", { hidden: true }).filter(
		(el) => el.getAttribute("aria-label") === "missing",
	);

	expect(ownedDots.length).toBeGreaterThanOrEqual(1);
	expect(missingDots.length).toBeGreaterThanOrEqual(1);

	// Owned card image should NOT have grayscale class
	const imgs = screen.getAllByRole("img");
	const bulbasaur = imgs.find((img) => img.getAttribute("alt") === "Bulbasaur");
	const ivysaur = imgs.find((img) => img.getAttribute("alt") === "Ivysaur");

	expect(bulbasaur).toBeTruthy();
	expect(ivysaur).toBeTruthy();

	// Owned card: no grayscale
	expect(bulbasaur!.className).not.toContain("grayscale");
	// Missing card: has grayscale
	expect(ivysaur!.className).toContain("grayscale");
});

test("garbage hash renders friendly error state", async () => {
	window.location.hash = "#b=garbage!!!notvalid";

	await renderInner();

	expect(
		screen.getByText(
			/couldn't read this shared binder — the link may be broken or incomplete/i,
		),
	).toBeTruthy();
});

test("empty hash renders friendly error state", async () => {
	window.location.hash = "";

	await renderInner();

	expect(
		screen.getByText(
			/couldn't read this shared binder — the link may be broken or incomplete/i,
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
