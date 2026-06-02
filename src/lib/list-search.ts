import type { ListSearch, OwnedMode, ViewMode } from "./card-query";

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
	view: "grid",
	owned: "all",
	yearMin: null,
	yearMax: null,
};

const VALID_SEARCH_PARAMS = [
	"types",
	"rarity",
	"supertype",
	"subtypes",
] as const;

const csv = (v: unknown): string[] => {
	if (Array.isArray(v)) return (v as string[]).filter(Boolean);
	if (typeof v !== "string" || !v) return [];
	return v.split(",").filter(Boolean);
};

/** Shared validateSearch for any card-list route. */
export function validateListSearch(
	search: Record<string, unknown>,
): ListSearch {
	const view: ViewMode = search.view === "timeline" ? "timeline" : "grid";
	const owned: OwnedMode =
		search.owned === "owned" || search.owned === "missing"
			? search.owned
			: "all";

	const toYear = (v: unknown): number | null => {
		const n = Number(v);
		return typeof v === "string" && v !== "" && !Number.isNaN(n) ? n : null;
	};

	return {
		q: typeof search.q === "string" ? search.q : "",
		types: csv(search.types),
		rarity: csv(search.rarity),
		supertype: csv(search.supertype),
		subtypes: csv(search.subtypes),
		view,
		owned,
		yearMin: toYear(search.yearMin),
		yearMax: toYear(search.yearMax),
	};
}

/** Serialize a ListSearch patch's array fields back to CSV for the URL. */
export function listSearchToUrl(
	s: Partial<ListSearch>,
): Record<string, string | undefined> {
	const out: Record<string, string | undefined> = {};
	if (s.q !== undefined) out.q = s.q || undefined;
	for (const k of VALID_SEARCH_PARAMS) {
		if (s[k] !== undefined) out[k] = s[k]?.length ? s[k]?.join(",") : undefined;
	}
	if (s.view !== undefined)
		out.view = s.view === "timeline" ? "timeline" : undefined;
	if (s.owned !== undefined)
		out.owned = s.owned !== "all" ? s.owned : undefined;
	if (s.yearMin !== undefined)
		out.yearMin = s.yearMin != null ? String(s.yearMin) : undefined;
	if (s.yearMax !== undefined)
		out.yearMax = s.yearMax != null ? String(s.yearMax) : undefined;

	return out;
}
