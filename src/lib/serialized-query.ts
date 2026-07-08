import type { SerializedQuery } from "../store/userland/types";
import type { ListContext, ListSearch } from "./card-query";

/**
 * Capture the current list page search + context into a serialized, display-agnostic query.
 * Ignores `owned` and `view` — those are display-only, not membership constraints.
 */
export function toSerializedQuery(
	search: ListSearch,
	ctx: ListContext,
): SerializedQuery {
	return {
		text: search.q.trim() || null,
		setId: ctx.setId ?? null,
		// A binder rule captures a SINGLE dex context. The page context wins; else a
		// lone selected id that is a dex number (Pokémon) still gives one — a trainer
		// name or a multi-select can't map to one dex, so it captures none (null).
		dexNumber:
			ctx.dexNumber ??
			(search.ids.length === 1 && /^\d+$/.test(search.ids[0])
				? Number(search.ids[0])
				: null),
		types: [...search.types],
		rarities: [...search.rarity],
		supertypes: [...search.supertype],
		subtypes: [...search.subtypes],
		yearMin: search.yearMin,
		yearMax: search.yearMax,
		mode: search.mode,
	};
}

/**
 * True iff the query contains at least one membership constraint.
 * An all-empty query matches every card — not a useful binder rule.
 */
export function isRuleCapturable(q: SerializedQuery): boolean {
	return (
		q.text !== null ||
		q.setId !== null ||
		q.dexNumber !== null ||
		q.types.length > 0 ||
		q.rarities.length > 0 ||
		q.supertypes.length > 0 ||
		q.subtypes.length > 0 ||
		q.yearMin !== null ||
		q.yearMax !== null
	);
}
