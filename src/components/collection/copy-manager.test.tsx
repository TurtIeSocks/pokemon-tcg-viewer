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

test("Add copy button opens create-mode form (does NOT immediately create a copy)", async () => {
	render(<CopyManager cardId="c" />);
	const before = Object.values(useUserland.getState().items).filter(
		(i) => i.cardId === "c",
	).length;
	fireEvent.click(screen.getByRole("button", { name: /add copy/i }));
	// form should appear (Save button visible) but store is still empty
	await waitFor(() =>
		expect(screen.getByRole("button", { name: /save/i })).toBeDefined(),
	);
	expect(
		Object.values(useUserland.getState().items).filter((i) => i.cardId === "c")
			.length,
	).toBe(before);
});

test("Add copy → fill → Save creates the copy and collapses form", async () => {
	render(<CopyManager cardId="c" />);
	fireEvent.click(screen.getByRole("button", { name: /add copy/i }));
	await screen.findByRole("button", { name: /save/i });
	// fill in a price so the form is valid (date has a default)
	const price = screen.getByLabelText(/price paid/i);
	fireEvent.change(price, { target: { value: "7.5" } });
	fireEvent.click(screen.getByRole("button", { name: /save/i }));
	await waitFor(() => {
		const copies = Object.values(useUserland.getState().items).filter(
			(i) => i.cardId === "c",
		);
		expect(copies).toHaveLength(1);
		expect(copies[0].pricePaid).toBe(7.5);
	});
	// form collapsed — Save button gone
	await waitFor(() =>
		expect(screen.queryByRole("button", { name: /save/i })).toBeNull(),
	);
});

test("Add copy → Cancel adds nothing", async () => {
	render(<CopyManager cardId="c" />);
	fireEvent.click(screen.getByRole("button", { name: /add copy/i }));
	await screen.findByRole("button", { name: /cancel/i });
	fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
	expect(
		Object.values(useUserland.getState().items).filter((i) => i.cardId === "c"),
	).toHaveLength(0);
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
	expect(closedWith === false).toBe(true);
});
