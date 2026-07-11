import { useCallback, useEffect, useRef } from "react";
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
	ids: [],
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
	"ids",
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
		// Mixed ids (dex-number strings for Pokémon, card names for Trainers);
		// parse like the other CSV array filters — opaque strings, no validation.
		ids: csv(search.ids),
		// URL param is "mode"; enum-guard to the three valid values, else "fuzzy".
		mode: ((): SearchMode => {
			const m = search.mode;
			if (m === "exact" || m === "contains" || m === "fuzzy") return m;
			return "fuzzy";
		})(),
		sort: ((): CardSortMode => {
			const s = search.sort;
			return s === "dex" ||
				s === "number" ||
				s === "name" ||
				s === "rarity" ||
				s === "released"
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

/**
 * True when a patch is a lone `q` write — the search-as-you-type case. Every
 * keystroke sends `{ q }` and nothing else; a filter/sort/view/mode/lang change
 * sends those keys (and never a bare `q`). Used to route typing through the
 * debounce + history-replace path while filter changes stay immediate, Back-able
 * pushes. Exported so the classification is unit-testable in isolation.
 */
export function isLoneQPatch(patch: Partial<ListSearch>): boolean {
	return "q" in patch && Object.keys(patch).length === 1;
}

/**
 * The slice of a route's `navigate()` that {@link useListSearchOnChange} drives.
 * Every list route's `useNavigate({ from })` result is structurally compatible:
 * the search reducer reads the validated `ListSearch` and returns the merged
 * URL-input patch, plus the two history knobs the hook toggles.
 */
type ListSearchNavigate = (opts: {
	search: (prev: ListSearch) => ListSearch;
	replace?: boolean;
	viewTransition?: boolean;
}) => unknown;

/** Base navigate() options merged into every list-search write. */
interface ListSearchNavigateOptions {
	/**
	 * Passed through to navigate() on every write. Defaults to `false`: an in-page
	 * filter/view/typing change shouldn't crossfade the whole route.
	 */
	viewTransition?: boolean;
}

/**
 * Shared `onChange` for every card-list route ({@link listSearchToUrl} consumers).
 * Two distinct history behaviors keep the Back button honest:
 *
 * - **Typing (a lone `q`)** — coalesced behind a 250ms debounce, then written
 *   with `replace: true`, so an entire "b → be → ber → …" run collapses onto ONE
 *   history entry. Back then returns to wherever the user came from instead of
 *   walking back through every keystroke. On the `/search` route `q` is also a
 *   loaderDep, so the debounce additionally coalesces the per-keystroke server
 *   RPC; on the other list routes `q` filters the in-memory grid, so `replace`
 *   is the load-bearing part (no more polluted history).
 * - **Everything else (filters/sort/view/mode/lang)** — written immediately with
 *   a normal push, so each stays a distinct, Back-able step.
 *
 * The pending debounce timer is cleared on unmount. `navigate` is expected to be
 * stable (TanStack's `useNavigate` result is), so the returned callback is too.
 */
export function useListSearchOnChange(
	navigate: ListSearchNavigate,
	{ viewTransition = false }: ListSearchNavigateOptions = {},
): (patch: Partial<ListSearch>) => void {
	const qTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	useEffect(
		() => () => {
			if (qTimer.current) clearTimeout(qTimer.current);
		},
		[],
	);
	return useCallback(
		(patch: Partial<ListSearch>) => {
			const commit = (replace: boolean) =>
				navigate({
					search: (prev) => ({ ...prev, ...listSearchToUrl(patch) }),
					replace,
					viewTransition,
				});
			// Filter/sort/view/mode/lang change: push immediately so each is Back-able.
			if (!isLoneQPatch(patch)) {
				commit(false);
				return;
			}
			// Search-as-you-type: coalesce keystrokes, then replace so the whole run
			// is one history entry.
			if (qTimer.current) clearTimeout(qTimer.current);
			qTimer.current = setTimeout(() => commit(true), 250);
		},
		[navigate, viewTransition],
	);
}
