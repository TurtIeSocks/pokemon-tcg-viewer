import { beforeEach, expect, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createIdbRepos } from "../../store/userland/idb-repo";
import {
	resetUserlandForTests,
	setUserlandRepos,
	useUserland,
} from "../../store/userland/userland-store";
import { GoalFormDialog } from "./goal-form-dialog";

beforeEach(async () => {
	const repos = createIdbRepos();
	await repos.collection.clear();
	await repos.goals.clear();
	setUserlandRepos(repos);
	resetUserlandForTests();
});

test("renders open with title and name field", () => {
	render(<GoalFormDialog open={true} onOpenChange={() => {}} />);
	expect(screen.getByRole("dialog")).toBeTruthy();
	expect(screen.getByRole("heading", { name: /new goal/i })).toBeTruthy();
	expect(screen.getByLabelText(/name/i)).toBeTruthy();
});

test("submit with name calls createGoal and goal appears in store", async () => {
	render(<GoalFormDialog open={true} onOpenChange={() => {}} />);
	fireEvent.change(screen.getByLabelText(/name/i), {
		target: { value: "Base Set Complete" },
	});
	// Dialog uses a portal; form is in document.body not in container
	// biome-ignore lint/style/noNonNullAssertion: form is always present in the dialog
	fireEvent.submit(document.querySelector("form")!);
	await waitFor(() => {
		const goals = Object.values(useUserland.getState().goals);
		expect(goals.some((g) => g.name === "Base Set Complete")).toBe(true);
	});
});

test("submit calls onSaved with the created goal", async () => {
	let savedGoal: unknown = null;
	render(
		<GoalFormDialog
			open={true}
			onOpenChange={() => {}}
			onSaved={(g) => {
				savedGoal = g;
			}}
		/>,
	);
	const nameInput = screen.getByLabelText(/name/i);
	fireEvent.change(nameInput, { target: { value: "My Goal" } });
	// Submit by clicking the Create button
	fireEvent.click(screen.getByRole("button", { name: /create/i }));
	await waitFor(() => {
		expect(savedGoal).not.toBeNull();
		expect((savedGoal as { name: string }).name).toBe("My Goal");
	});
});

test("empty name is rejected (no createGoal call)", async () => {
	render(<GoalFormDialog open={true} onOpenChange={() => {}} />);
	const nameInput = screen.getByLabelText(/name/i);
	// Touch and blur without filling
	fireEvent.change(nameInput, { target: { value: "" } });
	fireEvent.blur(nameInput);
	fireEvent.click(screen.getByRole("button", { name: /create/i }));
	// Wait a tick — no goals should have been created
	await new Promise((r) => setTimeout(r, 50));
	expect(Object.values(useUserland.getState().goals)).toHaveLength(0);
});

test("edit mode shows Save button and updates existing goal", async () => {
	const repos = createIdbRepos();
	setUserlandRepos(repos);
	const goal = await repos.goals.create({ name: "Old Name" });
	useUserland.setState((s) => ({ goals: { ...s.goals, [goal.id]: goal } }));

	render(<GoalFormDialog open={true} onOpenChange={() => {}} goal={goal} />);
	expect(screen.getByRole("heading", { name: /edit goal/i })).toBeTruthy();
	const nameInput = screen.getByLabelText(/name/i);
	fireEvent.change(nameInput, { target: { value: "New Name" } });
	fireEvent.click(screen.getByRole("button", { name: /save/i }));
	await waitFor(() => {
		expect(useUserland.getState().goals[goal.id]?.name).toBe("New Name");
	});
});
