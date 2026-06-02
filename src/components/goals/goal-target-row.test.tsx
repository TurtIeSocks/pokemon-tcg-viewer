// goal-target-row.test.tsx
import { beforeEach, expect, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { TargetProgress } from "../../store/userland/goal-progress";
import { createIdbRepos } from "../../store/userland/idb-repo";
import {
	createGoal,
	resetUserlandForTests,
	setUserlandRepos,
	useUserland,
} from "../../store/userland/userland-store";
import { GoalTargetRow } from "./goal-target-row";

let repos = createIdbRepos();
beforeEach(async () => {
	repos = createIdbRepos();
	await repos.collection.clear();
	await repos.goals.clear();
	setUserlandRepos(repos);
	resetUserlandForTests();
});

function makeTp(
	kind: "set" | "series" | "card",
	label: string,
): TargetProgress {
	const target =
		kind === "set"
			? ({ kind: "set", setId: "base1" } as const)
			: kind === "series"
				? ({ kind: "series", series: "Base" } as const)
				: ({ kind: "card", cardId: "base1-1" } as const);
	return { target, label, owned: 1, total: 2 };
}

test("renders set target: shows label and progress", () => {
	const tp = makeTp("set", "Base Set");
	render(<GoalTargetRow goalId="g1" tp={tp} />);
	expect(screen.getByText("Base Set")).toBeDefined();
	expect(screen.getByText("1/2")).toBeDefined();
});

test("renders series target: shows label and progress", () => {
	const tp = makeTp("series", "Base");
	render(<GoalTargetRow goalId="g1" tp={tp} />);
	expect(screen.getByText("Base")).toBeDefined();
	expect(screen.getByText("1/2")).toBeDefined();
});

test("renders card target: shows label and progress", () => {
	const tp = makeTp("card", "Charizard");
	render(<GoalTargetRow goalId="g1" tp={tp} />);
	expect(screen.getByText("Charizard")).toBeDefined();
	expect(screen.getByText("1/2")).toBeDefined();
});

test("remove button calls removeGoalTarget", async () => {
	const goal = await createGoal({
		name: "Test",
		targets: [{ kind: "set", setId: "base1" }],
	});
	useUserland.setState((s) => ({ goals: { ...s.goals, [goal.id]: goal } }));
	const tp = makeTp("set", "Base Set");
	render(<GoalTargetRow goalId={goal.id} tp={tp} />);
	const removeBtn = screen.getByRole("button", { name: /remove target/i });
	fireEvent.click(removeBtn);
	await waitFor(() =>
		expect(useUserland.getState().goals[goal.id]?.targets).toHaveLength(0),
	);
});
