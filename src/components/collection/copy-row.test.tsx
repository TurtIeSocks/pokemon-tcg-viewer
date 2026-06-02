// copy-row.test.tsx
import { beforeEach, expect, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createIdbRepos } from "../../store/userland/idb-repo";
import {
	addCopy,
	resetUserlandForTests,
	setUserlandRepos,
	useUserland,
} from "../../store/userland/userland-store";
import { CopyRow } from "./copy-row";

let repos = createIdbRepos();
beforeEach(async () => {
	repos = createIdbRepos();
	await repos.collection.clear();
	await repos.goals.clear();
	setUserlandRepos(repos);
	resetUserlandForTests();
});

test("renders copy row with acquired date summary", async () => {
	const item = await addCopy("c");
	render(<CopyRow item={useUserland.getState().items[item.id]} />);
	expect(screen.getByRole("button", { name: /delete/i })).toBeDefined();
});

test("clicking the row summary toggles expand to show edit form", async () => {
	const item = await addCopy("c");
	render(<CopyRow item={useUserland.getState().items[item.id]} />);
	const toggleBtn = screen.getByRole("button", { expanded: false });
	fireEvent.click(toggleBtn);
	// CopyEditForm renders a label for "Price paid" when expanded
	await waitFor(() =>
		expect(screen.getByLabelText(/price paid/i)).toBeDefined(),
	);
});

test("delete default copy (no optional fields): removes without confirm", async () => {
	const item = await addCopy("c");
	const origConfirm = window.confirm;
	let confirmCalled = false;
	window.confirm = () => {
		confirmCalled = true;
		return false;
	};
	render(<CopyRow item={useUserland.getState().items[item.id]} />);
	fireEvent.click(screen.getByRole("button", { name: /delete/i }));
	await waitFor(() =>
		expect(useUserland.getState().items[item.id]).toBeUndefined(),
	);
	expect(confirmCalled).toBe(false);
	window.confirm = origConfirm;
});

test("delete copy with data: shows confirm and cancels if denied", async () => {
	const item = await addCopy("c", { pricePaid: 10 });
	const origConfirm = window.confirm;
	window.confirm = () => false;
	render(<CopyRow item={useUserland.getState().items[item.id]} />);
	fireEvent.click(screen.getByRole("button", { name: /delete/i }));
	// Item should remain since confirm returned false
	expect(useUserland.getState().items[item.id]).toBeDefined();
	window.confirm = origConfirm;
});

test("delete copy with data: removes after confirm", async () => {
	const item = await addCopy("c", { pricePaid: 10 });
	const origConfirm = window.confirm;
	window.confirm = () => true;
	render(<CopyRow item={useUserland.getState().items[item.id]} />);
	fireEvent.click(screen.getByRole("button", { name: /delete/i }));
	await waitFor(() =>
		expect(useUserland.getState().items[item.id]).toBeUndefined(),
	);
	window.confirm = origConfirm;
});

test("renders graded copy with grading summary", async () => {
	const item = await addCopy("c", {
		grading: { company: "PSA", grade: 10 },
	});
	render(<CopyRow item={useUserland.getState().items[item.id]} />);
	expect(screen.getByText(/PSA 10/)).toBeDefined();
});

test("graded copy delete triggers confirm (has non-null grading)", async () => {
	const item = await addCopy("c", {
		grading: { company: "PSA", grade: 10 },
	});
	const origConfirm = window.confirm;
	let confirmCalled = false;
	window.confirm = () => {
		confirmCalled = true;
		return false;
	};
	render(<CopyRow item={useUserland.getState().items[item.id]} />);
	fireEvent.click(screen.getByRole("button", { name: /delete/i }));
	expect(confirmCalled).toBe(true);
	window.confirm = origConfirm;
});
