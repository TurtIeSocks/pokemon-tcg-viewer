import { useEffect, useRef, useState } from "react";

export interface PokemonListEntry {
	name: string;
	url: string;
}

// Sliced to the first 1025 entries so the array index + 1 maps cleanly to the
// National Pokédex number used by the TCG API. Past 1025, PokéAPI returns alt
// forms with synthetic IDs (10001+) that don't match the TCG API's
// `nationalPokedexNumbers` field.
const MAX_ENTRIES = 1025;

let cachedList: PokemonListEntry[] | null = null;
let inFlight: Promise<PokemonListEntry[]> | null = null;

function fetchList(): Promise<PokemonListEntry[]> {
	if (cachedList) return Promise.resolve(cachedList);
	if (inFlight) return inFlight;
	inFlight = fetch(`https://pokeapi.co/api/v2/pokemon?limit=${MAX_ENTRIES}`)
		.then((r) => {
			if (!r.ok) throw new Error("Unable to fetch Pokémon list");
			return r.json() as Promise<{ results: PokemonListEntry[] }>;
		})
		.then((json) => {
			cachedList = json.results;
			return cachedList;
		})
		.finally(() => {
			inFlight = null;
		});
	return inFlight;
}

export function usePokemonList(): PokemonListEntry[] {
	const [list, setList] = useState<PokemonListEntry[]>(cachedList ?? []);
	const didFetchRef = useRef(false);

	useEffect(() => {
		if (didFetchRef.current || cachedList) return;
		didFetchRef.current = true;
		fetchList()
			.then(setList)
			.catch((e) => console.error(e));
	}, []);

	return list;
}
