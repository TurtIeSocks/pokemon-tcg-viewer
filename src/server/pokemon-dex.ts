import type { HoloCardData } from "../components/holo-card";
import type { PokedexRow } from "../lib/pokedex";
import type { PokemonListEntry } from "./card-mappers";

/** Extract the trailing numeric id from a PokéAPI URL (".../6/"). */
export function dexFromUrl(url: string): number | null {
	const m = url.match(/\/(\d+)\/?$/);
	return m ? Number(m[1]) : null;
}

/** National dex number for a species name (case-insensitive), or null. */
export function dexByName(
	list: PokemonListEntry[],
	name: string,
): number | null {
	const lower = name.toLowerCase();
	const entry = list.find((p) => p.name.toLowerCase() === lower);
	return entry ? dexFromUrl(entry.url) : null;
}

/** Species name for a national dex number, or null. */
export function nameByDex(
	list: PokemonListEntry[],
	dex: number,
): string | null {
	const entry = list.find((p) => dexFromUrl(p.url) === dex);
	return entry ? entry.name : null;
}

/** Most-frequent key in a count map, or null if empty. Ties resolve to first seen. */
function topKey(counts: Map<string, number>): string | null {
	let best: string | null = null;
	let bestN = 0;
	for (const [k, n] of counts) {
		if (n > bestN) {
			best = k;
			bestN = n;
		}
	}
	return best;
}

/**
 * Aggregate the corpus into one directory row per species that has at least one
 * card. `count` = cards referencing that national-dex number; `type` = the
 * most-frequent first type (Fire/Water/...) across those cards. Sorted ascending by dex.
 */
export function buildPokedex(
	cards: HoloCardData[],
	list: PokemonListEntry[],
): PokedexRow[] {
	const agg = new Map<number, { count: number; types: Map<string, number> }>();
	for (const c of cards) {
		for (const dex of c.nationalPokedexNumbers ?? []) {
			let a = agg.get(dex);
			if (!a) {
				a = { count: 0, types: new Map() };
				agg.set(dex, a);
			}
			a.count++;
			const t = c.types?.[0];
			if (t) a.types.set(t, (a.types.get(t) ?? 0) + 1);
		}
	}
	const rows: PokedexRow[] = [];
	for (const entry of list) {
		const dex = dexFromUrl(entry.url);
		if (dex == null) continue;
		const a = agg.get(dex);
		if (!a) continue;
		rows.push({ dex, name: entry.name, count: a.count, type: topKey(a.types) });
	}
	rows.sort((x, y) => x.dex - y.dex);
	return rows;
}
