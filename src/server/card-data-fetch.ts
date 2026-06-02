// Server-only raw data fetchers. These touch process.env (API base) and call
// external APIs directly, so they MUST NOT be imported from any client-reachable
// module. The createServerFn wrappers in ./card-data.ts are the client-facing
// surface; server modules (corpus-server, nav-tree) import these raw helpers
// directly to skip the cross-fn RPC hop.
//
// Keeping these out of ./card-data.ts means that module — which IS imported by
// the client (store/sets-slice → getSetsFn) — carries zero top-level server-only
// code, so the client/server split no longer rests solely on tree-shaking the
// stripped server-fn handlers. Defense in depth behind scripts/check-client-bundle.ts.

import {
	apiCardToFocusProps,
	type FocusCardData,
	type PokemonApiFocusCard,
	type PokemonListEntry,
	type PokemonSet,
} from "./card-mappers";

// v1: the CF Worker (injects the pokemontcg.io key). Absorb later by pointing
// at the origin and adding the key here. Server-only — never in the client bundle.
export function apiBase(): string {
	return (process.env.API_BASE ?? "https://api.pokemontcg.io").replace(
		/\/$/,
		"",
	);
}

/**
 * Raw async fetch of all sets. Safe to call from within a server function
 * handler (avoids the cross-fn RPC hop).
 */
export async function fetchAllSets(): Promise<PokemonSet[]> {
	const resp = await fetch(
		`${apiBase()}/v2/sets?orderBy=releaseDate&select=id,name,series,releaseDate,total,images&pageSize=250`,
	);
	if (!resp.ok) throw new Error("Unable to fetch sets");
	const json = (await resp.json()) as { data: PokemonSet[] };
	return json.data;
}

/** Raw card-by-id fetch. Safe to call from loaders/handlers (no RPC-stub hop). */
export async function fetchCardById(id: string): Promise<FocusCardData> {
	const resp = await fetch(`${apiBase()}/v2/cards/${id}`);
	if (!resp.ok) {
		if (resp.status === 404)
			throw new Response("Card not found", { status: 404 });
		throw new Error(`Failed to fetch card ${id}: ${resp.status}`);
	}
	const json = (await resp.json()) as { data: PokemonApiFocusCard };
	return apiCardToFocusProps(json.data);
}

const POKEMON_LIST_LIMIT = 1025;

/** Raw species-list fetch (PokéAPI). */
export async function fetchPokemonList(): Promise<PokemonListEntry[]> {
	const resp = await fetch(
		`https://pokeapi.co/api/v2/pokemon?limit=${POKEMON_LIST_LIMIT}`,
	);
	if (!resp.ok) throw new Error("Unable to fetch Pokémon list");
	const json = (await resp.json()) as { results: PokemonListEntry[] };
	return json.results;
}

let pokemonListCache: PokemonListEntry[] | null = null;
export async function getPokemonListCached(): Promise<PokemonListEntry[]> {
	if (!pokemonListCache) pokemonListCache = await fetchPokemonList();
	return pokemonListCache;
}

// Memoize card fetches for the process lifetime. Card data is effectively
// static (prices drift, but the focus view tolerates a process-lifetime cache;
// a deploy restart refreshes it). Caching the promise also dedupes concurrent
// opens of the same card. Evict on failure so a transient error doesn't poison.
const cardByIdCache = new Map<string, Promise<FocusCardData>>();
export function getCardByIdCached(id: string): Promise<FocusCardData> {
	let p = cardByIdCache.get(id);
	if (!p) {
		p = fetchCardById(id).catch((e) => {
			cardByIdCache.delete(id);
			throw e;
		});
		cardByIdCache.set(id, p);
	}
	return p;
}
