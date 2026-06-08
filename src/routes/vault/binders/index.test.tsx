import { beforeEach, expect, test } from "bun:test";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { PokemonSet } from "../../../server/card-mappers";
import { useStore } from "../../../store";
import type { Binder, SerializedQuery } from "../../../store/userland/types";
import { useUserland } from "../../../store/userland/userland-store";
import {
	makeBinder,
	makeCorpusCard,
	renderInRouter,
	seedCorpus,
	setupUserlandTest,
} from "../../../test-utils";
import { VaultBindersInner } from "./index";

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

/** The binder shape these tests assert against: one empty rule + one manual include. */
function testBinder(overrides: Partial<Binder> = {}): Binder {
	return makeBinder({
		name: "My Test Binder",
		rules: [{ id: "r1", query: { ...emptyQuery } }],
		includeCardIds: ["base1-1"],
		...overrides,
	});
}

const renderInner = () => renderInRouter(<VaultBindersInner />);

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

test("empty state shows placeholder text", async () => {
	await renderInner();

	expect(screen.getByText(/no binders yet/i)).toBeTruthy();
});

test("binder renders with its name", async () => {
	const binder = testBinder();
	useUserland.setState((s) => ({
		binders: { ...s.binders, [binder.id]: binder },
	}));

	await renderInner();

	expect(screen.getByText("My Test Binder")).toBeTruthy();
});

test("binder renders a progress indicator", async () => {
	const binder = testBinder();
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
	const binder = testBinder({
		rules: [{ id: "r1", query: { ...emptyQuery } }],
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
	const binder = testBinder();
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
