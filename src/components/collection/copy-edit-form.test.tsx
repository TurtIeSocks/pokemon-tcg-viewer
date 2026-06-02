// copy-edit-form.test.tsx
import { beforeEach, expect, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createIdbRepos } from "../../store/userland/idb-repo";
import {
	addCopy,
	resetUserlandForTests,
	setUserlandRepos,
	useUserland,
} from "../../store/userland/userland-store";
import { CopyEditForm } from "./copy-edit-form";

let repos = createIdbRepos();
beforeEach(async () => {
	repos = createIdbRepos();
	await repos.collection.clear();
	await repos.goals.clear();
	setUserlandRepos(repos);
	resetUserlandForTests();
});

test("editing price and blurring persists a numeric pricePaid", async () => {
	const item = await addCopy("c");
	render(<CopyEditForm item={useUserland.getState().items[item.id]} />);
	const price = screen.getByLabelText(/price/i);
	fireEvent.change(price, { target: { value: "12.5" } });
	fireEvent.blur(price);
	await waitFor(() =>
		expect(useUserland.getState().items[item.id].pricePaid).toBe(12.5),
	);
});

test("clearing price persists null", async () => {
	const item = await addCopy("c", { pricePaid: 5 });
	render(<CopyEditForm item={useUserland.getState().items[item.id]} />);
	const price = screen.getByLabelText(/price/i);
	fireEvent.change(price, { target: { value: "" } });
	fireEvent.blur(price);
	await waitFor(() =>
		expect(useUserland.getState().items[item.id].pricePaid).toBeNull(),
	);
});

test("negative price shows error and does not persist", async () => {
	const item = await addCopy("c");
	render(<CopyEditForm item={useUserland.getState().items[item.id]} />);
	const price = screen.getByLabelText(/price/i);
	fireEvent.change(price, { target: { value: "-3" } });
	fireEvent.blur(price);
	await screen.findByText(/≥ 0|number/i);
	expect(useUserland.getState().items[item.id].pricePaid).toBeNull();
});

test("switching to graded clears condition and reveals grader controls", async () => {
	const item = await addCopy("c", { condition: "NM" });
	render(<CopyEditForm item={useUserland.getState().items[item.id]} />);
	fireEvent.click(screen.getByLabelText(/graded/i));
	await waitFor(() =>
		expect(useUserland.getState().items[item.id].condition).toBeNull(),
	);
	expect(screen.getByLabelText(/grader|company/i)).toBeDefined();
});
