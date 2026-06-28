/** One directory row per species that has at least one card in the corpus. */
export interface PokedexRow {
	dex: number;
	name: string;
	count: number;
	/** Most-frequent first energy type across this species' cards, or null. */
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

/** Filter rows by a query matching the species name (substring) or dex number. */
export function filterPokedex(rows: PokedexRow[], query: string): PokedexRow[] {
	const q = query.trim().toLowerCase();
	if (!q) return rows;
	return rows.filter(
		(r) => r.name.toLowerCase().includes(q) || String(r.dex).includes(q),
	);
}
