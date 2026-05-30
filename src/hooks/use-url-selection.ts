import { useSearchParams } from "react-router";

interface UpdateOptions {
	/** When true, replaces the current history entry instead of pushing a new one. */
	replace?: boolean;
}

type SetSetId = (id: string | null, opts?: UpdateOptions) => void;
type SetDex = (n: number | null, opts?: UpdateOptions) => void;

/**
 * URL-backed selection for the By-Set view. Reads/writes the `setId`
 * search parameter. Pass `{ replace: true }` for non-user-driven updates
 * (e.g. default-fallback selection on first load) to avoid polluting
 * back history.
 */
export function useSetIdParam(): [string | null, SetSetId] {
	const [params, setParams] = useSearchParams();
	const setId = params.get("setId");
	const setSetId: SetSetId = (id, opts) => {
		const next = new URLSearchParams(params);
		if (id) next.set("setId", id);
		else next.delete("setId");
		setParams(next, opts?.replace ? { replace: true } : undefined);
	};
	return [setId, setSetId];
}

/**
 * URL-backed selection for the By-Pokémon view. Reads/writes the `dex`
 * search parameter as a number. Returns null for missing or non-numeric
 * values.
 */
export function usePokedexParam(): [number | null, SetDex] {
	const [params, setParams] = useSearchParams();
	const raw = params.get("dex");
	// Require a positive integer. Rejects 0, negatives, decimals, non-numeric.
	const parsed = raw === null ? Number.NaN : Number(raw);
	const dex = Number.isInteger(parsed) && parsed >= 1 ? parsed : null;
	const setDex: SetDex = (n, opts) => {
		const next = new URLSearchParams(params);
		if (n !== null && Number.isFinite(n)) next.set("dex", String(n));
		else next.delete("dex");
		setParams(next, opts?.replace ? { replace: true } : undefined);
	};
	return [dex, setDex];
}

type SetNameQuery = (q: string, opts?: UpdateOptions) => void;

/**
 * URL-backed free-text search for the By-Name view. Reads/writes the `q`
 * search param. Returns "" for a missing param; trims surrounding
 * whitespace on read. Setting an empty/whitespace value removes the param.
 */
export function useNameQueryParam(): [string, SetNameQuery] {
	const [params, setParams] = useSearchParams();
	const q = (params.get("q") ?? "").trim();
	const setQuery: SetNameQuery = (next, opts) => {
		const trimmed = next.trim();
		const nextParams = new URLSearchParams(params);
		if (trimmed) nextParams.set("q", trimmed);
		else nextParams.delete("q");
		setParams(nextParams, opts?.replace ? { replace: true } : undefined);
	};
	return [q, setQuery];
}

type SetFilter = (vals: string[], opts?: UpdateOptions) => void;

/**
 * Generic multi-value URL search-param hook for filter dimensions.
 * Stores values comma-separated under `name`. Empty array clears the
 * param. Empty CSV components (e.g. from a stray trailing comma) are
 * filtered out on read.
 */
export function useFilterParam(name: string): [string[], SetFilter] {
	const [params, setParams] = useSearchParams();
	// Use getAll() to handle duplicate keys (e.g. hand-crafted URLs with
	// `?types=fire&types=water`). Single-key URLs still work because
	// getAll returns a 1-element array we then split as CSV.
	const all = params.getAll(name);
	const raw = all.length > 1 ? all.join(",") : (all[0] ?? null);
	const values = raw ? raw.split(",").filter(Boolean) : [];
	const setValues: SetFilter = (vals, opts) => {
		const next = new URLSearchParams(params);
		if (vals.length === 0) next.delete(name);
		else next.set(name, vals.join(","));
		setParams(next, opts?.replace ? { replace: true } : undefined);
	};
	return [values, setValues];
}

export type SearchScope = "set" | "all";
type SetScope = (scope: SearchScope, opts?: UpdateOptions) => void;

/**
 * URL-backed search scope. Default "set" (param omitted) means "search within
 * the selected set"; "all" serializes `scope=all` for a global name search.
 * Unknown values collapse to "set".
 */
export function useScopeParam(): [SearchScope, SetScope] {
	const [params, setParams] = useSearchParams();
	const scope: SearchScope = params.get("scope") === "all" ? "all" : "set";
	const setScope: SetScope = (next, opts) => {
		const p = new URLSearchParams(params);
		if (next === "all") p.set("scope", "all");
		else p.delete("scope");
		setParams(p, opts?.replace ? { replace: true } : undefined);
	};
	return [scope, setScope];
}

export type ViewMode = "grid" | "timeline";
type SetView = (mode: ViewMode, opts?: UpdateOptions) => void;

/**
 * URL-backed view-mode toggle. Default is "grid" (param omitted from URL);
 * setting "timeline" serializes `view=timeline`. Unknown values (typos,
 * legacy URLs) collapse to the default.
 */
export function useViewModeParam(): [ViewMode, SetView] {
	const [params, setParams] = useSearchParams();
	const raw = params.get("view");
	const mode: ViewMode = raw === "timeline" ? "timeline" : "grid";
	const setMode: SetView = (mode, opts) => {
		const next = new URLSearchParams(params);
		if (mode === "timeline") next.set("view", "timeline");
		else next.delete("view");
		setParams(next, opts?.replace ? { replace: true } : undefined);
	};
	return [mode, setMode];
}
