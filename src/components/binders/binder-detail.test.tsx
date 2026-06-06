import { beforeEach, expect, test } from "bun:test";
import {
	createRootRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import {
	act,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import type { PokemonSet } from "../../server/card-mappers";
import { useStore } from "../../store";
import { buildIndex } from "../../store/corpus/corpus-engine";
import { useCorpusRuntime } from "../../store/corpus/corpus-runtime";
import type { CorpusCard } from "../../store/corpus/corpus-types";
import { createIdbRepos } from "../../store/userland/idb-repo";
import type { Binder } from "../../store/userland/types";
import {
	addRuleToBinder,
	addStack,
	createBinder,
	resetUserlandForTests,
	setUserlandRepos,
	useUserland,
} from "../../store/userland/userland-store";
import { BinderDetail } from "./binder-detail";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cc(
	id: string,
	name: string,
	setId: string,
	dex?: number[],
): CorpusCard {
	return {
		id,
		name,
		imageUrl: "",
		imageUrlSmall: "",
		supertype: "Pokémon",
		setId,
		number: "1",
		...(dex ? { nationalPokedexNumbers: dex } : {}),
	};
}

const testSet: PokemonSet = {
	id: "base1",
	name: "Base Set",
	series: "Base",
	releaseDate: "1999/01/09",
	total: 2,
	images: { symbol: "", logo: "" },
};

// Two corpus cards: one will be owned, one missing.
const ownedCard = cc("base1-1", "Bulbasaur", "base1", [1]);
const missingCard = cc("base1-2", "Ivysaur", "base1", [2]);

async function renderDetail(binder: Binder) {
	const rootRoute = createRootRoute({
		component: () => <BinderDetail binder={binder} />,
	});
	const router = createRouter({ routeTree: rootRoute });
	await router.load();
	return render(<RouterProvider router={router} />);
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

beforeEach(async () => {
	const repos = createIdbRepos();
	await repos.collection.clear();
	await repos.binders.clear();
	setUserlandRepos(repos);
	resetUserlandForTests();
	// Pre-seed sets
	useStore.setState({ sets: [testSet] });
	// Pre-seed corpus
	useCorpusRuntime.setState({
		index: buildIndex([ownedCard, missingCard]),
		loading: false,
	});
	// owned card is in the user's collection; missing card is not
	await addStack(ownedCard.id);
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
