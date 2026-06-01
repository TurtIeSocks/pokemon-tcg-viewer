import type { HoloCardData } from "../components/holo-card";

export interface PokemonApiCard {
	id: string;
	name: string;
	supertype: string;
	subtypes?: string[];
	types?: string[];
	rarity?: string;
	number: string;
	nationalPokedexNumbers?: number[];
	set: { id: string; name: string; series: string; releaseDate?: string };
	images: { small: string; large: string };
	tcgplayer?: { prices?: Record<string, unknown> };
}

export function apiCardToProps(card: PokemonApiCard): HoloCardData {
	return {
		id: card.id,
		imageUrl: card.images.large,
		imageUrlSmall: card.images.small,
		name: card.name,
		rarity: card.rarity,
		subtypes: card.subtypes,
		types: card.types,
		supertype: card.supertype,
		setId: card.set.id,
		setName: card.set.name,
		setSeries: card.set.series,
		setReleaseDate: card.set.releaseDate,
		cardNumber: card.number,
		nationalPokedexNumbers: card.nationalPokedexNumbers,
		// TCGplayer price-variant keys = the holo/non-holo printing signal.
		variants: card.tcgplayer?.prices
			? Object.keys(card.tcgplayer.prices)
			: undefined,
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

export interface FocusCardData {
	// Common with HoloCardData
	id: string;
	imageUrl: string;
	name: string;
	rarity?: string;
	subtypes?: string[];
	supertype: string;
	setId: string;
	setName: string;
	setSeries: string;
	cardNumber: string;
	nationalPokedexNumbers?: number[];

	// Additional for focus view
	setLogo?: string;
	setReleaseDate?: string;
	hp?: string;
	types?: string[];
	evolvesFrom?: string;
	abilities?: { name: string; text: string; type: string }[];
	attacks?: {
		name: string;
		cost?: string[];
		damage?: string;
		text?: string;
	}[];
	rules?: string[];
	weaknesses?: { type: string; value: string }[];
	resistances?: { type: string; value: string }[];
	retreatCost?: string[];
	flavorText?: string;
	artist?: string;
	tcgplayer?: {
		url: string;
		updatedAt: string;
		prices?: Record<
			string,
			{ market?: number; low?: number; mid?: number; high?: number }
		>;
	};
	cardmarket?: {
		url: string;
		updatedAt: string;
		prices?: {
			averageSellPrice?: number;
			avg30?: number;
			trendPrice?: number;
		};
	};
}

export interface PokemonApiFocusCard {
	id: string;
	name: string;
	supertype: string;
	subtypes?: string[];
	rarity?: string;
	number: string;
	nationalPokedexNumbers?: number[];
	hp?: string;
	types?: string[];
	evolvesFrom?: string;
	abilities?: { name: string; text: string; type: string }[];
	attacks?: {
		name: string;
		cost?: string[];
		damage?: string;
		text?: string;
	}[];
	rules?: string[];
	weaknesses?: { type: string; value: string }[];
	resistances?: { type: string; value: string }[];
	retreatCost?: string[];
	flavorText?: string;
	artist?: string;
	set: {
		id: string;
		name: string;
		series: string;
		releaseDate?: string;
		images?: { logo?: string; symbol?: string };
	};
	images: { small: string; large: string };
	tcgplayer?: FocusCardData["tcgplayer"];
	cardmarket?: FocusCardData["cardmarket"];
}

export function apiCardToFocusProps(card: PokemonApiFocusCard): FocusCardData {
	return {
		id: card.id,
		imageUrl: card.images.large,
		name: card.name,
		rarity: card.rarity,
		subtypes: card.subtypes,
		supertype: card.supertype,
		setId: card.set.id,
		setName: card.set.name,
		setSeries: card.set.series,
		cardNumber: card.number,
		nationalPokedexNumbers: card.nationalPokedexNumbers,
		setLogo: card.set.images?.logo,
		setReleaseDate: card.set.releaseDate,
		hp: card.hp,
		types: card.types,
		evolvesFrom: card.evolvesFrom,
		abilities: card.abilities,
		attacks: card.attacks,
		rules: card.rules,
		weaknesses: card.weaknesses,
		resistances: card.resistances,
		retreatCost: card.retreatCost,
		flavorText: card.flavorText,
		artist: card.artist,
		tcgplayer: card.tcgplayer,
		cardmarket: card.cardmarket,
	};
}
