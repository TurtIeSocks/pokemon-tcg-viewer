import {
	apiCardToProps,
	type HoloCardData,
	type PokemonApiCard,
} from "pokemon-holo-cards";

export interface PokemonSet {
	id: string;
	name: string;
	series: string;
	releaseDate: string;
	total: number;
	images: { symbol: string; logo: string };
}

export async function getSets(): Promise<PokemonSet[]> {
	const resp = await fetch(
		"https://api.pokemontcg.io/v2/sets?orderBy=releaseDate&select=id,name,series,releaseDate,total,images&pageSize=250",
	);
	if (!resp.ok) throw new Error("Unable to fetch sets");
	const json = (await resp.json()) as { data: PokemonSet[] };
	return json.data;
}

export async function getCards(
	setId: string,
	page: number,
	pageSize: number,
): Promise<{ cards: HoloCardData[]; totalCount: number }> {
	const resp = await fetch(
		`https://api.pokemontcg.io/v2/cards?select=id,name,number,images,rarity,subtypes,supertype,set&orderBy=number&q=set.id:${setId}&page=${page}&pageSize=${pageSize}`,
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
