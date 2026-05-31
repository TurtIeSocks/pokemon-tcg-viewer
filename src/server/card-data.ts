import { createServerFn } from "@tanstack/react-start";
import type { HoloCardData } from "../components/holo-card";
import {
	buildFilterClauses,
	type FilterClauses,
} from "../utils/build-filter-clauses";
import { escapeLucene } from "../utils/escape-lucene";
import {
	apiCardToFocusProps,
	apiCardToProps,
	type FocusCardData,
	type PokemonApiCard,
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
 * Raw async fetch of all sets — NOT a server function. Safe to call from
 * within another server function handler (avoids the cross-fn RPC hop).
 */
export async function fetchAllSets(): Promise<PokemonSet[]> {
	const resp = await fetch(
		`${apiBase()}/v2/sets?orderBy=releaseDate&select=id,name,series,releaseDate,total,images&pageSize=250`,
	);
	if (!resp.ok) throw new Error("Unable to fetch sets");
	const json = (await resp.json()) as { data: PokemonSet[] };
	return json.data;
}

export interface CardPage {
	cards: HoloCardData[];
	totalCount: number;
}

export async function fetchCards(
	query: string,
	page: number,
	pageSize: number,
	orderBy: string,
): Promise<CardPage> {
	const url = `${apiBase()}/v2/cards?select=id,name,number,images,rarity,subtypes,supertype,types,set,nationalPokedexNumbers,tcgplayer&orderBy=${orderBy}&q=${encodeURIComponent(query)}&page=${page}&pageSize=${pageSize}`;
	const resp = await fetch(url);
	if (!resp.ok) throw new Error(`Unable to fetch cards: ${resp.status}`);
	const json = (await resp.json()) as {
		data: PokemonApiCard[];
		totalCount: number;
	};
	return { cards: json.data.map(apiCardToProps), totalCount: json.totalCount };
}

export const getSetsFn = createServerFn({ method: "GET" }).handler(
	(): Promise<PokemonSet[]> => fetchAllSets(),
);

export interface SetCardsInput {
	setId: string;
	page: number;
	pageSize: number;
	filters?: FilterClauses;
	name?: string;
}

export const getCardsBySetFn = createServerFn({ method: "GET" })
	.inputValidator((input: SetCardsInput) => input)
	.handler(async ({ data }): Promise<CardPage> => {
		const nameClause = data.name ? ` name:"*${escapeLucene(data.name)}*"` : "";
		return fetchCards(
			`set.id:${data.setId}${nameClause}${buildFilterClauses(data.filters ?? {})}`,
			data.page,
			data.pageSize,
			"number",
		);
	});

export const getCardByIdFn = createServerFn({ method: "GET" })
	.inputValidator((id: string) => id)
	.handler(async ({ data: id }): Promise<FocusCardData> => {
		const resp = await fetch(`${apiBase()}/v2/cards/${id}`);
		if (!resp.ok) {
			if (resp.status === 404)
				throw new Response("Card not found", { status: 404 });
			throw new Error(`Failed to fetch card ${id}: ${resp.status}`);
		}
		const json = (await resp.json()) as { data: PokemonApiFocusCard };
		return apiCardToFocusProps(json.data);
	});

/** Raw card-by-id fetch (safe to call from loaders, avoids RPC-stub hop). */
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

export function fetchCardsByName(
	name: string,
	page: number,
	pageSize: number,
): Promise<CardPage> {
	return fetchCards(
		`name:"*${escapeLucene(name)}*"`,
		page,
		pageSize,
		"set.releaseDate,number",
	);
}

export function fetchCardsByPokedex(
	dex: number,
	page: number,
	pageSize: number,
): Promise<CardPage> {
	return fetchCards(
		`nationalPokedexNumbers:${dex}`,
		page,
		pageSize,
		"set.releaseDate,number",
	);
}

/** Raw species-list fetch (PokéAPI). Not a server fn — safe to call in loaders. */
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

// createServerFn wrappers (for any future client-side calls; loaders use the raw fns above).
export const getCardsByNameFn = createServerFn({ method: "GET" })
	.inputValidator((i: { name: string; page: number; pageSize: number }) => i)
	.handler(({ data }) => fetchCardsByName(data.name, data.page, data.pageSize));

export const getCardsByPokedexFn = createServerFn({ method: "GET" })
	.inputValidator((i: { dex: number; page: number; pageSize: number }) => i)
	.handler(({ data }) => fetchCardsByPokedex(data.dex, data.page, data.pageSize));

export const getPokemonListFn = createServerFn({ method: "GET" }).handler(() =>
	getPokemonListCached(),
);
