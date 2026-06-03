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
	await repos.binders.clear();
	setUserlandRepos(repos);
	resetUserlandForTests();
});

test("renders copy row with delete button", async () => {
	const item = await addCopy("c");
	render(<CopyRow item={useUserland.getState().items[item.id]} />);
	expect(screen.getByRole("button", { name: /delete/i })).toBeDefined();
});

test("edit form is hidden initially; clicking Edit button reveals price/variant fields", async () => {
	const item = await addCopy("c");
	render(<CopyRow item={useUserland.getState().items[item.id]} />);
	// form fields should not be visible before clicking Edit
	expect(screen.queryByLabelText(/price paid/i)).toBeNull();
	// Edit button must be present
	const editBtn = screen.getByRole("button", { name: /edit/i });
	fireEvent.click(editBtn);
	// after click, price field appears
	await waitFor(() =>
		expect(screen.getByLabelText(/price paid/i)).toBeDefined(),
	);
	// Save + Cancel buttons also appear
	expect(screen.getByRole("button", { name: /save/i })).toBeDefined();
	expect(screen.getByRole("button", { name: /cancel/i })).toBeDefined();
});

test("edit: changing price does NOT update store until Save is clicked", async () => {
	const item = await addCopy("c");
	render(<CopyRow item={useUserland.getState().items[item.id]} />);
	fireEvent.click(screen.getByRole("button", { name: /edit/i }));
	await screen.findByLabelText(/price paid/i);

	const price = screen.getByLabelText(/price paid/i);
	fireEvent.change(price, { target: { value: "55" } });
	fireEvent.blur(price);
	// pre-Save: no store change
	expect(useUserland.getState().items[item.id].pricePaid).toBeNull();

	fireEvent.click(screen.getByRole("button", { name: /save/i }));
	await waitFor(() =>
		expect(useUserland.getState().items[item.id].pricePaid).toBe(55),
	);
	// form collapses after save
	await waitFor(() =>
		expect(screen.queryByRole("button", { name: /save/i })).toBeNull(),
	);
});

test("edit: Cancel discards changes — store unchanged and form closes", async () => {
	const item = await addCopy("c");
	render(<CopyRow item={useUserland.getState().items[item.id]} />);
	fireEvent.click(screen.getByRole("button", { name: /edit/i }));
	await screen.findByLabelText(/price paid/i);
	const price = screen.getByLabelText(/price paid/i);
	fireEvent.change(price, { target: { value: "99" } });
	fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
	// store unchanged
	expect(useUserland.getState().items[item.id].pricePaid).toBeNull();
	// form closed
	await waitFor(() =>
		expect(screen.queryByLabelText(/price paid/i)).toBeNull(),
	);
});

test("primary star toggle: clicking star on non-primary calls setPrimaryCopy", async () => {
	await addCopy("c");
	const item2 = await addCopy("c");
	render(<CopyRow item={useUserland.getState().items[item2.id]} />);
	const starBtn = screen.getByRole("button", {
		name: /set as primary|primary/i,
	});
	fireEvent.click(starBtn);
	await waitFor(() =>
		expect(useUserland.getState().items[item2.id].isPrimary).toBe(true),
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

test("renders graded copy with grading summary badge", async () => {
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

test("primary copy tile: primary tile shows filled star (no set-primary button)", async () => {
	const item = await addCopy("c");
	const { setPrimaryCopy } = await import(
		"../../store/userland/userland-store"
	);
	await setPrimaryCopy("c", item.id);
	render(<CopyRow item={useUserland.getState().items[item.id]} />);
	expect(screen.queryByRole("button", { name: /set as primary/i })).toBeNull();
});
