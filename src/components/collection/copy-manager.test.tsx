// copy-manager.test.tsx
import { beforeEach, expect, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createIdbRepos } from "../../store/userland/idb-repo";
import {
	addCopy,
	resetUserlandForTests,
	setUserlandRepos,
	useUserland,
} from "../../store/userland/userland-store";
import { CopyManager } from "./copy-manager";
import { CopyManagerDialog } from "./copy-manager-dialog";

let repos = createIdbRepos();
beforeEach(async () => {
	repos = createIdbRepos();
	await repos.collection.clear();
	await repos.binders.clear();
	setUserlandRepos(repos);
	resetUserlandForTests();
});

test("add copy creates a row", async () => {
	await addCopy("c"); // seed 1 so manager shows
	render(<CopyManager cardId="c" />);
	fireEvent.click(screen.getByRole("button", { name: /add copy/i }));
	await waitFor(() =>
		expect(
			Object.values(useUserland.getState().items).filter(
				(i) => i.cardId === "c",
			),
		).toHaveLength(2),
	);
});

test("remove all copies: button is present and calls remove-all action (confirmed)", async () => {
	await addCopy("c");
	await addCopy("c");
	const orig = window.confirm;
	window.confirm = () => true;
	render(<CopyManager cardId="c" />);
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

test("Set as primary marks the copy primary", async () => {
	await addCopy("c");
	await addCopy("c");
	render(<CopyManager cardId="c" />);
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

test("CopyManagerDialog: Done button is present and calls onOpenChange(false)", async () => {
	await addCopy("dialog-card");
	let closedWith: boolean | null = null;
	render(
		<CopyManagerDialog
			cardId="dialog-card"
			name="Charizard"
			open={true}
			onOpenChange={(v) => {
				closedWith = v;
			}}
		/>,
	);
	const doneBtn = screen.getByRole("button", { name: /done/i });
	expect(doneBtn).toBeDefined();
	fireEvent.click(doneBtn);
	expect(closedWith!).toBe(false);
});
