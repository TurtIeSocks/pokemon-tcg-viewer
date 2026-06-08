import type { HoloCardData } from "../components/holo-card";

/** A card ability (focus view). */
export interface CardAbility {
	name: string;
	text: string;
	type: string;
}

/** A card attack (focus view). */
export interface CardAttack {
	name: string;
	cost?: string[];
	damage?: string;
	text?: string;
}

/** A typed value for weaknesses/resistances (e.g. `{ type: "Fire", value: "×2" }`). */
export interface CardTypeValue {
	type: string;
	value: string;
}

/** Small/large card image URLs from the pokemontcg.io API. */
export interface ApiCardImages {
	small: string;
	large: string;
}

/** Battle/stat fields shared by {@link FocusCardData} and {@link PokemonApiFocusCard}. */
export interface CardStats {
	hp?: string;
	types?: string[];
	evolvesFrom?: string;
	abilities?: CardAbility[];
	attacks?: CardAttack[];
	rules?: string[];
	weaknesses?: CardTypeValue[];
	resistances?: CardTypeValue[];
	retreatCost?: string[];
	flavorText?: string;
	artist?: string;
}

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
	images: ApiCardImages;
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

export interface FocusCardData extends CardStats {
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

export interface PokemonApiFocusCard extends CardStats {
	id: string;
	name: string;
	supertype: string;
	subtypes?: string[];
	rarity?: string;
	number: string;
	nationalPokedexNumbers?: number[];
	set: {
		id: string;
		name: string;
		series: string;
		releaseDate?: string;
		images?: { logo?: string; symbol?: string };
	};
	images: ApiCardImages;
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
