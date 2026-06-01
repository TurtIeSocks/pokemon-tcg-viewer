import type { CorpusQuery } from "../store/corpus/corpus-engine";
import type { FilterClauses } from "../utils/build-filter-clauses";

export type Scope = "set" | "all";

/** Typed list-page search params (shared validateSearch shape). */
export interface ListSearch {
	q: string;
	types: string[];
	rarity: string[];
	supertype: string[];
	subtypes: string[];
	scope: Scope;
}

/** Page context: which entity the list is anchored to. */
export interface ListContext {
	setId?: string;
	dexNumber?: number;
}

const orUndef = (a: string[]): string[] | undefined => (a.length ? a : undefined);

/**
 * Map URL search params + page context to a CorpusQuery.
 *  - set context with scope=all + a query → global search (ignore the set)
 *  - set context otherwise → set-scoped, natural order
 *  - dex context → dex-scoped, natural order
 *  - no context → global, relevance order when a query is present
 */
export function buildCorpusQuery(s: ListSearch, ctx: ListContext): CorpusQuery {
	const filters: FilterClauses = {
		types: orUndef(s.types),
		rarity: orUndef(s.rarity),
		supertype: orUndef(s.supertype),
		subtypes: orUndef(s.subtypes),
	};
	const query = s.q.trim() || undefined;

	// Global search overrides set context when scope=all and a query is present.
	const globalOverride = ctx.setId != null && s.scope === "all" && !!query;

	if (ctx.setId != null && !globalOverride) {
		return { setId: ctx.setId, query, filters, relevance: false };
	}
	if (ctx.dexNumber != null) {
		return { dexNumber: ctx.dexNumber, query, filters, relevance: false };
	}
	return { setId: null, query, filters, relevance: !!query };
}
