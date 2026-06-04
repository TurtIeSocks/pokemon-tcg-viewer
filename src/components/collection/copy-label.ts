import type { CollectionItem } from "../../store/userland/types";

/**
 * The display name for a copy in lists/tiles.
 *
 * Priority: the user's explicit `label` if they named the copy; otherwise an
 * auto-label derived from its distinguishing metadata ({@link autoCopyLabel}).
 * Single source of truth so the copies list and any future surfaces agree.
 */
export function copyDisplayLabel(item: CollectionItem): string {
	const named = item.label?.trim();
	if (named) return named;
	return autoCopyLabel(item);
}

/** True when the row's label is auto-derived (no user-given name). */
export function isAutoLabel(item: CollectionItem): boolean {
	return !item.label?.trim();
}

/**
 * Auto-label fallback when the user hasn't named a copy.
 *
 * Composes the most identifying attributes into a short human label —
 * variant + condition/grade, e.g. "Holo · NM" or "1st Edition · PSA 8" —
 * falling back to the acquired date when nothing distinguishing is set.
 */
export function autoCopyLabel(item: CollectionItem): string {
	const gradeOrCondition = item.grading
		? `${item.grading.company} ${item.grading.grade}`
		: (item.condition ?? null);
	const parts = [item.variant, gradeOrCondition].filter(Boolean);
	// Bare copy (no variant/grade): "Ungraded copy" — NOT the acquired date,
	// which the row already shows as a secondary line.
	return parts.length > 0 ? parts.join(" · ") : "Ungraded copy";
}
