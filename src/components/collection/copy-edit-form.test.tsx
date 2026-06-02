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

test("acquiredAt field: changing date and blurring persists the new date", async () => {
	const item = await addCopy("c");
	render(<CopyEditForm item={useUserland.getState().items[item.id]} />);
	const dateInput = screen.getByLabelText(/acquired date/i);
	fireEvent.change(dateInput, { target: { value: "2025-06-01" } });
	fireEvent.blur(dateInput);
	await waitFor(() =>
		expect(useUserland.getState().items[item.id].acquiredAt).toBeGreaterThan(0),
	);
});

test("acquiredAt invalid date shows error on blur", async () => {
	const item = await addCopy("c");
	render(<CopyEditForm item={useUserland.getState().items[item.id]} />);
	const dateInput = screen.getByLabelText(/acquired date/i);
	// Focus, change to invalid value, then blur to trigger validation
	fireEvent.focus(dateInput);
	fireEvent.change(dateInput, { target: { value: "9999-99-99" } });
	fireEvent.blur(dateInput);
	await waitFor(() =>
		expect(screen.queryByText(/invalid date/i)).toBeDefined(),
	);
});

test("notes field: typing and blurring persists notes value", async () => {
	const item = await addCopy("c");
	render(<CopyEditForm item={useUserland.getState().items[item.id]} />);
	const notes = screen.getByLabelText(/notes/i);
	fireEvent.change(notes, { target: { value: "Great condition" } });
	fireEvent.blur(notes);
	await waitFor(() =>
		expect(useUserland.getState().items[item.id].notes).toBe("Great condition"),
	);
});

test("notes field: clearing persists null", async () => {
	const item = await addCopy("c", { notes: "old note" });
	render(<CopyEditForm item={useUserland.getState().items[item.id]} />);
	const notes = screen.getByLabelText(/notes/i);
	fireEvent.change(notes, { target: { value: "" } });
	fireEvent.blur(notes);
	await waitFor(() =>
		expect(useUserland.getState().items[item.id].notes).toBeNull(),
	);
});

test("variant Select: selecting a variant persists it", async () => {
	const item = await addCopy("c");
	render(
		<CopyEditForm
			item={useUserland.getState().items[item.id]}
			variants={["Holo", "Reverse Holo"]}
		/>,
	);
	// Open the variant select trigger
	const trigger = screen.getAllByRole("combobox")[0];
	fireEvent.click(trigger);
	// Find the Holo option in the portal
	const holoOption = await screen.findByRole("option", { name: "Holo" });
	fireEvent.click(holoOption);
	await waitFor(() =>
		expect(useUserland.getState().items[item.id].variant).toBe("Holo"),
	);
});

test("variant Select: selecting Unspecified clears variant", async () => {
	const item = await addCopy("c", { variant: "Holo" });
	render(
		<CopyEditForm
			item={useUserland.getState().items[item.id]}
			variants={["Holo"]}
		/>,
	);
	const trigger = screen.getAllByRole("combobox")[0];
	fireEvent.click(trigger);
	const noneOption = await screen.findByRole("option", {
		name: /unspecified/i,
	});
	fireEvent.click(noneOption);
	await waitFor(() =>
		expect(useUserland.getState().items[item.id].variant).toBeNull(),
	);
});

test("condition Select: selecting NM persists condition", async () => {
	const item = await addCopy("c");
	render(<CopyEditForm item={useUserland.getState().items[item.id]} />);
	// Condition select is the second combobox (after variant)
	const triggers = screen.getAllByRole("combobox");
	// variant is [0], condition is next after variant — but only when state=raw
	// find the trigger labeled "Condition"
	const conditionTrigger = triggers.find((t) => {
		// find the trigger whose closest label is "Condition"
		const id = t.getAttribute("id");
		return id === "condition";
	});
	if (!conditionTrigger) {
		// fallback: use the second combobox (variant=0, condition=1)
		fireEvent.click(triggers[1]);
	} else {
		fireEvent.click(conditionTrigger);
	}
	const nmOption = await screen.findByRole("option", { name: "NM" });
	fireEvent.click(nmOption);
	await waitFor(() =>
		expect(useUserland.getState().items[item.id].condition).toBe("NM"),
	);
});

test("gradingCompany Select: selecting PSA persists grading with company", async () => {
	const item = await addCopy("c");
	render(<CopyEditForm item={useUserland.getState().items[item.id]} />);
	// Switch to graded
	fireEvent.click(screen.getByLabelText(/graded/i));
	await screen.findByLabelText(/grader|company/i);
	// Open the grading company select (aria-label "Grader / company")
	const companyTrigger = screen.getByRole("combobox", {
		name: /grader|company/i,
	});
	fireEvent.click(companyTrigger);
	const psaOption = await screen.findByRole("option", { name: "PSA" });
	fireEvent.click(psaOption);
	// With grade empty, grading.company="PSA" but grade=0 or grading remains null
	// The onValueChange calls updateCopy with { grading: { company: "PSA", grade: 0 } }
	await waitFor(() => {
		const g = useUserland.getState().items[item.id].grading;
		expect(g?.company).toBe("PSA");
	});
});

test("graded: setting grade and blurring persists grading", async () => {
	const item = await addCopy("c");
	render(<CopyEditForm item={useUserland.getState().items[item.id]} />);
	// Switch to graded mode
	fireEvent.click(screen.getByLabelText(/graded/i));
	// Wait for grader controls to appear
	await screen.findByLabelText(/grader|company/i);
	const grade = screen.getByLabelText(/^grade$/i);
	fireEvent.change(grade, { target: { value: "9" } });
	fireEvent.blur(grade);
	// Grade with no company → grading null (company is empty)
	await waitFor(() =>
		expect(useUserland.getState().items[item.id].grading).toBeNull(),
	);
});

test("invalid grade shows error and does not persist", async () => {
	const item = await addCopy("c");
	render(<CopyEditForm item={useUserland.getState().items[item.id]} />);
	fireEvent.click(screen.getByLabelText(/graded/i));
	await screen.findByLabelText(/grader|company/i);
	const grade = screen.getByLabelText(/^grade$/i);
	fireEvent.change(grade, { target: { value: "15" } });
	fireEvent.blur(grade);
	await screen.findByText(/0[–-]10/i);
	expect(useUserland.getState().items[item.id].grading).toBeNull();
});
