import type { PokemonListEntry } from "./card-mappers";

/** Extract the trailing numeric id from a PokéAPI URL (".../6/"). */
function dexFromUrl(url: string): number | null {
	const m = url.match(/\/(\d+)\/?$/);
	return m ? Number(m[1]) : null;
}

/** National dex number for a species name (case-insensitive), or null. */
export function dexByName(list: PokemonListEntry[], name: string): number | null {
	const lower = name.toLowerCase();
	const entry = list.find((p) => p.name.toLowerCase() === lower);
	return entry ? dexFromUrl(entry.url) : null;
}

/** Species name for a national dex number, or null. */
export function nameByDex(list: PokemonListEntry[], dex: number): string | null {
	const entry = list.find((p) => dexFromUrl(p.url) === dex);
	return entry ? entry.name : null;
}
