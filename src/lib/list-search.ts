import type { ListSearch, Scope, ViewMode } from "./card-query";

/**
 * Default value for every list-search field. Paired with the TanStack
 * `stripSearchParams(LIST_SEARCH_DEFAULTS)` middleware on each list route so
 * default-valued params never appear in the URL — keeping the crawlable SEO
 * URLs clean (no `?q=&types=[]&…`) while the validated object still has every
 * field. The array identities are stable so the strip's deep-equal matches.
 */
export const LIST_SEARCH_DEFAULTS: ListSearch = {
	q: "",
	types: [],
	rarity: [],
	supertype: [],
	subtypes: [],
	scope: "all",
	view: "grid",
};

const csv = (v: unknown): string[] => {
	if (Array.isArray(v)) return (v as string[]).filter(Boolean);
	if (typeof v !== "string" || !v) return [];
	return v.split(",").filter(Boolean);
};

/** Shared validateSearch for any card-list route. */
export function validateListSearch(
	search: Record<string, unknown>,
): ListSearch {
	const scope: Scope = search.scope === "set" ? "set" : "all";
	const view: ViewMode = search.view === "timeline" ? "timeline" : "grid";
	return {
		q: typeof search.q === "string" ? search.q : "",
		types: csv(search.types),
		rarity: csv(search.rarity),
		supertype: csv(search.supertype),
		subtypes: csv(search.subtypes),
		scope,
		view,
	};
}

/** Serialize a ListSearch patch's array fields back to CSV for the URL. */
export function listSearchToUrl(
	s: Partial<ListSearch>,
): Record<string, string | undefined> {
	const out: Record<string, string | undefined> = {};
	if (s.q !== undefined) out.q = s.q || undefined;
	for (const k of ["types", "rarity", "supertype", "subtypes"] as const) {
		if (s[k] !== undefined) out[k] = s[k]?.length ? s[k]?.join(",") : undefined;
	}
	if (s.scope !== undefined) out.scope = s.scope === "set" ? "set" : undefined;
	if (s.view !== undefined)
		out.view = s.view === "timeline" ? "timeline" : undefined;
	return out;
}
