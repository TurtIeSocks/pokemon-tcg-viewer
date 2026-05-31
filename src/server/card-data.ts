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
	type PokemonSet,
} from "./card-mappers";

// v1: the CF Worker (injects the pokemontcg.io key). Absorb later by pointing
// at the origin and adding the key here. Server-only — never in the client bundle.
function apiBase(): string {
	return (process.env.API_BASE ?? "https://api.pokemontcg.io").replace(
		/\/$/,
		"",
	);
}

interface CardPage {
	cards: HoloCardData[];
	totalCount: number;
}

async function fetchCards(
	query: string,
	page: number,
	pageSize: number,
	orderBy: string,
): Promise<CardPage> {
	const url = `${apiBase()}/v2/cards?select=id,name,number,images,rarity,subtypes,supertype,set,nationalPokedexNumbers,tcgplayer&orderBy=${orderBy}&q=${encodeURIComponent(query)}&page=${page}&pageSize=${pageSize}`;
	const resp = await fetch(url);
	if (!resp.ok) throw new Error(`Unable to fetch cards: ${resp.status}`);
	const json = (await resp.json()) as {
		data: PokemonApiCard[];
		totalCount: number;
	};
	return { cards: json.data.map(apiCardToProps), totalCount: json.totalCount };
}

export const getSetsFn = createServerFn({ method: "GET" }).handler(
	async (): Promise<PokemonSet[]> => {
		const resp = await fetch(
			`${apiBase()}/v2/sets?orderBy=releaseDate&select=id,name,series,releaseDate,total,images&pageSize=250`,
		);
		if (!resp.ok) throw new Error("Unable to fetch sets");
		const json = (await resp.json()) as { data: PokemonSet[] };
		return json.data;
	},
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
