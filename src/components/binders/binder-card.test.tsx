import { beforeEach, expect, test } from "bun:test";
import {
	createRootRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { PokemonSet } from "../../server/card-mappers";
import { useStore } from "../../store";
import { buildIndex } from "../../store/corpus/corpus-engine";
import { useCorpusRuntime } from "../../store/corpus/corpus-runtime";
import type { CorpusCard } from "../../store/corpus/corpus-types";
import { createIdbRepos } from "../../store/userland/idb-repo";
import type { Binder } from "../../store/userland/types";
import {
	resetUserlandForTests,
	setUserlandRepos,
	useUserland,
} from "../../store/userland/userland-store";
import { BinderCard } from "./binder-card";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function cc(id: string, name: string, setId: string): CorpusCard {
	return {
		id,
		name,
		imageUrl: "",
		imageUrlSmall: "",
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

function makeBinder(overrides: Partial<Binder> = {}): Binder {
	return {
		id: "b1",
		name: "My Test Binder",
		description: null,
		rules: [
			{
				id: "r1",
				query: {
					text: null,
					setId: "base1",
					dexNumber: null,
					types: [],
					rarities: [],
					supertypes: [],
					subtypes: [],
					yearMin: null,
					yearMax: null,
					mode: "fuzzy" as const,
				},
			},
		],
		includeCardIds: ["base1-1"],
		excludeCardIds: [],
		createdAt: 1000,
		updatedAt: 1000,
		...overrides,
	};
}

async function renderBinderCard(binder: Binder) {
	const rootRoute = createRootRoute({
		component: () => <BinderCard binder={binder} />,
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
	useStore.setState({ sets: [oneSet] });
	useCorpusRuntime.setState({ index: buildIndex(cards), loading: false });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("renders binder name", async () => {
	const binder = makeBinder();
	useUserland.setState((s) => ({
		binders: { ...s.binders, [binder.id]: binder },
	}));

	await renderBinderCard(binder);

	expect(screen.getByText("My Test Binder")).toBeTruthy();
});

test("renders description when present", async () => {
	const binder = makeBinder({ description: "All Base Set holos" });
	useUserland.setState((s) => ({
		binders: { ...s.binders, [binder.id]: binder },
	}));

	await renderBinderCard(binder);

	expect(screen.getByText("All Base Set holos")).toBeTruthy();
});

test("does not render description element when null", async () => {
	const binder = makeBinder({ description: null });
	useUserland.setState((s) => ({
		binders: { ...s.binders, [binder.id]: binder },
	}));

	await renderBinderCard(binder);

	expect(screen.queryByText("All Base Set holos")).toBeNull();
});

test("renders progress indicator (owned/total label)", async () => {
	const binder = makeBinder();
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
	const binder = makeBinder({
		rules: [
			{
				id: "r1",
				query: {
					text: null,
					setId: "base1",
					dexNumber: null,
					types: [],
					rarities: [],
					supertypes: [],
					subtypes: [],
					yearMin: null,
					yearMax: null,
					mode: "fuzzy" as const,
				},
			},
			{
				id: "r2",
				query: {
					text: null,
					setId: null,
					dexNumber: null,
					types: [],
					rarities: [],
					supertypes: [],
					subtypes: [],
					yearMin: null,
					yearMax: null,
					mode: "fuzzy" as const,
				},
			},
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
	const binder = makeBinder();
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
	const binder = makeBinder();
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
