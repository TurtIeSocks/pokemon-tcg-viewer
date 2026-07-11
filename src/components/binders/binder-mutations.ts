import { toast } from "sonner";
import { m } from "@/paraglide/messages";
import {
	addCardsToBinder,
	moveCardBetweenBinders,
	removeCardFromBinder,
} from "../../store/userland/userland-store";

/**
 * Binder membership mutations wrapped with an undo toast. These are the single
 * write path every binder-scoped remove/move should route through, so the user
 * always gets a one-click reversal (sonner action button).
 *
 * `toast.message` (not the bare `toast()` callable) is deliberate: it is a real
 * method on the sonner `toast` object, which makes it reliably spy-able in tests
 * via `spyOn(toast, "message")` — the same seam the print-missing dialog uses.
 */

/**
 * Remove a single card from a binder, then show an undo toast.
 *
 * Undo re-adds the card via {@link addCardsToBinder}: that both un-excludes it
 * AND re-includes it as a manual member. It is the faithful inverse for a
 * manually-added card and a harmless no-op-superset for a rule-matched one
 * (the card was already a member via its rule, and the manual include just
 * pins it), so a single inverse covers both membership sources correctly.
 */
export async function removeCardFromBinderWithUndo(
	binderId: string,
	cardId: string,
): Promise<void> {
	await removeCardFromBinder(binderId, cardId);
	toast.message(m.binder_toast_removed(), {
		action: {
			label: m.binder_toast_undo(),
			onClick: () => void addCardsToBinder(binderId, [cardId]),
		},
	});
}

/**
 * Move a single card from one binder to another, then show an undo toast whose
 * action reverses the move (target → source).
 */
export async function moveCardBetweenBinderWithUndo(
	cardId: string,
	fromId: string,
	toId: string,
): Promise<void> {
	await moveCardBetweenBinders(cardId, fromId, toId);
	toast.message(m.binder_toast_moved(), {
		action: {
			label: m.binder_toast_undo(),
			onClick: () => void moveCardBetweenBinders(cardId, toId, fromId),
		},
	});
}

/**
 * Remove several cards from a binder in one batch, then show a SINGLE undo toast
 * for the whole batch. Undo re-adds every card at once via
 * {@link addCardsToBinder} (see {@link removeCardFromBinderWithUndo} for why that
 * is the correct inverse). No-op for an empty list.
 */
export async function removeCardsFromBinderWithUndo(
	binderId: string,
	cardIds: string[],
): Promise<void> {
	if (cardIds.length === 0) return;
	for (const cardId of cardIds) {
		await removeCardFromBinder(binderId, cardId);
	}
	const label =
		cardIds.length === 1
			? m.binder_toast_removed()
			: m.binder_toast_removed_count({ count: cardIds.length });
	toast.message(label, {
		action: {
			label: m.binder_toast_undo(),
			onClick: () => void addCardsToBinder(binderId, cardIds),
		},
	});
}

/**
 * Move several cards from one binder to another in one batch, then show a SINGLE
 * undo toast that reverses every move. No-op for an empty list.
 */
export async function moveCardsBetweenBindersWithUndo(
	cardIds: string[],
	fromId: string,
	toId: string,
): Promise<void> {
	if (cardIds.length === 0) return;
	for (const cardId of cardIds) {
		await moveCardBetweenBinders(cardId, fromId, toId);
	}
	const label =
		cardIds.length === 1
			? m.binder_toast_moved()
			: m.binder_toast_moved_count({ count: cardIds.length });
	toast.message(label, {
		action: {
			label: m.binder_toast_undo(),
			// Reverse each move SEQUENTIALLY: every reverse move is a
			// read-modify-write on the same two binder records, so firing them
			// concurrently would race and drop all but the last card.
			onClick: () => {
				void (async () => {
					for (const cardId of cardIds) {
						await moveCardBetweenBinders(cardId, toId, fromId);
					}
				})();
			},
		},
	});
}
