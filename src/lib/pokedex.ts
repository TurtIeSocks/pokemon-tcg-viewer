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

export type PokedexSort = "dex" | "name" | "count";

/** Active directory filter + sort. `null` on a dimension = no filter on it. */
export interface PokedexFilter {
	query: string;
	type: string | null;
	generation: string | null;
	sort: PokedexSort;
}

export const POKEDEX_FILTER_DEFAULTS: PokedexFilter = {
	query: "",
	type: null,
	generation: null,
	sort: "dex",
};

/** Distinct species types present in the rows, sorted, for the Type dropdown. */
export function pokedexTypeOptions(rows: PokedexRow[]): string[] {
	const present = new Set(
		rows.map((r) => r.type).filter((t): t is string => t != null),
	);
	return [...present].sort();
}

/** Apply the search + type + generation filters, then sort. Pure. */
export function applyPokedexFilter(
	rows: PokedexRow[],
	f: PokedexFilter,
): PokedexRow[] {
	const q = f.query.trim().toLowerCase();
	const gen = f.generation
		? (GENERATIONS.find((g) => g.label === f.generation) ?? null)
		: null;
	const out = rows.filter((r) => {
		if (q && !(r.name.toLowerCase().includes(q) || String(r.dex).includes(q)))
			return false;
		if (f.type && r.type !== f.type) return false;
		if (gen && !(r.dex >= gen.start && r.dex <= gen.end)) return false;
		return true;
	});
	// "dex" is the corpus order buildPokedex already produced; filter preserves it.
	if (f.sort === "name") out.sort((a, b) => a.name.localeCompare(b.name));
	else if (f.sort === "count")
		out.sort((a, b) => b.count - a.count || a.dex - b.dex);
	return out;
}
