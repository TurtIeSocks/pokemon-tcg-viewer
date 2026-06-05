import type { Stack } from "../../store/userland/types";

/**
 * The display name for a stack in lists/tiles.
 *
 * Priority: the user's explicit `label` if they named the stack; otherwise an
 * auto-label derived from its distinguishing metadata ({@link autoStackLabel}).
 * Single source of truth so the stacks list and any future surfaces agree.
 */
export function stackDisplayLabel(item: Stack): string {
	const named = item.label?.trim();
	if (named) return named;
	return autoStackLabel(item);
}

/** True when the row's label is auto-derived (no user-given name). */
export function isAutoLabel(item: Stack): boolean {
	return !item.label?.trim();
}

/**
 * Auto-label fallback when the user hasn't named a stack.
 *
 * Composes the most identifying attributes into a short human label —
 * variant + condition/grade, e.g. "Holo · NM" or "1st Edition · PSA 8" —
 * falling back to the acquired date when nothing distinguishing is set.
 */
function autoStackLabel(item: Stack): string {
	const gradeOrCondition = item.grading
		? `${item.grading.company} ${item.grading.grade}`
		: (item.condition ?? null);
	const parts = [item.variant, gradeOrCondition].filter(Boolean);
	// Bare stack (no variant/grade): "Ungraded stack" — NOT the acquired date,
	// which the row already shows as a secondary line.
	return parts.length > 0 ? parts.join(" · ") : "Ungraded stack";
}
