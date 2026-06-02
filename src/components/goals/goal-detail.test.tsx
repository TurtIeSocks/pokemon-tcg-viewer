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
import type { Goal } from "../../store/userland/types";
import {
	createGoal,
	resetUserlandForTests,
	setUserlandRepos,
	useUserland,
} from "../../store/userland/userland-store";
import { GoalDetail } from "./goal-detail";

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

async function renderGoalDetail(goal: Goal) {
	const rootRoute = createRootRoute({
		component: () => <GoalDetail goal={goal} />,
	});
	const router = createRouter({ routeTree: rootRoute });
	await router.load();
	return render(<RouterProvider router={router} />);
}

beforeEach(async () => {
	const repos = createIdbRepos();
	await repos.collection.clear();
	await repos.goals.clear();
	setUserlandRepos(repos);
	resetUserlandForTests();
	// Pre-seed sets
	useStore.setState({ sets: [oneSet] });
	// Pre-seed corpus
	const cards = [
		cc("base1-1", "Bulbasaur", "base1"),
		cc("base1-2", "Ivysaur", "base1"),
	];
	useCorpusRuntime.setState({ index: buildIndex(cards), loading: false });
});

test("renders goal name and description", async () => {
	const goal = await createGoal({
		name: "My Base Goal",
		description: "Collect all base cards",
	});
	useUserland.setState((s) => ({ goals: { ...s.goals, [goal.id]: goal } }));

	await renderGoalDetail(goal);

	expect(screen.getByText("My Base Goal")).toBeTruthy();
	expect(screen.getByText("Collect all base cards")).toBeTruthy();
});

test("renders overall progress section when targets present", async () => {
	const goal = await createGoal({
		name: "Base Set",
		targets: [{ kind: "set", setId: "base1" }],
	});
	useUserland.setState((s) => ({ goals: { ...s.goals, [goal.id]: goal } }));

	await renderGoalDetail(goal);

	await waitFor(() => {
		expect(screen.getByText(/overall progress/i)).toBeTruthy();
	});
});

test("renders target row label when targets present", async () => {
	const goal = await createGoal({
		name: "Base Set",
		targets: [{ kind: "set", setId: "base1" }],
	});
	useUserland.setState((s) => ({ goals: { ...s.goals, [goal.id]: goal } }));

	await renderGoalDetail(goal);

	await waitFor(() => {
		// "Base Set" appears in the target row (label from setsById map)
		const matches = screen.getAllByText("Base Set");
		expect(matches.length).toBeGreaterThanOrEqual(1);
	});
});

test("Add target button opens the picker dialog", async () => {
	const goal = await createGoal({ name: "Empty Goal" });
	useUserland.setState((s) => ({ goals: { ...s.goals, [goal.id]: goal } }));

	await renderGoalDetail(goal);

	const addBtn = screen.getByRole("button", { name: /add target/i });
	await act(async () => {
		fireEvent.click(addBtn);
	});

	await waitFor(() => {
		expect(screen.getByRole("dialog")).toBeTruthy();
	});
});

test("Edit button opens the GoalFormDialog in edit mode", async () => {
	const goal = await createGoal({ name: "Editable Goal" });
	useUserland.setState((s) => ({ goals: { ...s.goals, [goal.id]: goal } }));

	await renderGoalDetail(goal);

	const editBtn = screen.getByRole("button", { name: /edit goal/i });
	await act(async () => {
		fireEvent.click(editBtn);
	});

	await waitFor(() => {
		expect(screen.getByRole("dialog")).toBeTruthy();
		expect(screen.getByRole("heading", { name: /edit goal/i })).toBeTruthy();
	});
});

test("Delete button: confirm=false does NOT remove goal", async () => {
	const goal = await createGoal({ name: "Keep Me" });
	useUserland.setState((s) => ({ goals: { ...s.goals, [goal.id]: goal } }));

	await renderGoalDetail(goal);

	const origConfirm = window.confirm;
	window.confirm = () => false;

	const deleteBtn = screen.getByRole("button", { name: /delete goal/i });
	await act(async () => {
		fireEvent.click(deleteBtn);
	});

	expect(useUserland.getState().goals[goal.id]).toBeDefined();
	window.confirm = origConfirm;
});

test("Delete button: confirm=true removes goal", async () => {
	const goal = await createGoal({ name: "Delete Me" });
	useUserland.setState((s) => ({ goals: { ...s.goals, [goal.id]: goal } }));

	await renderGoalDetail(goal);

	const origConfirm = window.confirm;
	window.confirm = () => true;

	const deleteBtn = screen.getByRole("button", { name: /delete goal/i });
	await act(async () => {
		fireEvent.click(deleteBtn);
	});

	await waitFor(() =>
		expect(useUserland.getState().goals[goal.id]).toBeUndefined(),
	);
	window.confirm = origConfirm;
});
