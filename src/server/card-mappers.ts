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

export interface PokemonSet {
	id: string;
	name: string;
	series: string;
	releaseDate: string;
	printedTotal?: number;
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
	};
}

/** TCGdex card-detail shape (GET /v2/en/cards/{id}). */
export interface TcgdexFocusCard {
	id: string;
	localId: string;
	name: string;
	category: string;
	image?: string;
	set: {
		id: string;
		name: string;
		serie?: { id: string; name: string };
		releaseDate?: string;
		logo?: string;
	};
	illustrator?: string;
	rarity?: string;
	hp?: string | number;
	types?: string[];
	evolveFrom?: string;
	description?: string;
	abilities?: Array<{ name: string; type: string; effect?: string }>;
	attacks?: Array<{
		name: string;
		cost?: string[];
		damage?: string | number;
		effect?: string;
	}>;
	weaknesses?: Array<{ type: string; value: string }>;
	resistances?: Array<{ type: string; value: string }>;
	retreat?: number;
	rules?: string[];
	subtypes?: string[];
	supertype?: string;
	nationalPokedexNumbers?: number[];
}

/** Map a TCGdex card detail response to {@link FocusCardData}. Drops pricing fields. */
export function mapTcgdexFocusCard(card: TcgdexFocusCard): FocusCardData {
	return {
		id: card.id,
		imageUrl: card.image ? `${card.image}/high.webp` : "",
		name: card.name,
		rarity: card.rarity,
		subtypes: card.subtypes,
		supertype: card.supertype ?? card.category,
		setId: card.set.id,
		setName: card.set.name,
		setSeries: card.set.serie?.name ?? "",
		cardNumber: card.localId,
		nationalPokedexNumbers: card.nationalPokedexNumbers,
		setLogo: card.set.logo ? `${card.set.logo}.png` : undefined,
		setReleaseDate: card.set.releaseDate,
		// Coerce hp/damage to string — the TCGdex API returns numbers for these
		// fields; our CardStats type models them as strings.
		hp: card.hp != null ? String(card.hp) : undefined,
		types: card.types,
		evolvesFrom: card.evolveFrom,
		flavorText: card.description,
		artist: card.illustrator,
		abilities: card.abilities?.map((a) => ({
			name: a.name,
			type: a.type,
			text: a.effect ?? "",
		})),
		attacks: card.attacks?.map((a) => ({
			name: a.name,
			cost: a.cost,
			damage: a.damage != null ? String(a.damage) : undefined,
			text: a.effect,
		})),
		weaknesses: card.weaknesses,
		resistances: card.resistances,
		retreatCost:
			card.retreat !== undefined
				? Array.from({ length: card.retreat }, () => "Colorless")
				: undefined,
		rules: card.rules,
	};
}
