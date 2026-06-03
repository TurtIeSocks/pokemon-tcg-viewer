// copy-edit-form.test.tsx — draft→Save model
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
	await repos.binders.clear();
	setUserlandRepos(repos);
	resetUserlandForTests();
});

// ── edit mode: draft → Save ──────────────────────────────────────────────────

test("edit: changing price does NOT update store until Save is clicked", async () => {
	const item = await addCopy("c");
	const onSaved = () => {};
	const onCancel = () => {};
	render(
		<CopyEditForm
			mode="edit"
			item={useUserland.getState().items[item.id]}
			cardId="c"
			onSaved={onSaved}
			onCancel={onCancel}
		/>,
	);
	const price = screen.getByLabelText(/price paid/i);
	fireEvent.change(price, { target: { value: "42" } });
	fireEvent.blur(price);
	// store must NOT be updated yet
	expect(useUserland.getState().items[item.id].pricePaid).toBeNull();

	// now click Save
	fireEvent.click(screen.getByRole("button", { name: /save/i }));
	await waitFor(() =>
		expect(useUserland.getState().items[item.id].pricePaid).toBe(42),
	);
});

test("edit: Cancel discards changes — store unchanged", async () => {
	const item = await addCopy("c");
	let cancelled = false;
	render(
		<CopyEditForm
			mode="edit"
			item={useUserland.getState().items[item.id]}
			cardId="c"
			onSaved={() => {}}
			onCancel={() => {
				cancelled = true;
			}}
		/>,
	);
	const price = screen.getByLabelText(/price paid/i);
	fireEvent.change(price, { target: { value: "99" } });
	fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
	expect(useUserland.getState().items[item.id].pricePaid).toBeNull();
	expect(cancelled).toBe(true);
});

test("edit: invalid price shows error text (not [object Object]) and has role=alert", async () => {
	const item = await addCopy("c");
	render(
		<CopyEditForm
			mode="edit"
			item={useUserland.getState().items[item.id]}
			cardId="c"
			onSaved={() => {}}
			onCancel={() => {}}
		/>,
	);
	const price = screen.getByLabelText(/price paid/i);
	fireEvent.change(price, { target: { value: "-3" } });
	fireEvent.blur(price);
	const errorEl = await screen.findByRole("alert");
	expect(errorEl.textContent).not.toBe("[object Object]");
	expect(errorEl.textContent).toMatch(/≥ 0|number/i);
	// store not updated
	expect(useUserland.getState().items[item.id].pricePaid).toBeNull();
});

test("edit: invalid date shows error on blur with role=alert", async () => {
	const item = await addCopy("c");
	render(
		<CopyEditForm
			mode="edit"
			item={useUserland.getState().items[item.id]}
			cardId="c"
			onSaved={() => {}}
			onCancel={() => {}}
		/>,
	);
	const dateInput = screen.getByLabelText(/acquired date/i);
	fireEvent.focus(dateInput);
	fireEvent.change(dateInput, { target: { value: "9999-99-99" } });
	fireEvent.blur(dateInput);
	await waitFor(() => {
		const alertEl = screen.queryByRole("alert");
		expect(alertEl).not.toBeNull();
	});
});

test("edit: switching to graded reveals grader controls", async () => {
	const item = await addCopy("c", { condition: "NM" });
	render(
		<CopyEditForm
			mode="edit"
			item={useUserland.getState().items[item.id]}
			cardId="c"
			onSaved={() => {}}
			onCancel={() => {}}
		/>,
	);
	fireEvent.click(screen.getByLabelText(/graded/i));
	expect(screen.getByLabelText(/grader|company/i)).toBeDefined();
});

test("edit: invalid grade shows error text and has role=alert", async () => {
	const item = await addCopy("c");
	render(
		<CopyEditForm
			mode="edit"
			item={useUserland.getState().items[item.id]}
			cardId="c"
			onSaved={() => {}}
			onCancel={() => {}}
		/>,
	);
	fireEvent.click(screen.getByLabelText(/graded/i));
	await screen.findByLabelText(/grader|company/i);
	const grade = screen.getByLabelText(/^grade$/i);
	fireEvent.change(grade, { target: { value: "15" } });
	fireEvent.blur(grade);
	const errorEl = await screen.findByRole("alert");
	expect(errorEl.textContent).not.toBe("[object Object]");
	expect(errorEl.textContent).toMatch(/0[–-]10/i);
});

test("edit: Save persists notes", async () => {
	const item = await addCopy("c");
	let saved = false;
	render(
		<CopyEditForm
			mode="edit"
			item={useUserland.getState().items[item.id]}
			cardId="c"
			onSaved={() => {
				saved = true;
			}}
			onCancel={() => {}}
		/>,
	);
	const notes = screen.getByLabelText(/notes/i);
	fireEvent.change(notes, { target: { value: "Great condition" } });
	fireEvent.click(screen.getByRole("button", { name: /save/i }));
	await waitFor(() =>
		expect(useUserland.getState().items[item.id].notes).toBe("Great condition"),
	);
	expect(saved).toBe(true);
});

test("edit: variant Select: choosing a variant only persists on Save", async () => {
	const item = await addCopy("c");
	render(
		<CopyEditForm
			mode="edit"
			item={useUserland.getState().items[item.id]}
			cardId="c"
			variants={["Holo", "Reverse Holo"]}
			onSaved={() => {}}
			onCancel={() => {}}
		/>,
	);
	const trigger = screen.getAllByRole("combobox")[0];
	fireEvent.click(trigger);
	const holoOption = await screen.findByRole("option", { name: "Holo" });
	fireEvent.click(holoOption);
	// pre-Save: store unchanged
	expect(useUserland.getState().items[item.id].variant).toBeNull();
	// Save
	fireEvent.click(screen.getByRole("button", { name: /save/i }));
	await waitFor(() =>
		expect(useUserland.getState().items[item.id].variant).toBe("Holo"),
	);
});

// ── create mode ─────────────────────────────────────────────────────────────

test("create: Save calls addCopy and a new copy exists", async () => {
	let saved = false;
	render(
		<CopyEditForm
			mode="create"
			cardId="c"
			onSaved={() => {
				saved = true;
			}}
			onCancel={() => {}}
		/>,
	);
	// form shows blank Save button (no item pre-filled)
	expect(screen.getByRole("button", { name: /save/i })).toBeDefined();
	// fill price
	const price = screen.getByLabelText(/price paid/i);
	fireEvent.change(price, { target: { value: "25" } });
	// Save
	fireEvent.click(screen.getByRole("button", { name: /save/i }));
	await waitFor(() => {
		const copies = Object.values(useUserland.getState().items).filter(
			(i) => i.cardId === "c",
		);
		expect(copies).toHaveLength(1);
		expect(copies[0].pricePaid).toBe(25);
	});
	expect(saved).toBe(true);
});

test("create: Cancel adds nothing", async () => {
	let cancelled = false;
	render(
		<CopyEditForm
			mode="create"
			cardId="c"
			onSaved={() => {}}
			onCancel={() => {
				cancelled = true;
			}}
		/>,
	);
	const price = screen.getByLabelText(/price paid/i);
	fireEvent.change(price, { target: { value: "10" } });
	fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
	expect(
		Object.values(useUserland.getState().items).filter((i) => i.cardId === "c"),
	).toHaveLength(0);
	expect(cancelled).toBe(true);
});

test("create: invalid input shows error and blocks Save", async () => {
	render(
		<CopyEditForm
			mode="create"
			cardId="c"
			onSaved={() => {}}
			onCancel={() => {}}
		/>,
	);
	const price = screen.getByLabelText(/price paid/i);
	fireEvent.change(price, { target: { value: "-5" } });
	fireEvent.blur(price);
	const errorEl = await screen.findByRole("alert");
	expect(errorEl.textContent).not.toBe("[object Object]");
	// no copy added
	expect(
		Object.values(useUserland.getState().items).filter((i) => i.cardId === "c"),
	).toHaveLength(0);
});

test("create: condition Select selecting NM is persisted on Save", async () => {
	render(
		<CopyEditForm
			mode="create"
			cardId="c"
			onSaved={() => {}}
			onCancel={() => {}}
		/>,
	);
	// default state is raw; condition select should be visible
	const triggers = screen.getAllByRole("combobox");
	// find condition trigger by id
	const conditionTrigger =
		triggers.find((t) => t.getAttribute("id") === "condition") ?? triggers[1];
	fireEvent.click(conditionTrigger);
	const nmOption = await screen.findByRole("option", { name: "NM" });
	fireEvent.click(nmOption);
	fireEvent.click(screen.getByRole("button", { name: /save/i }));
	await waitFor(() => {
		const copies = Object.values(useUserland.getState().items).filter(
			(i) => i.cardId === "c",
		);
		expect(copies).toHaveLength(1);
		expect(copies[0].condition).toBe("NM");
	});
});

test("create: graded copy with PSA+9 is persisted on Save", async () => {
	render(
		<CopyEditForm
			mode="create"
			cardId="c"
			onSaved={() => {}}
			onCancel={() => {}}
		/>,
	);
	fireEvent.click(screen.getByLabelText(/graded/i));
	await screen.findByLabelText(/grader|company/i);
	const companyTrigger = screen.getByRole("combobox", {
		name: /grader|company/i,
	});
	fireEvent.click(companyTrigger);
	const psaOption = await screen.findByRole("option", { name: "PSA" });
	fireEvent.click(psaOption);
	const gradeInput = screen.getByLabelText(/^grade$/i);
	fireEvent.change(gradeInput, { target: { value: "9" } });
	fireEvent.click(screen.getByRole("button", { name: /save/i }));
	await waitFor(() => {
		const copies = Object.values(useUserland.getState().items).filter(
			(i) => i.cardId === "c",
		);
		expect(copies).toHaveLength(1);
		expect(copies[0].grading?.company).toBe("PSA");
		expect(copies[0].grading?.grade).toBe(9);
	});
});
