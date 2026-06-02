import type { CorpusQuery } from "../store/corpus/corpus-engine";
import type { FilterClauses } from "../utils/build-filter-clauses";

export type ViewMode = "grid" | "timeline";
export type OwnedMode = "all" | "owned" | "missing";

/** Typed list-page search params (shared validateSearch shape). */
export interface ListSearch {
	q: string;
	types: string[];
	rarity: string[];
	supertype: string[];
	subtypes: string[];
	view: ViewMode;
	owned: OwnedMode;
	/** Inclusive lower bound on release year (YYYY). Null → no lower bound. */
	yearMin: number | null;
	/** Inclusive upper bound on release year (YYYY). Null → no upper bound. */
	yearMax: number | null;
}

/** Page context: which entity the list is anchored to. */
export interface ListContext {
	setId?: string;
	dexNumber?: number;
}

const orUndef = (a: string[]): string[] | undefined =>
	a.length ? a : undefined;

/**
 * Map URL search params + page context to a CorpusQuery.
 *  - set context → set-scoped, natural order (a query filters within the set)
 *  - dex context → dex-scoped, natural order
 *  - no context → global, relevance order when a query is present
 */
export function buildCorpusQuery(s: ListSearch, ctx: ListContext): CorpusQuery {
	const filters: FilterClauses = {
		types: orUndef(s.types),
		rarities: orUndef(s.rarity),
		supertypes: orUndef(s.supertype),
		subtypes: orUndef(s.subtypes),
	};
	const query = s.q.trim() || undefined;

	const yearMin = s.yearMin ?? undefined;
	const yearMax = s.yearMax ?? undefined;

	if (ctx.setId != null) {
		return {
			setId: ctx.setId,
			query,
			filters,
			yearMin,
			yearMax,
			relevance: false,
		};
	}
	if (ctx.dexNumber != null) {
		return {
			dexNumber: ctx.dexNumber,
			query,
			filters,
			yearMin,
			yearMax,
			relevance: false,
		};
	}
	return { setId: null, query, filters, yearMin, yearMax, relevance: !!query };
}
