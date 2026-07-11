import { beforeEach, expect, spyOn, test } from "bun:test";
import { waitFor } from "@testing-library/react";
import { toast } from "sonner";
import {
	addCardsToBinder,
	createBinder,
	useUserland,
} from "../../store/userland/userland-store";
import { setupUserlandTest } from "../../test-utils";
import {
	moveCardBetweenBinderWithUndo,
	moveCardsBetweenBindersWithUndo,
	removeCardFromBinderWithUndo,
	removeCardsFromBinderWithUndo,
} from "./binder-mutations";

beforeEach(async () => {
	await setupUserlandTest();
});

/** Read the live binder record from the store. */
const binderOf = (id: string) => useUserland.getState().binders[id];

/** Capture the last `toast.message` call's undo action (spy must be installed). */
function lastUndoAction(spy: ReturnType<typeof spyOn>): {
	label: unknown;
	onClick: () => void;
} {
	const calls = spy.mock.calls;
	const opts = calls[calls.length - 1]?.[1] as {
		action: { label: unknown; onClick: () => void };
	};
	return opts.action;
}

// ---------------------------------------------------------------------------
// Single remove + undo
// ---------------------------------------------------------------------------

test("removeCardFromBinderWithUndo excludes the card, then a toast is shown", async () => {
	const spy = spyOn(toast, "message").mockImplementation(() => "");
	const binder = await createBinder({ name: "B" });
	await addCardsToBinder(binder.id, ["c1"]);

	await removeCardFromBinderWithUndo(binder.id, "c1");

	expect(binderOf(binder.id).includeCardIds).not.toContain("c1");
	expect(binderOf(binder.id).excludeCardIds).toContain("c1");
	expect(spy).toHaveBeenCalledTimes(1);

	spy.mockRestore();
});

test("removeCardFromBinderWithUndo: invoking the toast Undo re-adds the card", async () => {
	const spy = spyOn(toast, "message").mockImplementation(() => "");
	const binder = await createBinder({ name: "B" });
	await addCardsToBinder(binder.id, ["c1"]);

	await removeCardFromBinderWithUndo(binder.id, "c1");
	lastUndoAction(spy).onClick();

	await waitFor(() => {
		expect(binderOf(binder.id).includeCardIds).toContain("c1");
		expect(binderOf(binder.id).excludeCardIds).not.toContain("c1");
	});

	spy.mockRestore();
});

// ---------------------------------------------------------------------------
// Single move + undo
// ---------------------------------------------------------------------------

test("moveCardBetweenBinderWithUndo moves the card, and Undo reverses it", async () => {
	const spy = spyOn(toast, "message").mockImplementation(() => "");
	const a = await createBinder({ name: "A" });
	const b = await createBinder({ name: "B" });
	await addCardsToBinder(a.id, ["c1"]);

	await moveCardBetweenBinderWithUndo("c1", a.id, b.id);

	// Removed from A (excluded), added to B.
	expect(binderOf(a.id).excludeCardIds).toContain("c1");
	expect(binderOf(a.id).includeCardIds).not.toContain("c1");
	expect(binderOf(b.id).includeCardIds).toContain("c1");

	// Undo: back to A, removed from B.
	lastUndoAction(spy).onClick();
	await waitFor(() => {
		expect(binderOf(a.id).includeCardIds).toContain("c1");
		expect(binderOf(b.id).excludeCardIds).toContain("c1");
		expect(binderOf(b.id).includeCardIds).not.toContain("c1");
	});

	spy.mockRestore();
});

// ---------------------------------------------------------------------------
// Bulk remove + undo (single toast for the batch)
// ---------------------------------------------------------------------------

test("removeCardsFromBinderWithUndo removes ALL selected in one batch, one toast", async () => {
	const spy = spyOn(toast, "message").mockImplementation(() => "");
	const binder = await createBinder({ name: "B" });
	await addCardsToBinder(binder.id, ["c1", "c2", "c3"]);

	await removeCardsFromBinderWithUndo(binder.id, ["c1", "c2", "c3"]);

	for (const id of ["c1", "c2", "c3"]) {
		expect(binderOf(binder.id).includeCardIds).not.toContain(id);
		expect(binderOf(binder.id).excludeCardIds).toContain(id);
	}
	// Exactly ONE toast for the whole batch.
	expect(spy).toHaveBeenCalledTimes(1);

	// Undo re-adds every card at once.
	lastUndoAction(spy).onClick();
	await waitFor(() => {
		for (const id of ["c1", "c2", "c3"]) {
			expect(binderOf(binder.id).includeCardIds).toContain(id);
			expect(binderOf(binder.id).excludeCardIds).not.toContain(id);
		}
	});

	spy.mockRestore();
});

test("removeCardsFromBinderWithUndo is a no-op for an empty selection", async () => {
	const spy = spyOn(toast, "message").mockImplementation(() => "");
	const binder = await createBinder({ name: "B" });

	await removeCardsFromBinderWithUndo(binder.id, []);

	expect(spy).not.toHaveBeenCalled();
	spy.mockRestore();
});

// ---------------------------------------------------------------------------
// Bulk move + undo
// ---------------------------------------------------------------------------

test("moveCardsBetweenBindersWithUndo moves ALL selected, one toast, Undo reverses", async () => {
	const spy = spyOn(toast, "message").mockImplementation(() => "");
	const a = await createBinder({ name: "A" });
	const b = await createBinder({ name: "B" });
	await addCardsToBinder(a.id, ["c1", "c2"]);

	await moveCardsBetweenBindersWithUndo(["c1", "c2"], a.id, b.id);

	for (const id of ["c1", "c2"]) {
		expect(binderOf(a.id).excludeCardIds).toContain(id);
		expect(binderOf(b.id).includeCardIds).toContain(id);
	}
	expect(spy).toHaveBeenCalledTimes(1);

	lastUndoAction(spy).onClick();
	await waitFor(() => {
		for (const id of ["c1", "c2"]) {
			expect(binderOf(a.id).includeCardIds).toContain(id);
			expect(binderOf(b.id).excludeCardIds).toContain(id);
		}
	});

	spy.mockRestore();
});
