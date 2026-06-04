// stack-manager.test.tsx
import { beforeEach, expect, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createIdbRepos } from "../../store/userland/idb-repo";
import {
	addStack,
	resetUserlandForTests,
	setUserlandRepos,
	useUserland,
} from "../../store/userland/userland-store";
import { StackManager } from "./stack-manager";

let repos = createIdbRepos();
beforeEach(async () => {
	repos = createIdbRepos();
	await repos.collection.clear();
	await repos.binders.clear();
	setUserlandRepos(repos);
	resetUserlandForTests();
});

test("Add stack button opens create-mode form (does NOT immediately create a stack)", async () => {
	render(<StackManager cardId="c" />);
	const before = Object.values(useUserland.getState().items).filter(
		(i) => i.cardId === "c",
	).length;
	fireEvent.click(screen.getByRole("button", { name: /add stack/i }));
	// form should appear (Save button visible) but store is still empty
	await waitFor(() =>
		expect(screen.getByRole("button", { name: /save/i })).toBeDefined(),
	);
	expect(
		Object.values(useUserland.getState().items).filter((i) => i.cardId === "c")
			.length,
	).toBe(before);
});

test("Add stack → fill → Save creates the stack and collapses form", async () => {
	render(<StackManager cardId="c" />);
	fireEvent.click(screen.getByRole("button", { name: /add stack/i }));
	await screen.findByRole("button", { name: /save/i });
	// fill in a price so the form is valid (date has a default)
	const price = screen.getByLabelText(/price paid/i);
	fireEvent.change(price, { target: { value: "7.5" } });
	fireEvent.click(screen.getByRole("button", { name: /save/i }));
	await waitFor(() => {
		const stacks = Object.values(useUserland.getState().items).filter(
			(i) => i.cardId === "c",
		);
		expect(stacks).toHaveLength(1);
		expect(stacks[0].pricePaid).toBe(7.5);
	});
	// form collapsed — Save button gone
	await waitFor(() =>
		expect(screen.queryByRole("button", { name: /save/i })).toBeNull(),
	);
});

test("Add stack → Cancel adds nothing", async () => {
	render(<StackManager cardId="c" />);
	fireEvent.click(screen.getByRole("button", { name: /add stack/i }));
	await screen.findByRole("button", { name: /cancel/i });
	fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
	expect(
		Object.values(useUserland.getState().items).filter((i) => i.cardId === "c"),
	).toHaveLength(0);
});

test("remove all stacks: button is present and calls remove-all action (confirmed)", async () => {
	await addStack("c");
	await addStack("c");
	const orig = window.confirm;
	window.confirm = () => true;
	render(<StackManager cardId="c" />);
	const removeAllBtn = screen.getByRole("button", { name: /remove all/i });
	expect(removeAllBtn).toBeDefined();
	fireEvent.click(removeAllBtn);
	await waitFor(() =>
		expect(
			Object.values(useUserland.getState().items).filter(
				(i) => i.cardId === "c",
			),
		).toHaveLength(0),
	);
	window.confirm = orig;
});

test("Set as primary marks the stack primary", async () => {
	await addStack("c");
	await addStack("c");
	render(<StackManager cardId="c" />);
	const btns = screen.getAllByRole("button", {
		name: /set as primary|primary/i,
	});
	fireEvent.click(btns[btns.length - 1]); // last row
	await waitFor(() =>
		expect(
			Object.values(useUserland.getState().items).some((i) => i.isPrimary),
		).toBe(true),
	);
});
