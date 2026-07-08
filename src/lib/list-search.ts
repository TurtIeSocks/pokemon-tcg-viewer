import type { SearchMode } from "../store/corpus/fuzzy";
import type {
	CardSortMode,
	ListSearch,
	OwnedMode,
	ViewMode,
} from "./card-query";
import { isSupportedLanguage, type SupportedLanguage } from "./languages";
import type { SortDir } from "./sort";

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
	pokemon: [],
	mode: "fuzzy",
	sort: "default",
	dir: "asc",
	lang: null,
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
		// TanStack's search parser JSON-parses `yearMin=2020` into a number, but an
		// in-page navigate()/listSearchToUrl merge can also hand us the string form.
		// Accept both; reject everything else (null/bool/object → unknown year).
		if (typeof v !== "string" && typeof v !== "number") return null;
		const n = Number(v);
		// Number.isFinite (not !isNaN) so "Infinity"/"-Infinity" are rejected too.
		return v !== "" && Number.isFinite(n) ? n : null;
	};

	// National dex numbers (1..1025, the species-list fetch limit). Parse a CSV
	// string ("25,6"), an array, or a single number (a cold load JSON-parses
	// `?pokemon=25` into the number 25) into number[], dropping out-of-range /
	// non-integer / junk entries — mirrors the string[] `csv` array filters.
	const toDexList = (v: unknown): number[] => {
		const parts = Array.isArray(v)
			? v
			: typeof v === "number"
				? [v]
				: typeof v === "string"
					? v.split(",")
					: [];
		const out: number[] = [];
		for (const p of parts) {
			const n = Number(p);
			if (Number.isInteger(n) && n >= 1 && n <= 1025) out.push(n);
		}
		return out;
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
		pokemon: toDexList(search.pokemon),
		// URL param is "mode"; enum-guard to the three valid values, else "fuzzy".
		mode: ((): SearchMode => {
			const m = search.mode;
			if (m === "exact" || m === "contains" || m === "fuzzy") return m;
			return "fuzzy";
		})(),
		sort: ((): CardSortMode => {
			const s = search.sort;
			return s === "dex" || s === "number" || s === "name" || s === "released"
				? s
				: "default";
		})(),
		dir: (search.dir === "desc" ? "desc" : "asc") as SortDir,
		// null → use the viewer default; a concrete value must be a supported lang.
		lang:
			typeof search.lang === "string" && isSupportedLanguage(search.lang)
				? (search.lang as SupportedLanguage)
				: null,
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
	// Species multi-select serializes as a CSV of dex numbers (like rarity/types),
	// omitted when empty so default (no filter) stays out of the crawlable URL.
	if (s.pokemon !== undefined)
		out.pokemon = s.pokemon?.length ? s.pokemon.join(",") : undefined;
	// Omit "mode" from URL when it's the default ("fuzzy") to keep URLs clean.
	if (s.mode !== undefined) out.mode = s.mode !== "fuzzy" ? s.mode : undefined;
	// Omit "default"/"asc" so crawlable URLs stay clean.
	if (s.sort !== undefined)
		out.sort = s.sort !== "default" ? s.sort : undefined;
	if (s.dir !== undefined) out.dir = s.dir !== "asc" ? s.dir : undefined;
	// Include lang only when an explicit per-page override is set (null = default).
	if (s.lang !== undefined) out.lang = s.lang ?? undefined;

	return out;
}
