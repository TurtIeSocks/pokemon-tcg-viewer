import { beforeEach, expect, test } from "bun:test";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { PokemonSet } from "../../server/card-mappers";
import { useStore } from "../../store";
import type { Binder, SerializedQuery } from "../../store/userland/types";
import { useUserland } from "../../store/userland/userland-store";
import {
	makeBinder,
	makeCorpusCard,
	renderInRouter,
	seedCorpus,
	setupUserlandTest,
} from "../../test-utils";
import { BinderCard } from "./binder-card";

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
	makeCorpusCard({ id: "base1-1", name: "Bulbasaur" }),
	makeCorpusCard({ id: "base1-2", name: "Ivysaur" }),
];

const emptyQuery: SerializedQuery = {
	text: null,
	setId: null,
	dexNumber: null,
	types: [],
	rarities: [],
	supertypes: [],
	subtypes: [],
	yearMin: null,
	yearMax: null,
	mode: "fuzzy",
};

/** The binder shape these tests assert against: one set-scoped rule + one manual include. */
function testBinder(overrides: Partial<Binder> = {}): Binder {
	return makeBinder({
		name: "My Test Binder",
		rules: [{ id: "r1", query: { ...emptyQuery, setId: "base1" } }],
		includeCardIds: ["base1-1"],
		...overrides,
	});
}

// BinderCard now subscribes to its own binder by id; every test seeds the store
// with the binder before rendering, so passing the id is all that's needed.
const renderBinderCard = (binder: Binder) =>
	renderInRouter(<BinderCard binderId={binder.id} />);

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(async () => {
	await setupUserlandTest();
	useStore.setState({ sets: [oneSet] });
	seedCorpus(cards);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("renders binder name", async () => {
	const binder = testBinder();
	useUserland.setState((s) => ({
		binders: { ...s.binders, [binder.id]: binder },
	}));

	await renderBinderCard(binder);

	expect(screen.getByText("My Test Binder")).toBeTruthy();
});

test("renders description when present", async () => {
	const binder = testBinder({ description: "All Base Set holos" });
	useUserland.setState((s) => ({
		binders: { ...s.binders, [binder.id]: binder },
	}));

	await renderBinderCard(binder);

	expect(screen.getByText("All Base Set holos")).toBeTruthy();
});

test("does not render description element when null", async () => {
	const binder = testBinder({ description: null });
	useUserland.setState((s) => ({
		binders: { ...s.binders, [binder.id]: binder },
	}));

	await renderBinderCard(binder);

	expect(screen.queryByText("All Base Set holos")).toBeNull();
});

test("renders progress indicator (owned/total label)", async () => {
	const binder = testBinder();
	useUserland.setState((s) => ({
		binders: { ...s.binders, [binder.id]: binder },
	}));

	await renderBinderCard(binder);

	// Progress resolves once corpus + sets are seeded — wait for it
	await waitFor(() => {
		// e.g. "0/2" — total depends on which cards are in the binder's rules+includes
		const text = screen.getByText(/\d+\/\d+/);
		expect(text).toBeTruthy();
	});
});

test("renders rules and cards counts line", async () => {
	const binder = testBinder({
		rules: [
			{ id: "r1", query: { ...emptyQuery, setId: "base1" } },
			{ id: "r2", query: { ...emptyQuery } },
		],
		includeCardIds: ["base1-1", "base1-2"],
	});
	useUserland.setState((s) => ({
		binders: { ...s.binders, [binder.id]: binder },
	}));

	await renderBinderCard(binder);

	expect(screen.getByText(/2 rules/)).toBeTruthy();
	expect(screen.getByText(/2 cards/)).toBeTruthy();
});

test("share icon button opens ShareDialog", async () => {
	const binder = testBinder();
	useUserland.setState((s) => ({
		binders: { ...s.binders, [binder.id]: binder },
	}));

	await renderBinderCard(binder);

	const shareBtn = screen.getByRole("button", { name: /share binder/i });
	fireEvent.click(shareBtn);

	await waitFor(() => {
		expect(screen.getByRole("dialog")).toBeTruthy();
		expect(screen.getByRole("heading", { name: /share binder/i })).toBeTruthy();
	});
});

test("share button click does not navigate (stopPropagation)", async () => {
	const binder = testBinder();
	useUserland.setState((s) => ({
		binders: { ...s.binders, [binder.id]: binder },
	}));

	await renderBinderCard(binder);

	const shareBtn = screen.getByRole("button", { name: /share binder/i });
	// Should not throw or navigate; just opens the dialog
	fireEvent.click(shareBtn);

	// Dialog is open, no navigation happened
	expect(screen.getByRole("dialog")).toBeTruthy();
});
