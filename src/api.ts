import type { HoloCardData } from "./components/holo-card";
import {
	buildFilterClauses,
	type FilterClauses,
} from "./utils/build-filter-clauses";

interface PokemonApiCard {
	id: string;
	name: string;
	supertype: string;
	subtypes?: string[];
	rarity?: string;
	number: string;
	nationalPokedexNumbers?: number[];
	set: { id: string; name: string; series: string };
	images: { small: string; large: string };
}

function apiCardToProps(card: PokemonApiCard): HoloCardData {
	return {
		id: card.id,
		imageUrl: card.images.large,
		name: card.name,
		rarity: card.rarity,
		subtypes: card.subtypes,
		supertype: card.supertype,
		setId: card.set.id,
		setName: card.set.name,
		cardNumber: card.number,
		nationalPokedexNumbers: card.nationalPokedexNumbers,
	};
}

export interface PokemonSet {
	id: string;
	name: string;
	series: string;
	releaseDate: string;
	total: number;
	images: { symbol: string; logo: string };
}

export interface PokemonListEntry {
	name: string;
	url: string;
}

export async function getSets(): Promise<PokemonSet[]> {
	const resp = await fetch(
		"https://api.pokemontcg.io/v2/sets?orderBy=releaseDate&select=id,name,series,releaseDate,total,images&pageSize=250",
	);
	if (!resp.ok) throw new Error("Unable to fetch sets");
	const json = (await resp.json()) as { data: PokemonSet[] };
	return json.data;
}

async function getCardsByQuery(
	query: string,
	page: number,
	pageSize: number,
	orderBy: string,
): Promise<{ cards: HoloCardData[]; totalCount: number }> {
	const resp = await fetch(
		`https://api.pokemontcg.io/v2/cards?select=id,name,number,images,rarity,subtypes,supertype,set,nationalPokedexNumbers&orderBy=${orderBy}&q=${encodeURIComponent(query)}&page=${page}&pageSize=${pageSize}`,
	);
	if (!resp.ok) throw new Error("Unable to fetch cards");

	const json = (await resp.json()) as {
		data: PokemonApiCard[];
		totalCount: number;
	};

	return {
		cards: json.data.map(apiCardToProps),
		totalCount: json.totalCount,
	};
}

export function getCardsBySet(
	setId: string,
	page: number,
	pageSize: number,
	filters?: FilterClauses,
): Promise<{ cards: HoloCardData[]; totalCount: number }> {
	return getCardsByQuery(
		`set.id:${setId}${buildFilterClauses(filters ?? {})}`,
		page,
		pageSize,
		"number",
	);
}

export function getCardsByPokedexNumber(
	pokedexNumber: number,
	page: number,
	pageSize: number,
	filters?: FilterClauses,
): Promise<{ cards: HoloCardData[]; totalCount: number }> {
	return getCardsByQuery(
		`nationalPokedexNumbers:${pokedexNumber}${buildFilterClauses(filters ?? {})}`,
		page,
		pageSize,
		"set.releaseDate,number",
	);
}

async function getStringList(endpoint: string): Promise<string[]> {
	const resp = await fetch(`https://api.pokemontcg.io/v2/${endpoint}`);
	if (!resp.ok) throw new Error(`Unable to fetch ${endpoint}`);
	const json = (await resp.json()) as { data: string[] };
	return json.data;
}

export function getTypes(): Promise<string[]> {
	return getStringList("types");
}

export function getSubtypes(): Promise<string[]> {
	return getStringList("subtypes");
}

export function getSupertypes(): Promise<string[]> {
	return getStringList("supertypes");
}

export function getRarities(): Promise<string[]> {
	return getStringList("rarities");
}
