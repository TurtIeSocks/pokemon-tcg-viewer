// bulk-add-menu.test.tsx
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { buildIndex } from "../../store/corpus/corpus-engine";
import { useCorpusRuntime } from "../../store/corpus/corpus-runtime";
import { clearCorpus } from "../../store/corpus/corpus-store";
import type { CorpusCard } from "../../store/corpus/corpus-types";
import { createIdbRepos } from "../../store/userland/idb-repo";
import * as userlandStore from "../../store/userland/userland-store";
import {
	resetUserlandForTests,
	setUserlandRepos,
	useUserland,
} from "../../store/userland/userland-store";
import { BulkAddMenu } from "./bulk-add-menu";

const base1Cards: CorpusCard[] = [
	{
		id: "base1-1",
		name: "Bulbasaur",
		imageUrl: "",
		imageUrlSmall: "",
		supertype: "Pokémon",
		setId: "base1",
		number: "1",
	},
	{
		id: "base1-2",
		name: "Ivysaur",
		imageUrl: "",
		imageUrlSmall: "",
		supertype: "Pokémon",
		setId: "base1",
		number: "2",
	},
];

const binder1 = {
	id: "b1",
	name: "My Binder",
	description: null,
	rules: [],
	includeCardIds: [],
	excludeCardIds: [],
	createdAt: 0,
	updatedAt: 0,
};

const capturableRule = {
	text: null,
	setId: "base1",
	dexNumber: null,
	types: [],
	rarities: [],
	supertypes: [],
	subtypes: [],
	yearMin: null,
	yearMax: null,
};

const emptyRule = {
	text: null,
	setId: null,
	dexNumber: null,
	types: [],
	rarities: [],
	supertypes: [],
	subtypes: [],
	yearMin: null,
	yearMax: null,
};

// Spy references — set in beforeEach, restored in afterEach.
let spyBulkAddCopies: ReturnType<
	typeof spyOn<typeof userlandStore, "bulkAddCopies">
>;
let spyAddCardsToBinder: ReturnType<
	typeof spyOn<typeof userlandStore, "addCardsToBinder">
>;
let spyAddRuleToBinder: ReturnType<
	typeof spyOn<typeof userlandStore, "addRuleToBinder">
>;
let spyCreateBinder: ReturnType<
	typeof spyOn<typeof userlandStore, "createBinder">
>;
let spyUpdateBinder: ReturnType<
	typeof spyOn<typeof userlandStore, "updateBinder">
>;

let repos = createIdbRepos();

beforeEach(async () => {
	repos = createIdbRepos();
	await repos.collection.clear();
	await repos.binders.clear();
	setUserlandRepos(repos);
	resetUserlandForTests();
	await clearCorpus();
	useCorpusRuntime.setState({ index: buildIndex(base1Cards), loading: false });
	useUserland.setState({ hydrated: true });

	// Spy on store actions used by the menu; all others remain real.
	spyBulkAddCopies = spyOn(userlandStore, "bulkAddCopies").mockImplementation(
		mock(async () => {}),
	);
	spyAddCardsToBinder = spyOn(
		userlandStore,
		"addCardsToBinder",
	).mockImplementation(mock(async () => {}));
	spyAddRuleToBinder = spyOn(
		userlandStore,
		"addRuleToBinder",
	).mockImplementation(mock(async () => {}));
	spyCreateBinder = spyOn(userlandStore, "createBinder").mockImplementation(
		mock(async (input: { name: string }) => ({
			id: "new-b",
			name: input.name,
			description: null,
			rules: [],
			includeCardIds: [],
			excludeCardIds: [],
			createdAt: 0,
			updatedAt: 0,
		})),
	);
	spyUpdateBinder = spyOn(userlandStore, "updateBinder").mockImplementation(
		mock(async () => {}),
	);
});

afterEach(() => {
	spyBulkAddCopies.mockRestore();
	spyAddCardsToBinder.mockRestore();
	spyAddRuleToBinder.mockRestore();
	spyCreateBinder.mockRestore();
	spyUpdateBinder.mockRestore();
});

function openMenu(name = /add all/i) {
	const trigger = screen.getByRole("button", { name });
	fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
}

// ---- Item 1: Collection add ----

test("shows 'Add 2 to collection' when nothing is owned", async () => {
	render(<BulkAddMenu cardIds={["base1-1", "base1-2"]} />);
	openMenu();
	await waitFor(() =>
		expect(
			screen.getByRole("menuitem", { name: /add 2 to collection/i }),
		).toBeDefined(),
	);
});

test("collection-add calls bulkAddCopies with unowned cards", async () => {
	spyOn(globalThis, "confirm").mockImplementation(() => true);
	spyOn(globalThis, "alert").mockImplementation(() => {});

	render(<BulkAddMenu cardIds={["base1-1", "base1-2"]} />);
	openMenu();

	const item = await waitFor(() =>
		screen.getByRole("menuitem", { name: /add 2 to collection/i }),
	);
	fireEvent.click(item);

	await waitFor(() => expect(spyBulkAddCopies).toHaveBeenCalledTimes(1));
	expect(spyBulkAddCopies.mock.calls[0][0]).toEqual(["base1-1", "base1-2"]);
});

test("collection item is disabled when all cards are owned", async () => {
	useUserland.setState({
		items: {
			"copy-1": {
				id: "copy-1",
				cardId: "base1-1",
				acquiredAt: 0,
				createdAt: 0,
				pricePaid: null,
				variant: null,
				notes: null,
				condition: null,
				grading: null,
			},
			"copy-2": {
				id: "copy-2",
				cardId: "base1-2",
				acquiredAt: 0,
				createdAt: 0,
				pricePaid: null,
				variant: null,
				notes: null,
				condition: null,
				grading: null,
			},
		},
		hydrated: true,
	});

	render(<BulkAddMenu cardIds={["base1-1", "base1-2"]} />);
	openMenu();

	const item = await waitFor(() =>
		screen.getByRole("menuitem", { name: /all owned/i }),
	);
	expect(item.dataset.disabled).toBe("");
});

// ---- Item 2: Add cards to binder ----

test("'Add cards to binder' submenu lists binders and calls addCardsToBinder", async () => {
	useUserland.setState({ binders: { b1: binder1 }, hydrated: true });

	render(<BulkAddMenu cardIds={["base1-1", "base1-2"]} />);
	openMenu();

	const subTrigger = await waitFor(() =>
		screen.getByRole("menuitem", { name: /add 2 cards to binder/i }),
	);
	fireEvent.click(subTrigger);

	const binderItem = await waitFor(() =>
		screen.getByRole("menuitem", { name: /my binder/i }),
	);
	fireEvent.click(binderItem);

	await waitFor(() => expect(spyAddCardsToBinder).toHaveBeenCalledTimes(1));
	expect(spyAddCardsToBinder.mock.calls[0]).toEqual([
		"b1",
		["base1-1", "base1-2"],
	]);
});

test("'Add cards to binder' shows '＋ New binder…' even with no binders", async () => {
	render(<BulkAddMenu cardIds={["base1-1", "base1-2"]} />);
	openMenu();

	const subTrigger = await waitFor(() =>
		screen.getByRole("menuitem", { name: /add 2 cards to binder/i }),
	);
	fireEvent.click(subTrigger);

	await waitFor(() =>
		expect(
			screen.getAllByRole("menuitem", { name: /new binder/i }).length,
		).toBeGreaterThan(0),
	);
});

// ---- Item 3: Smart rule ----

test("'Add smart rule to binder' calls addRuleToBinder when capturable", async () => {
	useUserland.setState({ binders: { b1: binder1 }, hydrated: true });

	render(
		<BulkAddMenu cardIds={["base1-1", "base1-2"]} ruleQuery={capturableRule} />,
	);
	openMenu();

	const subTrigger = await waitFor(() =>
		screen.getByRole("menuitem", { name: /add smart rule to binder/i }),
	);
	fireEvent.click(subTrigger);

	const binderItem = await waitFor(() =>
		screen.getByRole("menuitem", { name: /my binder/i }),
	);
	fireEvent.click(binderItem);

	await waitFor(() => expect(spyAddRuleToBinder).toHaveBeenCalledTimes(1));
	expect(spyAddRuleToBinder.mock.calls[0]).toEqual(["b1", capturableRule]);
});

test("smart-rule submenu trigger is disabled when ruleQuery is null", async () => {
	render(<BulkAddMenu cardIds={["base1-1", "base1-2"]} ruleQuery={null} />);
	openMenu();

	const subTrigger = await waitFor(() =>
		screen.getByRole("menuitem", { name: /add smart rule to binder/i }),
	);
	expect(subTrigger.dataset.disabled).toBe("");
});

test("smart-rule submenu trigger is disabled when ruleQuery is not capturable", async () => {
	render(
		<BulkAddMenu cardIds={["base1-1", "base1-2"]} ruleQuery={emptyRule} />,
	);
	openMenu();

	const subTrigger = await waitFor(() =>
		screen.getByRole("menuitem", { name: /add smart rule to binder/i }),
	);
	expect(subTrigger.dataset.disabled).toBe("");
});

test("smart-rule submenu trigger is disabled when in select mode", async () => {
	render(
		<BulkAddMenu
			cardIds={["base1-1", "base1-2"]}
			ruleQuery={capturableRule}
			selectedCardIds={["base1-1"]}
		/>,
	);
	openMenu();

	const subTrigger = await waitFor(() =>
		screen.getByRole("menuitem", { name: /add smart rule to binder/i }),
	);
	expect(subTrigger.dataset.disabled).toBe("");
});

// ---- selectedCardIds targeting ----

test("when selectedCardIds provided, card actions target the selection", async () => {
	spyOn(globalThis, "confirm").mockImplementation(() => true);
	spyOn(globalThis, "alert").mockImplementation(() => {});
	useUserland.setState({ binders: { b1: binder1 }, hydrated: true });

	render(
		<BulkAddMenu
			cardIds={["base1-1", "base1-2"]}
			ruleQuery={capturableRule}
			selectedCardIds={["base1-1"]}
		/>,
	);
	openMenu();

	// Collection item should show count 1 (unowned selection = 1)
	const collItem = await waitFor(() =>
		screen.getByRole("menuitem", { name: /add 1 to collection/i }),
	);
	fireEvent.click(collItem);
	await waitFor(() =>
		expect(spyBulkAddCopies).toHaveBeenCalledWith(["base1-1"]),
	);

	// Binder item should show "1 cards"
	openMenu();
	const subTrigger = await waitFor(() =>
		screen.getByRole("menuitem", { name: /add 1 cards to binder/i }),
	);
	fireEvent.click(subTrigger);
	const binderItem = await waitFor(() =>
		screen.getByRole("menuitem", { name: /my binder/i }),
	);
	fireEvent.click(binderItem);
	await waitFor(() =>
		expect(spyAddCardsToBinder).toHaveBeenCalledWith("b1", ["base1-1"]),
	);
});

// ---- Custom label ----

test("custom label renders on trigger button", () => {
	render(<BulkAddMenu cardIds={[]} label="Bulk add" />);
	expect(screen.getByRole("button", { name: /bulk add/i })).toBeDefined();
});
