import { beforeEach, expect, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { PokemonSet } from "../../server/card-mappers";
import { useStore } from "../../store";
import { useCorpusRuntime } from "../../store/corpus/corpus-runtime";
import { createIdbRepos } from "../../store/userland/idb-repo";
import {
	createGoal,
	resetUserlandForTests,
	setUserlandRepos,
	useUserland,
} from "../../store/userland/userland-store";
import { TargetPicker } from "./target-picker";

const oneSet: PokemonSet = {
	id: "base1",
	name: "Base Set",
	series: "Base",
	releaseDate: "1999/01/09",
	total: 102,
	images: { symbol: "", logo: "" },
};

beforeEach(async () => {
	const repos = createIdbRepos();
	await repos.collection.clear();
	await repos.goals.clear();
	setUserlandRepos(repos);
	resetUserlandForTests();
	// Pre-seed sets
	useStore.setState({ sets: [oneSet] });
	// Pre-seed corpus as empty (no network)
	useCorpusRuntime.setState({ index: null, loading: false });
});

test("renders open with the set in the Sets group", () => {
	render(<TargetPicker goalId="g1" open={true} onOpenChange={() => {}} />);
	expect(screen.getByRole("dialog")).toBeTruthy();
	expect(screen.getByText("Base Set")).toBeTruthy();
});

test("selecting a set calls addGoalTargets and goal gains a set target", async () => {
	const goal = await createGoal({ name: "Test" });

	render(<TargetPicker goalId={goal.id} open={true} onOpenChange={() => {}} />);

	const setItem = screen.getByText("Base Set");
	fireEvent.click(setItem);

	await waitFor(() => {
		const g = useUserland.getState().goals[goal.id];
		expect(g?.targets).toHaveLength(1);
		expect(g?.targets[0]).toEqual({ kind: "set", setId: "base1" });
	});
});

test("series group shows distinct series from sets", () => {
	render(<TargetPicker goalId="g1" open={true} onOpenChange={() => {}} />);
	// "Base" series should appear (from oneSet)
	expect(screen.getByText("Base")).toBeTruthy();
});

test("selecting a series adds a series target", async () => {
	const goal = await createGoal({ name: "Test" });

	render(<TargetPicker goalId={goal.id} open={true} onOpenChange={() => {}} />);

	const seriesItem = screen.getByText("Base");
	fireEvent.click(seriesItem);

	await waitFor(() => {
		const g = useUserland.getState().goals[goal.id];
		expect(g?.targets).toHaveLength(1);
		expect(g?.targets[0]).toEqual({ kind: "series", series: "Base" });
	});
});

test("cards group not shown when input < 2 chars", () => {
	render(<TargetPicker goalId="g1" open={true} onOpenChange={() => {}} />);
	// No card items should appear initially
	expect(screen.queryByText(/No cards match/)).toBeNull();
	// Cards group heading should not appear either
	expect(screen.queryByText("Cards")).toBeNull();
});
