// stack-edit-form.test.tsx — draft→Save model
import { beforeEach, expect, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createIdbRepos } from "../../store/userland/idb-repo";
import {
	addStack,
	resetUserlandForTests,
	setUserlandRepos,
	useUserland,
} from "../../store/userland/userland-store";
import { StackEditForm } from "./stack-edit-form";

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
	const item = await addStack("c");
	const onSaved = () => {};
	const onCancel = () => {};
	render(
		<StackEditForm
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
	const item = await addStack("c");
	let cancelled = false;
	render(
		<StackEditForm
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
	const item = await addStack("c");
	render(
		<StackEditForm
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

test("edit: acquired-date field renders as a picker showing the stack's day", async () => {
	// Fixed local day → deterministic label (the form mapping is local-time).
	const item = await addStack("c", {
		acquiredAt: new Date(2024, 2, 15).getTime(),
	});
	render(
		<StackEditForm
			mode="edit"
			item={useUserland.getState().items[item.id]}
			cardId="c"
			onSaved={() => {}}
			onCancel={() => {}}
		/>,
	);
	const trigger = screen.getByLabelText(/acquired date/i);
	expect(trigger.tagName).toBe("BUTTON");
	expect(trigger.textContent).toContain("Mar 15, 2024");
});

test("edit: picking a day in the calendar persists acquiredAt on Save", async () => {
	const item = await addStack("c", {
		acquiredAt: new Date(2024, 2, 15).getTime(),
	});
	render(
		<StackEditForm
			mode="edit"
			item={useUserland.getState().items[item.id]}
			cardId="c"
			onSaved={() => {}}
			onCancel={() => {}}
		/>,
	);
	// Open the calendar (centred on the stack's month) and pick March 20.
	fireEvent.click(screen.getByLabelText(/acquired date/i));
	const day20 = await waitFor(() => {
		const btn = [...document.querySelectorAll("button[data-day]")].find(
			(b) => b.textContent?.trim() === "20",
		);
		if (!btn) throw new Error("day 20 not rendered");
		return btn as HTMLButtonElement;
	});
	fireEvent.click(day20);
	fireEvent.click(screen.getByRole("button", { name: /save/i }));
	await waitFor(() => {
		expect(useUserland.getState().items[item.id].acquiredAt).toBe(
			new Date(2024, 2, 20).getTime(),
		);
	});
});

test("edit: switching to graded reveals grader controls", async () => {
	const item = await addStack("c", { condition: "NM" });
	render(
		<StackEditForm
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
	const item = await addStack("c");
	render(
		<StackEditForm
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
	const item = await addStack("c");
	let saved = false;
	render(
		<StackEditForm
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

test("edit: variant pill: choosing a variant only persists on Save", async () => {
	const item = await addStack("c");
	render(
		<StackEditForm
			mode="edit"
			item={useUserland.getState().items[item.id]}
			cardId="c"
			variants={["Holo", "Reverse Holo"]}
			onSaved={() => {}}
			onCancel={() => {}}
		/>,
	);
	// Variant is now a segmented pill — find the "Holo" radio button
	const holoButton = screen.getByRole("radio", { name: "Holo" });
	fireEvent.click(holoButton);
	// pre-Save: store unchanged
	expect(useUserland.getState().items[item.id].variant).toBeNull();
	// Save
	fireEvent.click(screen.getByRole("button", { name: /save/i }));
	await waitFor(() =>
		expect(useUserland.getState().items[item.id].variant).toBe("Holo"),
	);
});

// ── create mode ─────────────────────────────────────────────────────────────

test("create: Save calls addStack and a new stack exists", async () => {
	let saved = false;
	render(
		<StackEditForm
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
		const stacks = Object.values(useUserland.getState().items).filter(
			(i) => i.cardId === "c",
		);
		expect(stacks).toHaveLength(1);
		expect(stacks[0].pricePaid).toBe(25);
	});
	expect(saved).toBe(true);
});

test("create: Cancel adds nothing", async () => {
	let cancelled = false;
	render(
		<StackEditForm
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
		<StackEditForm
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
	// no stack added
	expect(
		Object.values(useUserland.getState().items).filter((i) => i.cardId === "c"),
	).toHaveLength(0);
});

test("create: condition Select selecting NM is persisted on Save", async () => {
	render(
		<StackEditForm
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
		const stacks = Object.values(useUserland.getState().items).filter(
			(i) => i.cardId === "c",
		);
		expect(stacks).toHaveLength(1);
		expect(stacks[0].condition).toBe("NM");
	});
});

test("create: graded stack with PSA+9 is persisted on Save", async () => {
	render(
		<StackEditForm
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
		const stacks = Object.values(useUserland.getState().items).filter(
			(i) => i.cardId === "c",
		);
		expect(stacks).toHaveLength(1);
		expect(stacks[0].grading?.company).toBe("PSA");
		expect(stacks[0].grading?.grade).toBe(9);
	});
});
