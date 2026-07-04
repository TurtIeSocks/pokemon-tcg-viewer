import { afterEach, beforeEach, expect, test } from "bun:test";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import type { PokemonSet } from "../../server/card-mappers";
import { useStore } from "../../store";
import {
	resetPricesRuntimeForTests,
	usePricesRuntime,
} from "../../store/corpus/prices-runtime";
import type { Binder } from "../../store/userland/types";
import {
	addRuleToBinder,
	addStack,
	createBinder,
	useUserland,
} from "../../store/userland/userland-store";
import {
	makeCorpusCard,
	renderInRouter,
	seedCorpus,
	setupUserlandTest,
} from "../../test-utils";
import { BinderDetail } from "./binder-detail";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const testSet: PokemonSet = {
	id: "base1",
	name: "Base Set",
	series: "Base",
	releaseDate: "1999/01/09",
	total: 2,
	images: { symbol: "", logo: "" },
};

// Two corpus cards: one will be owned, one missing.
const ownedCard = makeCorpusCard({
	id: "base1-1",
	name: "Bulbasaur",
	nationalPokedexNumbers: [1],
});
const missingCard = makeCorpusCard({
	id: "base1-2",
	name: "Ivysaur",
	nationalPokedexNumbers: [2],
});

const renderDetail = (binder: Binder) =>
	renderInRouter(<BinderDetail binder={binder} />);

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

beforeEach(async () => {
	await setupUserlandTest();
	// Pre-seed sets
	useStore.setState({ sets: [testSet] });
	// Pre-seed corpus
	seedCorpus([ownedCard, missingCard]);
	// owned card is in the user's collection; missing card is not
	await addStack(ownedCard.id);
});

afterEach(async () => {
	await resetPricesRuntimeForTests();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("renders binder name and description", async () => {
	const binder = await createBinder({
		name: "My Binder",
		description: "Test binder",
	});
	useUserland.setState((s) => ({
		binders: { ...s.binders, [binder.id]: binder },
	}));

	await renderDetail(binder);

	expect(screen.getByText("My Binder")).toBeDefined();
	expect(screen.getByText("Test binder")).toBeDefined();
});

test("renders rule chip with human label", async () => {
	const binder = await createBinder({ name: "Set Binder" });
	await addRuleToBinder(binder.id, {
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
	});
	const updated = useUserland.getState().binders[binder.id];

	await renderDetail(updated);

	// binderRuleLabel resolves "base1" → "Base Set" via setNameResolver
	await waitFor(() => {
		expect(screen.getByText(/Base Set/)).toBeDefined();
	});
});

test("renders dex rule chip with species name resolved from the corpus", async () => {
	const binder = await createBinder({ name: "Dex Binder" });
	await addRuleToBinder(binder.id, {
		text: null,
		setId: null,
		dexNumber: 1,
		types: [],
		rarities: [],
		supertypes: [],
		subtypes: [],
		yearMin: null,
		yearMax: null,
		mode: "fuzzy" as const,
	});
	const updated = useUserland.getState().binders[binder.id];

	await renderDetail(updated);

	// binderRuleLabel resolves dex 1 → "Bulbasaur" via dexNameResolver; the
	// chip's remove-button label is unambiguous even if the member grid also
	// shows the card name. Unresolved fallback would be "Remove rule #1".
	await waitFor(() => {
		expect(screen.getByLabelText("Remove rule Bulbasaur")).toBeDefined();
	});
});

test("clicking rule × calls removeRuleFromBinder", async () => {
	const binder = await createBinder({ name: "Rule Binder" });
	await addRuleToBinder(binder.id, {
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
	});
	const updated = useUserland.getState().binders[binder.id];
	const ruleId = updated.rules[0].id;

	await renderDetail(updated);

	await waitFor(() => {
		expect(screen.getByLabelText(/Remove rule/)).toBeDefined();
	});

	const removeBtn = screen.getByLabelText(/Remove rule/);
	await act(async () => {
		fireEvent.click(removeBtn);
	});

	await waitFor(() => {
		expect(
			useUserland
				.getState()
				.binders[updated.id]?.rules.find((r) => r.id === ruleId),
		).toBeUndefined();
	});
});

test("member grid shows owned card without grayscale and missing card with grayscale", async () => {
	const binder = await createBinder({ name: "Members Binder" });
	// Add both cards as explicit members via includeCardIds patch
	await addRuleToBinder(binder.id, {
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
	});
	const updated = useUserland.getState().binders[binder.id];

	await renderDetail(updated);

	await waitFor(() => {
		expect(screen.getByAltText("Bulbasaur")).toBeDefined();
		expect(screen.getByAltText("Ivysaur")).toBeDefined();
	});

	const ownedImg = screen.getByAltText("Bulbasaur");
	const missingImg = screen.getByAltText("Ivysaur");

	expect(ownedImg.className).not.toContain("grayscale");
	expect(missingImg.className).toContain("grayscale");
});

test("Edit button opens BinderFormDialog", async () => {
	const binder = await createBinder({ name: "Editable Binder" });
	useUserland.setState((s) => ({
		binders: { ...s.binders, [binder.id]: binder },
	}));

	await renderDetail(binder);

	const editBtn = screen.getByRole("button", { name: /edit binder/i });
	await act(async () => {
		fireEvent.click(editBtn);
	});

	await waitFor(() => {
		expect(screen.getByRole("dialog")).toBeDefined();
		expect(screen.getByRole("heading", { name: /edit binder/i })).toBeDefined();
	});
});

test("Share button opens ShareDialog", async () => {
	const binder = await createBinder({ name: "Share Binder" });
	useUserland.setState((s) => ({
		binders: { ...s.binders, [binder.id]: binder },
	}));

	await renderDetail(binder);

	const shareBtn = screen.getByRole("button", { name: /share binder/i });
	await act(async () => {
		fireEvent.click(shareBtn);
	});

	// DialogTitle renders "Share Binder" — find it by heading role
	await waitFor(() => {
		expect(
			screen.getByRole("heading", { name: /share binder/i }),
		).toBeDefined();
	});
});

test("Delete: confirm=true calls removeBinder and binder is removed from store", async () => {
	const binder = await createBinder({ name: "Delete Me" });
	useUserland.setState((s) => ({
		binders: { ...s.binders, [binder.id]: binder },
	}));

	await renderDetail(binder);

	const origConfirm = window.confirm;
	window.confirm = () => true;

	const deleteBtn = screen.getByRole("button", { name: /delete binder/i });
	await act(async () => {
		fireEvent.click(deleteBtn);
	});

	await waitFor(() => {
		expect(useUserland.getState().binders[binder.id]).toBeUndefined();
	});

	window.confirm = origConfirm;
});

test("Delete: confirm=false does NOT remove binder", async () => {
	const binder = await createBinder({ name: "Keep Me" });
	useUserland.setState((s) => ({
		binders: { ...s.binders, [binder.id]: binder },
	}));

	await renderDetail(binder);

	const origConfirm = window.confirm;
	window.confirm = () => false;

	const deleteBtn = screen.getByRole("button", { name: /delete binder/i });
	await act(async () => {
		fireEvent.click(deleteBtn);
	});

	expect(useUserland.getState().binders[binder.id]).toBeDefined();

	window.confirm = origConfirm;
});

// --- back link ---

test("renders a back link with to=/vault/binders", async () => {
	const binder = await createBinder({ name: "Nav Binder" });
	useUserland.setState((s) => ({
		binders: { ...s.binders, [binder.id]: binder },
	}));

	await renderDetail(binder);

	const link = screen.getByRole("link", { name: /back to binders/i });
	expect(link).toBeDefined();
	// TanStack Link renders href from the `to` prop
	expect((link as HTMLAnchorElement).getAttribute("href")).toMatch(
		/\/vault\/binders/,
	);
});

// --- click-to-toggle-owned ---

test("clicking a member card toggles ownership via toggleCardOwned", async () => {
	const binder = await createBinder({ name: "Toggle Binder" });
	await addRuleToBinder(binder.id, {
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
	});
	const updated = useUserland.getState().binders[binder.id];

	await renderDetail(updated);

	// Wait for member cards to render
	await waitFor(() => {
		expect(screen.getByAltText("Bulbasaur")).toBeDefined();
	});

	// Bulbasaur is owned (added in beforeEach); clicking it should remove it
	const toggleBtn = screen.getByRole("button", { name: /remove bulbasaur/i });
	expect(toggleBtn).toBeDefined();

	await act(async () => {
		fireEvent.click(toggleBtn);
	});

	await waitFor(() => {
		const stacks = Object.values(useUserland.getState().items).filter(
			(i) => i.cardId === ownedCard.id,
		);
		expect(stacks).toHaveLength(0);
	});
});

test("clicking an unowned member card adds it via toggleCardOwned", async () => {
	const binder = await createBinder({ name: "Toggle Add Binder" });
	await addRuleToBinder(binder.id, {
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
	});
	const updated = useUserland.getState().binders[binder.id];

	await renderDetail(updated);

	await waitFor(() => {
		expect(screen.getByAltText("Ivysaur")).toBeDefined();
	});

	// Ivysaur is unowned; clicking should add it
	const toggleBtn = screen.getByRole("button", { name: /add ivysaur/i });
	expect(toggleBtn).toBeDefined();

	await act(async () => {
		fireEvent.click(toggleBtn);
	});

	await waitFor(() => {
		const stacks = Object.values(useUserland.getState().items).filter(
			(i) => i.cardId === missingCard.id,
		);
		expect(stacks).toHaveLength(1);
	});
});

// --- market value line ---

test("shows Market value when the binder's owned members are priced", async () => {
	usePricesRuntime.setState({
		byId: new Map([["base1-1", { tp: { N: [1000, null] } }]]), // $10 unit
		meta: {
			date: "x",
			sources: { tp: "x", cm: null },
			fx: { base: "EUR", date: "x", rates: { USD: 1.09 } },
		},
		status: "ready",
	});
	const binder = await createBinder({ name: "Priced Binder" });
	await addRuleToBinder(binder.id, {
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
	});
	const updated = useUserland.getState().binders[binder.id];

	await renderDetail(updated);

	// Bulbasaur (base1-1) is the only owned + priced member: $10 × 1 = $10.00
	await waitFor(() => {
		expect(screen.getByText("Market value")).toBeDefined();
		expect(screen.getByText("$10.00")).toBeDefined();
	});
});

test("does not show Market value when prices aren't loaded", async () => {
	const binder = await createBinder({ name: "Unpriced Binder" });
	await addRuleToBinder(binder.id, {
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
	});
	const updated = useUserland.getState().binders[binder.id];

	await renderDetail(updated);

	await waitFor(() => {
		expect(screen.getByText(/Base Set/)).toBeDefined();
	});
	expect(screen.queryByText("Market value")).toBeNull();
});
