// bulk-add-menu.test.tsx
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { clearCorpus } from "../../store/corpus/corpus-store";
import * as userlandStore from "../../store/userland/userland-store";
import { useUserland } from "../../store/userland/userland-store";
import {
	makeBinder,
	makeCorpusCard,
	makeStack,
	seedCorpus,
	setupUserlandTest,
} from "../../test-utils";
import { BulkAddMenu } from "./bulk-add-menu";

const base1Cards = [
	makeCorpusCard({ id: "base1-1", name: "Bulbasaur", number: "1" }),
	makeCorpusCard({ id: "base1-2", name: "Ivysaur", number: "2" }),
];

const binder1 = makeBinder({ id: "b1", name: "My Binder" });

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
	mode: "fuzzy" as const,
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
	mode: "fuzzy" as const,
};

// Spy references — set in beforeEach, restored in afterEach.
let spyBulkAddCopies: ReturnType<
	typeof spyOn<typeof userlandStore, "bulkAddStacks">
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

beforeEach(async () => {
	await setupUserlandTest();
	await clearCorpus();
	seedCorpus(base1Cards);
	useUserland.setState({ hydrated: true });

	// Spy on store actions used by the menu; all others remain real.
	spyBulkAddCopies = spyOn(userlandStore, "bulkAddStacks").mockImplementation(
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
		mock(async (input: { name: string }) =>
			makeBinder({ id: "new-b", name: input.name }),
		),
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

/**
 * Click the menu item matching `itemName` (opening its binder-picker dialog),
 * then click "My Binder" in that dialog.
 */
async function clickItemPickBinder(itemName: RegExp) {
	const item = await waitFor(() =>
		screen.getByRole("menuitem", { name: itemName }),
	);
	fireEvent.click(item);
	const binderBtn = await waitFor(() =>
		screen.getByRole("button", { name: /my binder/i }),
	);
	fireEvent.click(binderBtn);
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

test("collection-add calls bulkAddStacks with unowned cards", async () => {
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
			"copy-1": makeStack({ id: "copy-1", cardId: "base1-1" }),
			"copy-2": makeStack({ id: "copy-2", cardId: "base1-2" }),
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

test("'Add cards to binder' opens a picker dialog and calls addCardsToBinder", async () => {
	useUserland.setState({ binders: { b1: binder1 }, hydrated: true });

	render(<BulkAddMenu cardIds={["base1-1", "base1-2"]} />);
	openMenu();

	await clickItemPickBinder(/add 2 cards to binder/i);

	await waitFor(() => expect(spyAddCardsToBinder).toHaveBeenCalledTimes(1));
	expect(spyAddCardsToBinder.mock.calls[0]).toEqual([
		"b1",
		["base1-1", "base1-2"],
	]);
});

test("'Add cards to binder' dialog shows '＋ New binder…' even with no binders", async () => {
	render(<BulkAddMenu cardIds={["base1-1", "base1-2"]} />);
	openMenu();

	const item = await waitFor(() =>
		screen.getByRole("menuitem", { name: /add 2 cards to binder/i }),
	);
	fireEvent.click(item);

	await waitFor(() =>
		expect(screen.getByRole("button", { name: /new binder/i })).toBeDefined(),
	);
});

test("'Add cards to binder' dialog shows a 'No binders yet' hint when empty", async () => {
	render(<BulkAddMenu cardIds={["base1-1", "base1-2"]} />);
	openMenu();

	const item = await waitFor(() =>
		screen.getByRole("menuitem", { name: /add 2 cards to binder/i }),
	);
	fireEvent.click(item);

	await waitFor(() =>
		expect(screen.getByText(/no binders yet/i)).toBeDefined(),
	);
});

// ---- Item 3: Smart rule ----

test("'Add smart rule to binder' opens a picker dialog and calls addRuleToBinder", async () => {
	useUserland.setState({ binders: { b1: binder1 }, hydrated: true });

	render(
		<BulkAddMenu cardIds={["base1-1", "base1-2"]} ruleQuery={capturableRule} />,
	);
	openMenu();

	await clickItemPickBinder(/add smart rule to binder/i);

	await waitFor(() => expect(spyAddRuleToBinder).toHaveBeenCalledTimes(1));
	expect(spyAddRuleToBinder.mock.calls[0]).toEqual(["b1", capturableRule]);
});

test("smart-rule item is disabled when ruleQuery is null", async () => {
	render(<BulkAddMenu cardIds={["base1-1", "base1-2"]} ruleQuery={null} />);
	openMenu();

	const subTrigger = await waitFor(() =>
		screen.getByRole("menuitem", { name: /add smart rule to binder/i }),
	);
	expect(subTrigger.dataset.disabled).toBe("");
});

test("disabled smart-rule item shows its reason inline (tooltip would be unreachable)", async () => {
	render(<BulkAddMenu cardIds={["base1-1", "base1-2"]} ruleQuery={null} />);
	openMenu();

	// The reason text is always visible — a disabled item has pointer-events:none,
	// so a hover tooltip on it would never fire.
	await waitFor(() =>
		expect(
			screen.getByText(/apply a filter\/search to save it/i),
		).toBeDefined(),
	);
});

test("smart-rule item is disabled when ruleQuery is not capturable", async () => {
	render(
		<BulkAddMenu cardIds={["base1-1", "base1-2"]} ruleQuery={emptyRule} />,
	);
	openMenu();

	const subTrigger = await waitFor(() =>
		screen.getByRole("menuitem", { name: /add smart rule to binder/i }),
	);
	expect(subTrigger.dataset.disabled).toBe("");
});

test("smart-rule item is disabled when in select mode", async () => {
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
	await clickItemPickBinder(/add 1 cards to binder/i);
	await waitFor(() =>
		expect(spyAddCardsToBinder).toHaveBeenCalledWith("b1", ["base1-1"]),
	);
});

// ---- Custom label ----

test("custom label renders on trigger button", () => {
	render(<BulkAddMenu cardIds={[]} label="Bulk add" />);
	expect(screen.getByRole("button", { name: /bulk add/i })).toBeDefined();
});
