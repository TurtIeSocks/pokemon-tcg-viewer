import type { CorpusQuery } from "../store/corpus/corpus-engine";
import type { FilterClauses } from "../utils/build-filter-clauses";

export type ViewMode = "grid" | "timeline";

/** Typed list-page search params (shared validateSearch shape). */
export interface ListSearch {
	q: string;
	types: string[];
	rarity: string[];
	supertype: string[];
	subtypes: string[];
	view: ViewMode;
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

	if (ctx.setId != null) {
		return { setId: ctx.setId, query, filters, relevance: false };
	}
	if (ctx.dexNumber != null) {
		return { dexNumber: ctx.dexNumber, query, filters, relevance: false };
	}
	return { setId: null, query, filters, relevance: !!query };
}
