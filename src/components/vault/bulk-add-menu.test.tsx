// bulk-add-menu.test.tsx
import { beforeEach, expect, spyOn, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { buildIndex } from "../../store/corpus/corpus-engine";
import { useCorpusRuntime } from "../../store/corpus/corpus-runtime";
import { clearCorpus } from "../../store/corpus/corpus-store";
import type { CorpusCard } from "../../store/corpus/corpus-types";
import { createIdbRepos } from "../../store/userland/idb-repo";
import {
	createGoal,
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

let repos = createIdbRepos();

beforeEach(async () => {
	repos = createIdbRepos();
	await repos.collection.clear();
	await repos.goals.clear();
	setUserlandRepos(repos);
	resetUserlandForTests();
	await clearCorpus();
	useCorpusRuntime.setState({ index: buildIndex(base1Cards), loading: false });
	// Mark hydrated so useOwnedIndex works without network
	useUserland.setState({ hydrated: true });
});

function openMenu(name = /add all/i) {
	const trigger = screen.getByRole("button", { name });
	fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
}

// ---- Collection add ----

test("shows 'Add 2 to collection' when nothing is owned", async () => {
	render(<BulkAddMenu cardIds={["base1-1", "base1-2"]} />);
	openMenu();
	await waitFor(() =>
		expect(
			screen.getByRole("menuitem", { name: /add 2 to collection/i }),
		).toBeDefined(),
	);
});

test("collection-add adds unowned cards to the store", async () => {
	spyOn(globalThis, "confirm").mockImplementation(() => true);
	spyOn(globalThis, "alert").mockImplementation(() => {});

	render(<BulkAddMenu cardIds={["base1-1", "base1-2"]} />);
	openMenu();

	const item = await waitFor(() =>
		screen.getByRole("menuitem", { name: /add 2 to collection/i }),
	);
	fireEvent.click(item);

	await waitFor(() => {
		const items = Object.values(useUserland.getState().items);
		expect(items.length).toBe(2);
	});
});

test("shows 'Add 1 to collection' skipping already-owned card", async () => {
	// Pre-own base1-1
	await repos.collection.add({ cardId: "base1-1" });
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
		},
		hydrated: true,
	});

	spyOn(globalThis, "confirm").mockImplementation(() => true);
	spyOn(globalThis, "alert").mockImplementation(() => {});

	render(<BulkAddMenu cardIds={["base1-1", "base1-2"]} />);
	openMenu();

	const item = await waitFor(() =>
		screen.getByRole("menuitem", { name: /add 1 to collection/i }),
	);
	fireEvent.click(item);

	await waitFor(() => {
		const items = Object.values(useUserland.getState().items);
		// base1-1 already existed + base1-2 added = 2 total
		const cardIds = items.map((i) => i.cardId);
		expect(cardIds).toContain("base1-2");
	});
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

// ---- Goal add ----

test("goal-add with goalTarget={kind:set} adds that target to the goal", async () => {
	spyOn(globalThis, "alert").mockImplementation(() => {});

	const goal = await createGoal({ name: "Test Goal" });

	render(
		<BulkAddMenu
			cardIds={["base1-1", "base1-2"]}
			goalTarget={{ kind: "set", setId: "base1" }}
		/>,
	);
	openMenu();

	// The "Add to goal" submenu trigger should be visible
	const subTrigger = await waitFor(() =>
		screen.getByRole("menuitem", { name: /add to goal/i }),
	);
	fireEvent.click(subTrigger);

	// Goal items should appear
	const goalItem = await waitFor(() =>
		screen.getByRole("menuitem", { name: /test goal/i }),
	);
	fireEvent.click(goalItem);

	await waitFor(() => {
		const g = useUserland.getState().goals[goal.id];
		expect(g?.targets.some((t) => t.kind === "set")).toBe(true);
	});
});

test("shows disabled 'No goals yet' when no goals exist", async () => {
	render(<BulkAddMenu cardIds={["base1-1", "base1-2"]} />);
	openMenu();

	const subTrigger = await waitFor(() =>
		screen.getByRole("menuitem", { name: /add to goal/i }),
	);
	fireEvent.click(subTrigger);

	const noGoals = await waitFor(() =>
		screen.getByRole("menuitem", { name: /no goals yet/i }),
	);
	expect(noGoals.dataset.disabled).toBe("");
});

test("custom label renders on trigger button", () => {
	render(<BulkAddMenu cardIds={[]} label="Bulk add" />);
	expect(screen.getByRole("button", { name: /bulk add/i })).toBeDefined();
});
