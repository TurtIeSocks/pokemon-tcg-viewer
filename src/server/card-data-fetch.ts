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
	type FocusCardData,
	mapTcgdexFocusCard,
	type PokemonListEntry,
	type PokemonSet,
	type TcgdexFocusCard,
} from "./card-mappers";

// v2: the CF Worker proxies TCGdex. Default changed from pokemontcg.io to the
// worker so cold starts without API_BASE still resolve to TCGdex data.
// Server-only — never in the client bundle.
export function apiBase(): string {
	return (
		process.env.API_BASE ?? "https://pokemon-tcg-proxy.ptcg-viewer.workers.dev"
	).replace(/\/$/, "");
}

/** TCGdex set detail shape (GET /v2/en/sets/{id}). */
export interface TcgdexSetDetail {
	id: string;
	name: string;
	releaseDate?: string;
	cardCount: { total: number; official: number };
	serie: { id: string; name: string };
	logo?: string;
	symbol?: string;
}

/** Map a TCGdex set detail to the app's PokemonSet shape. */
export function mapTcgdexSet(s: TcgdexSetDetail): PokemonSet {
	return {
		id: s.id,
		name: s.name,
		series: s.serie.name,
		releaseDate: s.releaseDate ?? "",
		printedTotal: s.cardCount.official,
		total: s.cardCount.total,
		images: {
			logo: s.logo ? `${s.logo}.png` : "",
			symbol: s.symbol ? `${s.symbol}.png` : "",
		},
	};
}

/** Minimal list entry from GET /v2/en/sets (no releaseDate or serie). */
interface TcgdexSetListEntry {
	id: string;
}

const SETS_CONCURRENCY = 10;

/**
 * Raw async fetch of all sets from TCGdex. Fetches the list first, then
 * resolves each set's detail (which carries releaseDate + serie) with a
 * small concurrency limit. Safe to call from within a server function
 * handler (avoids the cross-fn RPC hop).
 */
export async function fetchAllSets(): Promise<PokemonSet[]> {
	const base = apiBase();
	const listResp = await fetch(`${base}/v2/en/sets`);
	if (!listResp.ok) throw new Error("Unable to fetch sets list");
	const list = (await listResp.json()) as TcgdexSetListEntry[];

	const results: PokemonSet[] = [];
	for (let i = 0; i < list.length; i += SETS_CONCURRENCY) {
		const batch = list.slice(i, i + SETS_CONCURRENCY);
		const details = await Promise.all(
			batch.map(async (entry) => {
				const r = await fetch(`${base}/v2/en/sets/${entry.id}`);
				if (!r.ok)
					throw new Error(`Unable to fetch set detail for ${entry.id}`);
				return (await r.json()) as TcgdexSetDetail;
			}),
		);
		for (const d of details) results.push(mapTcgdexSet(d));
	}
	return results;
}

/** Raw card-by-id fetch. Safe to call from loaders/handlers (no RPC-stub hop). */
export async function fetchCardById(id: string): Promise<FocusCardData> {
	const resp = await fetch(`${apiBase()}/v2/en/cards/${id}`);
	if (!resp.ok) {
		if (resp.status === 404)
			throw new Response("Card not found", { status: 404 });
		throw new Error(`Failed to fetch card ${id}: ${resp.status}`);
	}
	const json = (await resp.json()) as TcgdexFocusCard;
	return mapTcgdexFocusCard(json);
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
