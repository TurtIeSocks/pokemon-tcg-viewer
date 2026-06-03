import { beforeEach, expect, test } from "bun:test";
import {
	createRootRoute,
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
import type { Binder } from "../../../store/userland/types";
import {
	resetUserlandForTests,
	setUserlandRepos,
	useUserland,
} from "../../../store/userland/userland-store";
import { VaultBindersInner } from "./index";

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
					setId: null,
					dexNumber: null,
					types: [],
					rarities: [],
					supertypes: [],
					subtypes: [],
					yearMin: null,
					yearMax: null,
					exact: false,
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

async function renderInner() {
	const rootRoute = createRootRoute({
		component: () => <VaultBindersInner />,
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

test("empty state shows placeholder text", async () => {
	await renderInner();

	expect(screen.getByText(/no binders yet/i)).toBeTruthy();
});

test("binder renders with its name", async () => {
	const binder = makeBinder();
	useUserland.setState((s) => ({
		binders: { ...s.binders, [binder.id]: binder },
	}));

	await renderInner();

	expect(screen.getByText("My Test Binder")).toBeTruthy();
});

test("binder renders a progress indicator", async () => {
	const binder = makeBinder();
	useUserland.setState((s) => ({
		binders: { ...s.binders, [binder.id]: binder },
	}));

	await renderInner();

	await waitFor(() => {
		const text = screen.getByText(/\d+\/\d+/);
		expect(text).toBeTruthy();
	});
});

test("binder counts line shows rules and cards counts", async () => {
	const binder = makeBinder({
		rules: [
			{
				id: "r1",
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
					exact: false,
				},
			},
		],
		includeCardIds: ["base1-1", "base1-2"],
	});
	useUserland.setState((s) => ({
		binders: { ...s.binders, [binder.id]: binder },
	}));

	await renderInner();

	expect(screen.getByText(/1 rule/)).toBeTruthy();
	expect(screen.getByText(/2 cards/)).toBeTruthy();
});

test("clicking New binder opens the form dialog with title 'New Binder'", async () => {
	await renderInner();

	const btn = screen.getByRole("button", { name: /new binder/i });
	fireEvent.click(btn);

	await waitFor(() => {
		expect(screen.getByRole("dialog")).toBeTruthy();
		expect(screen.getByRole("heading", { name: /new binder/i })).toBeTruthy();
	});
});

test("clicking share icon opens ShareDialog without navigating", async () => {
	const binder = makeBinder();
	useUserland.setState((s) => ({
		binders: { ...s.binders, [binder.id]: binder },
	}));

	await renderInner();

	const shareBtn = screen.getByRole("button", { name: /share binder/i });
	fireEvent.click(shareBtn);

	await waitFor(() => {
		expect(screen.getByRole("dialog")).toBeTruthy();
		expect(screen.getByRole("heading", { name: /share binder/i })).toBeTruthy();
	});
});
