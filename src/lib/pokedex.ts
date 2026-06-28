import { matchName, normalize, type SearchMode } from "../store/corpus/fuzzy";
import type { SortDir, SortOption } from "./sort";

/** One directory row per species that has at least one card in the corpus. */
export interface PokedexRow {
	dex: number;
	name: string;
	count: number;
	/** Most-frequent first type (Fire/Water/...) across this species' cards, or null. */
	type: string | null;
}

const SPRITE_BASE =
	"https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon";

/** PokéAPI national-dex pixel sprite for a species. */
export function spriteUrl(dex: number): string {
	return `${SPRITE_BASE}/${dex}.png`;
}

export interface Generation {
	label: string;
	start: number;
	end: number;
}

/** National-dex ranges per game generation (inclusive). */
export const GENERATIONS: Generation[] = [
	{ label: "Gen 1", start: 1, end: 151 },
	{ label: "Gen 2", start: 152, end: 251 },
	{ label: "Gen 3", start: 252, end: 386 },
	{ label: "Gen 4", start: 387, end: 493 },
	{ label: "Gen 5", start: 494, end: 649 },
	{ label: "Gen 6", start: 650, end: 721 },
	{ label: "Gen 7", start: 722, end: 809 },
	{ label: "Gen 8", start: 810, end: 905 },
	{ label: "Gen 9", start: 906, end: 1025 },
];

/** Generation label containing a dex number, or null when out of range. */
export function generationOf(dex: number): string | null {
	const g = GENERATIONS.find((g) => dex >= g.start && dex <= g.end);
	return g ? g.label : null;
}

export type PokedexSortMode = "dex" | "name" | "count";

/** Active directory filter + sort. `null` on a dimension = no filter on it. */
export interface PokedexFilter {
	query: string;
	searchMode: SearchMode;
	type: string | null;
	generation: string | null;
	sortMode: PokedexSortMode;
	sortDir: SortDir;
}

export const POKEDEX_FILTER_DEFAULTS: PokedexFilter = {
	query: "",
	searchMode: "fuzzy",
	type: null,
	generation: null,
	sortMode: "dex",
	sortDir: "asc",
};

/** Sort modes offered by the /pokemon SortControl. */
export const POKEDEX_SORT_OPTIONS: SortOption<PokedexSortMode>[] = [
	{ value: "dex", label: "Dex #" },
	{ value: "name", label: "Name" },
	{ value: "count", label: "Card Count" },
];

/** Natural default direction when the user switches sort mode. */
export function naturalPokedexDir(mode: PokedexSortMode): SortDir {
	return mode === "count" ? "desc" : "asc";
}

const tokensOf = (name: string): string[] =>
	name.split(/[\s-]+/).flatMap((t) => {
		const n = normalize(t);
		return n ? [n] : [];
	});

// A row matches when its name matches under the search mode, or the (numeric)
// query is a substring of its dex number. Empty query matches everything.
function matchesQuery(
	row: PokedexRow,
	query: string,
	mode: SearchMode,
): boolean {
	const q = normalize(query);
	if (!q) return true;
	if (matchName(q, normalize(row.name), tokensOf(row.name), mode) != null)
		return true;
	return String(row.dex).includes(query.trim());
}

/** Distinct species types present in the rows, sorted, for the Type dropdown. */
export function pokedexTypeOptions(rows: PokedexRow[]): string[] {
	const present = new Set(
		rows.map((r) => r.type).filter((t): t is string => t != null),
	);
	return [...present].sort();
}

/** Apply the search + type + generation filters, then sort by mode + direction. */
export function applyPokedexFilter(
	rows: PokedexRow[],
	f: PokedexFilter,
): PokedexRow[] {
	const gen = f.generation
		? (GENERATIONS.find((g) => g.label === f.generation) ?? null)
		: null;
	const out = rows.filter((r) => {
		if (!matchesQuery(r, f.query, f.searchMode)) return false;
		if (f.type && r.type !== f.type) return false;
		if (gen && !(r.dex >= gen.start && r.dex <= gen.end)) return false;
		return true;
	});
	const sign = f.sortDir === "asc" ? 1 : -1;
	if (f.sortMode === "name")
		out.sort((a, b) => sign * a.name.localeCompare(b.name));
	else if (f.sortMode === "count")
		// Primary: count (signed by direction). Tie-break: ascending dex, always
		// (direction-independent) so equal-count species keep a stable order.
		out.sort((a, b) => sign * (a.count - b.count) || a.dex - b.dex);
	else out.sort((a, b) => sign * (a.dex - b.dex));
	return out;
}
