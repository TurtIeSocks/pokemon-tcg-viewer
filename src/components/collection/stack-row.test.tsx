// stack-row.test.tsx
import { beforeEach, expect, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { addStack, useUserland } from "../../store/userland/userland-store";
import { setupUserlandTest } from "../../test-utils";
import { StackRow } from "./stack-row";

beforeEach(async () => {
	await setupUserlandTest();
});

test("renders stack row with delete button", async () => {
	const item = await addStack("c");
	render(<StackRow item={useUserland.getState().items[item.id]} />);
	expect(screen.getByRole("button", { name: /delete/i })).toBeDefined();
});

test("edit form is hidden initially; clicking Edit button reveals price/variant fields", async () => {
	const item = await addStack("c");
	render(<StackRow item={useUserland.getState().items[item.id]} />);
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
	const item = await addStack("c");
	render(<StackRow item={useUserland.getState().items[item.id]} />);
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
	const item = await addStack("c");
	render(<StackRow item={useUserland.getState().items[item.id]} />);
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

test("primary star toggle: clicking star on non-primary calls setPrimaryStack", async () => {
	await addStack("c");
	const item2 = await addStack("c");
	render(<StackRow item={useUserland.getState().items[item2.id]} />);
	const starBtn = screen.getByRole("button", {
		name: /set as primary|primary/i,
	});
	fireEvent.click(starBtn);
	await waitFor(() =>
		expect(useUserland.getState().items[item2.id].isPrimary).toBe(true),
	);
});

test("delete default stack (no optional fields): removes without confirm", async () => {
	const item = await addStack("c");
	const origConfirm = window.confirm;
	let confirmCalled = false;
	window.confirm = () => {
		confirmCalled = true;
		return false;
	};
	render(<StackRow item={useUserland.getState().items[item.id]} />);
	fireEvent.click(screen.getByRole("button", { name: /delete/i }));
	await waitFor(() =>
		expect(useUserland.getState().items[item.id]).toBeUndefined(),
	);
	expect(confirmCalled).toBe(false);
	window.confirm = origConfirm;
});

test("delete stack with data: shows confirm and cancels if denied", async () => {
	const item = await addStack("c", { pricePaid: 10 });
	const origConfirm = window.confirm;
	window.confirm = () => false;
	render(<StackRow item={useUserland.getState().items[item.id]} />);
	fireEvent.click(screen.getByRole("button", { name: /delete/i }));
	expect(useUserland.getState().items[item.id]).toBeDefined();
	window.confirm = origConfirm;
});

test("delete stack with data: removes after confirm", async () => {
	const item = await addStack("c", { pricePaid: 10 });
	const origConfirm = window.confirm;
	window.confirm = () => true;
	render(<StackRow item={useUserland.getState().items[item.id]} />);
	fireEvent.click(screen.getByRole("button", { name: /delete/i }));
	await waitFor(() =>
		expect(useUserland.getState().items[item.id]).toBeUndefined(),
	);
	window.confirm = origConfirm;
});

test("renders graded stack with grading summary badge", async () => {
	const item = await addStack("c", {
		grading: { company: "PSA", grade: 10 },
	});
	render(<StackRow item={useUserland.getState().items[item.id]} />);
	expect(screen.getByText(/PSA 10/)).toBeDefined();
});

test("graded stack delete triggers confirm (has non-null grading)", async () => {
	const item = await addStack("c", {
		grading: { company: "PSA", grade: 10 },
	});
	const origConfirm = window.confirm;
	let confirmCalled = false;
	window.confirm = () => {
		confirmCalled = true;
		return false;
	};
	render(<StackRow item={useUserland.getState().items[item.id]} />);
	fireEvent.click(screen.getByRole("button", { name: /delete/i }));
	expect(confirmCalled).toBe(true);
	window.confirm = origConfirm;
});

test("primary stack tile: primary tile shows filled star (no set-primary button)", async () => {
	const item = await addStack("c");
	const { setPrimaryStack } = await import(
		"../../store/userland/userland-store"
	);
	await setPrimaryStack("c", item.id);
	render(<StackRow item={useUserland.getState().items[item.id]} />);
	expect(screen.queryByRole("button", { name: /set as primary/i })).toBeNull();
});

test("split: a stack with quantity > 1 shows a ×N badge and a Split button", async () => {
	const item = await addStack("c", { quantity: 5 });
	render(<StackRow item={useUserland.getState().items[item.id]} />);
	expect(screen.getByText("×5")).toBeDefined();
	expect(screen.getByRole("button", { name: /split stack/i })).toBeDefined();
});

test("split: peeling 2 off a stack of 5 → original 3 + sibling 2 (fields copied)", async () => {
	const item = await addStack("c", { quantity: 5, condition: "NM" });
	render(<StackRow item={useUserland.getState().items[item.id]} />);
	fireEvent.click(screen.getByRole("button", { name: /split stack/i }));
	const input = await screen.findByLabelText(/quantity to split off/i);
	fireEvent.change(input, { target: { value: "2" } });
	fireEvent.click(screen.getByRole("button", { name: /split off/i }));
	await waitFor(() =>
		expect(useUserland.getState().items[item.id].quantity).toBe(3),
	);
	const cStacks = Object.values(useUserland.getState().items).filter(
		(s) => s.cardId === "c",
	);
	expect(cStacks).toHaveLength(2);
	expect(cStacks.some((s) => s.quantity === 2 && s.condition === "NM")).toBe(
		true,
	);
});

test("split: no Split button for a single-card stack (quantity 1)", async () => {
	const item = await addStack("c");
	render(<StackRow item={useUserland.getState().items[item.id]} />);
	expect(screen.queryByRole("button", { name: /split stack/i })).toBeNull();
});
