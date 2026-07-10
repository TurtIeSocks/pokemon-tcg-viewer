import { afterEach, beforeEach, expect, test } from "bun:test";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import type { PokemonSet } from "../../server/card-mappers";
import { useStore } from "../../store";
import {
	resetPricesRuntimeForTests,
	setPricesFetchersForTests,
	usePricesRuntime,
} from "../../store/corpus/prices-runtime";
import type { Binder } from "../../store/userland/types";
import {
	addCardsToBinder,
	addRuleToBinder,
	addStack,
	createBinder,
	removeCardFromBinder,
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
	// The "Print missing" dialog loads prices on open; stub the fetchers so this
	// file never reaches the network when a test opens it.
	setPricesFetchersForTests({
		fetchVersion: async () => {
			throw Object.assign(new Error("unavailable"), { status: 503 });
		},
		fetchBlob: async () => {
			throw Object.assign(new Error("unavailable"), { status: 503 });
		},
	});
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

test("member grid shows owned card in full color and missing card grayscale", async () => {
	const binder = await createBinder({ name: "Members Binder" });
	// A set rule pulls both base1 cards in as members.
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

	// Cards render as the unified HoloCard (name on the wrapper's aria-label; the
	// internal <img> is decorative alt=""). Grayscale-when-unowned is driven by
	// the `.holo-card--owned` class, so assert on that rather than an img filter.
	const ownedCard = await screen.findByRole("button", { name: "Bulbasaur" });
	const missingCard = await screen.findByRole("button", { name: "Ivysaur" });

	expect(ownedCard.className).toContain("holo-card--owned");
	expect(missingCard.className).not.toContain("holo-card--owned");
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

// --- unified mini-nav ownership ---

test("an owned member card's mini-nav surfaces the manage/owned state", async () => {
	const binder = await createBinder({ name: "Owned State Binder" });
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

	// Bulbasaur is owned (added in beforeEach); the unified mini-nav collection
	// button reads as "manage" (owned state), which opens the stack manager.
	expect(
		await screen.findByRole("button", {
			name: /manage stacks of bulbasaur/i,
		}),
	).toBeDefined();
});

test("clicking a missing member card's add button adds it to the collection", async () => {
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

	// Ivysaur is unowned; the mini-nav add button adds a copy via the shared
	// collection-toggle store write (the same path every card grid uses).
	const addBtn = await screen.findByRole("button", {
		name: /add ivysaur to collection/i,
	});

	await act(async () => {
		fireEvent.click(addBtn);
	});

	await waitFor(() => {
		const stacks = Object.values(useUserland.getState().items).filter(
			(i) => i.cardId === missingCard.id,
		);
		expect(stacks).toHaveLength(1);
	});
});

// --- print missing placeholders ---

test("Print missing button opens the modal listing the missing cards", async () => {
	const binder = await createBinder({ name: "Print Binder" });
	// Set rule pulls both base1 cards; only Bulbasaur is owned, so Ivysaur is missing.
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

	const printBtn = await screen.findByRole("button", {
		name: /print missing cards/i,
	});
	expect((printBtn as HTMLButtonElement).disabled).toBe(false);

	await act(async () => {
		fireEvent.click(printBtn);
	});

	// Exactly one missing card (Ivysaur); modal reports the count + a placeholder.
	await waitFor(() => {
		expect(screen.getByText("1 card to print")).toBeDefined();
	});
	const preview = screen.getByRole("region", { name: "Placeholder preview" });
	expect(preview.querySelectorAll(".tcgv-placeholder")).toHaveLength(1);
	expect(preview.textContent).toContain("Ivysaur");
});

test("Print missing button is disabled when nothing is missing", async () => {
	// Own the second card too, so every base1 member is owned.
	await addStack(missingCard.id);
	const binder = await createBinder({ name: "Complete Binder" });
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

	const printBtn = await screen.findByRole("button", {
		name: /print missing cards/i,
	});
	expect((printBtn as HTMLButtonElement).disabled).toBe(true);
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

// ---------------------------------------------------------------------------
// L3: binder-scoped member controls
// ---------------------------------------------------------------------------

/** A set rule that pulls every base1 card into the binder as a member. */
const BASE1_SET_RULE = {
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
};

test("the member grid receives binder context: per-card 'remove from this binder' appears", async () => {
	const binder = await createBinder({ name: "Ctx Binder" });
	await addRuleToBinder(binder.id, BASE1_SET_RULE);
	const updated = useUserland.getState().binders[binder.id];

	await renderDetail(updated);

	// OwnedMissingGrid was handed binderId + binder, so each cell's mini-nav gains
	// the binder-scoped remove control (absent when the grid has no binder context).
	expect(
		await screen.findByLabelText("Remove Bulbasaur from this binder"),
	).toBeDefined();
	// Rule members show the "via rule" source badge.
	expect(screen.getAllByText("via rule").length).toBeGreaterThan(0);
});

test("the retired manual-include chip row is gone, but rule chips remain", async () => {
	const binder = await createBinder({ name: "Chips Binder" });
	await addRuleToBinder(binder.id, BASE1_SET_RULE);
	// Manually include a card too — the OLD UI rendered a removable chip for it.
	await addCardsToBinder(binder.id, [ownedCard.id]);
	const updated = useUserland.getState().binders[binder.id];

	await renderDetail(updated);

	// Rule chip is still present (managing rules is a distinct concern we KEEP).
	await waitFor(() => {
		expect(screen.getByLabelText(/Remove rule/)).toBeDefined();
	});
	// The retired include-chip used aria "Remove {name} from binder"; it must be
	// gone (the per-cell control reads "…from this binder", a different label).
	expect(screen.queryByLabelText("Remove Bulbasaur from binder")).toBeNull();
});

test("excluded section lists excluded cards and Restore un-excludes (store state)", async () => {
	const binder = await createBinder({ name: "Chase Pile" });
	await addRuleToBinder(binder.id, BASE1_SET_RULE);
	// Exclude Ivysaur (a rule member) so it shows in the Excluded section.
	await removeCardFromBinder(binder.id, missingCard.id);
	const updated = useUserland.getState().binders[binder.id];
	expect(updated.excludeCardIds).toContain(missingCard.id);

	await renderDetail(updated);

	// The excluded card renders (only in the Excluded section — it is no longer a
	// member) alongside its Restore control.
	expect(await screen.findByText("Ivysaur")).toBeDefined();
	const restoreBtn = await screen.findByLabelText("Restore Ivysaur to binder");
	expect(restoreBtn).toBeDefined();

	await act(async () => {
		fireEvent.click(restoreBtn);
	});

	// Restore un-excludes the card (wires the previously-dead restore action).
	await waitFor(() => {
		expect(
			useUserland.getState().binders[binder.id]?.excludeCardIds,
		).not.toContain(missingCard.id);
	});
});

test("excluded section is absent when there are no exclusions", async () => {
	const binder = await createBinder({ name: "No Excludes Binder" });
	await addRuleToBinder(binder.id, BASE1_SET_RULE);
	const updated = useUserland.getState().binders[binder.id];

	await renderDetail(updated);

	await waitFor(() => {
		expect(
			screen.getByLabelText("Remove Bulbasaur from this binder"),
		).toBeDefined();
	});
	// No exclusions → ExcludedSection renders nothing (no Restore controls).
	expect(screen.queryByLabelText(/Restore/)).toBeNull();
});

test("bulk select → Remove from binder excludes every selected member", async () => {
	const binder = await createBinder({ name: "Bulk Binder" });
	await addRuleToBinder(binder.id, BASE1_SET_RULE);
	const updated = useUserland.getState().binders[binder.id];

	await renderDetail(updated);

	// Enter multi-select mode.
	const toggle = await screen.findByRole("button", { name: /select cards/i });
	await act(async () => {
		fireEvent.click(toggle);
	});

	// Select both members (the selection buttons are keyed by "Select {name}").
	const selectBulba = await screen.findByRole("button", {
		name: "Select Bulbasaur",
	});
	await act(async () => {
		fireEvent.click(selectBulba);
	});
	const selectIvy = await screen.findByRole("button", {
		name: "Select Ivysaur",
	});
	await act(async () => {
		fireEvent.click(selectIvy);
	});

	// The bulk bar's remove action fires one batched, undo-wrapped removal.
	const bulkRemove = await screen.findByRole("button", {
		name: /remove from binder/i,
	});
	await act(async () => {
		fireEvent.click(bulkRemove);
	});

	await waitFor(() => {
		const b = useUserland.getState().binders[binder.id];
		expect(b?.excludeCardIds).toContain(ownedCard.id);
		expect(b?.excludeCardIds).toContain(missingCard.id);
	});
});
