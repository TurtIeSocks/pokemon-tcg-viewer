import type { SerializedQuery } from "../store/userland/types";

export interface RuleLabelLookups {
	setName?: (setId: string) => string | null | undefined;
	dexName?: (n: number) => string | null | undefined;
}

/**
 * Compose a concise human-readable label for a binder rule query.
 * Facets are joined with " · "; values within a facet are joined with "/".
 * Returns "All cards" when no constraints are present.
 *
 * Facet order: set/dex → supertype → subtype → rarity → type → text → year
 */
export function binderRuleLabel(
	q: SerializedQuery,
	lookups?: RuleLabelLookups,
): string {
	const parts: string[] = [];

	if (q.setId !== null) {
		parts.push(lookups?.setName?.(q.setId) ?? q.setId);
	}

	if (q.dexNumber !== null) {
		parts.push(lookups?.dexName?.(q.dexNumber) ?? `#${q.dexNumber}`);
	}

	if (q.supertypes.length > 0) {
		parts.push(q.supertypes.join("/"));
	}

	if (q.subtypes.length > 0) {
		parts.push(q.subtypes.join("/"));
	}

	if (q.rarities.length > 0) {
		parts.push(q.rarities.join("/"));
	}

	if (q.types.length > 0) {
		parts.push(q.types.join("/"));
	}

	if (q.text !== null) {
		// mode only changes name matching, so only annotate it when text is present.
		const mode = q.mode ?? "fuzzy";
		if (mode === "exact") {
			parts.push(`"${q.text}" (exact)`);
		} else if (mode === "contains") {
			parts.push(`"${q.text}" (contains)`);
		} else {
			parts.push(`"${q.text}"`);
		}
	}

	if (q.yearMin !== null && q.yearMax !== null) {
		parts.push(`${q.yearMin}-${q.yearMax}`);
	} else if (q.yearMax !== null) {
		parts.push(`before ${q.yearMax + 1}`);
	} else if (q.yearMin !== null) {
		parts.push(`from ${q.yearMin}`);
	}

	return parts.length > 0 ? parts.join(" · ") : "All cards";
}
