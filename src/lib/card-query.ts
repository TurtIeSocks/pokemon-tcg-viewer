import type { CorpusQuery } from "../store/corpus/corpus-engine";
import type { SearchMode } from "../store/corpus/fuzzy";
import type { FilterClauses } from "../utils/build-filter-clauses";
import type { SortDir, SortOption } from "./sort";

export type ViewMode = "grid" | "timeline";
export type OwnedMode = "all" | "owned" | "missing";

// NOTE: this union must stay in sync with the inline `sort` union on CorpusQuery
// in src/store/corpus/corpus-engine.ts (kept inline there to avoid a type cycle).
export type CardSortMode = "default" | "dex" | "number" | "name" | "released";

/** Sort modes offered by the card pages' SortControl. */
export const CARD_SORT_OPTIONS: SortOption<CardSortMode>[] = [
	{ value: "default", label: "Default" },
	{ value: "dex", label: "Dex #" },
	{ value: "number", label: "Card #" },
	{ value: "name", label: "Name" },
	{ value: "released", label: "Release date" },
];

/** Natural direction when switching card sort mode (all ascending). */
export function naturalCardDir(): SortDir {
	return "asc";
}

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
	/** National Pokédex number of the selected species. Null → no species filter. */
	pokemon: number | null;
	/** Search mode: "exact" (whole name), "contains" (prefix+substring), or "fuzzy" (default). */
	mode: SearchMode;
	/** Explicit sort; "default" keeps the context order (relevance/release/number). */
	sort: CardSortMode;
	/** Sort direction for an explicit `sort` ("default" ignores it). */
	dir: SortDir;
}

/** Page context: which entity the list is anchored to. */
export interface ListContext {
	setId?: string;
	dexNumber?: number;
	/** Locks the page to one supertype (Trainer/Energy category + per-name pages). */
	supertype?: string;
	/** Locks the page to one card name slug (Trainer/Energy per-name pages). */
	nameSlug?: string;
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
		// A supertype-locked page (trainers/energies + their per-name pages) fixes
		// the supertype; its Card Type dropdown is hidden so no user value overrides.
		supertypes: ctx.supertype ? [ctx.supertype] : orUndef(s.supertype),
		subtypes: orUndef(s.subtypes),
	};
	const query = s.q.trim() || undefined;

	const yearMin = s.yearMin ?? undefined;
	const yearMax = s.yearMax ?? undefined;
	const mode = s.mode;

	if (ctx.setId != null) {
		return {
			setId: ctx.setId,
			dexNumber: s.pokemon ?? undefined,
			query,
			filters,
			yearMin,
			yearMax,
			mode,
			sort: s.sort,
			dir: s.dir,
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
			mode,
			sort: s.sort,
			dir: s.dir,
			relevance: false,
		};
	}
	// Supertype-anchored page (Trainer/Energy category or one named card across
	// sets): global scope, chronological order, name-slug locked when present.
	if (ctx.supertype != null) {
		return {
			setId: null,
			nameSlug: ctx.nameSlug,
			chronological: true,
			query,
			filters,
			yearMin,
			yearMax,
			mode,
			sort: s.sort,
			dir: s.dir,
			relevance: !!query,
		};
	}
	return {
		setId: null,
		dexNumber: s.pokemon ?? undefined,
		query,
		filters,
		yearMin,
		yearMax,
		mode,
		sort: s.sort,
		dir: s.dir,
		relevance: !!query,
	};
}
