import type { CardVariant } from "../lib/card-variants";
import { fallbackImageUrl } from "../lib/corpus/id-crosswalk";
import {
	subtypesFromTcgdex,
	supertypeFromCategory,
} from "../lib/corpus/tcgdex-card-fields";

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
	images: { symbol?: string; logo?: string };
}

export interface PokemonListEntry {
	name: string;
	url: string;
}

export interface FocusCardData extends CardStats {
	// Common with HoloCardData
	id: string;
	imageUrl: string;
	/**
	 * Language-invariant TCGdex image tail ("{serie}/{set}/{localId}"), so the
	 * detail view can derive a localized image via cardImage(). null when TCGdex
	 * has no image (pokemontcg.io-fallback or imageless cards).
	 */
	imageBase?: string | null;
	name: string;
	rarity?: string;
	subtypes?: string[];
	supertype: string;
	setId: string;
	setName: string;
	setSeries: string;
	cardNumber: string;
	nationalPokedexNumbers?: number[];
	/** Exact physical printings from TCGdex variants_detailed; undefined when absent. */
	variantsDetailed?: CardVariant[];

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
		// pokemontcg.io is not the TCGdex CDN, so there is no localizable base.
		imageBase: null,
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

/**
 * TCGdex card-detail shape (GET /v2/en/cards/{id}), per the official typedef
 * (https://tcgdex.dev/reference/card). Field names follow TCGdex, NOT the
 * pokemontcg.io-style names the app renders — `mapTcgdexFocusCard` translates.
 * Notably TCGdex has NO `subtypes`/`supertype`/`nationalPokedexNumbers`/`rules`
 * fields, and a card's embedded `set` is a SetBrief (no serie/releaseDate).
 */
export interface TcgdexFocusCard {
	id: string;
	localId: string;
	name: string;
	category: string; // "Pokemon" | "Trainer" | "Energy" (no app supertype field)
	image?: string;
	// SetBrief: {id, name, logo, symbol, cardCount} — NO serie / releaseDate.
	set: { id: string; name: string; logo?: string };
	illustrator?: string;
	rarity?: string;
	hp?: string | number;
	types?: string[];
	evolveFrom?: string;
	description?: string; // flavor text
	// TCGdex splits the "subtype" concept across these typed fields (no `subtypes`).
	stage?: string;
	trainerType?: string;
	energyType?: string;
	suffix?: string;
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
	// National-dex ids — TCGdex sends these under `dexId`, NOT nationalPokedexNumbers.
	dexId?: number[];
	// Rich per-printing list: { type, subtype?, size?, stamp?, variantId }.
	variants_detailed?: Array<{
		type: string;
		subtype?: string;
		size?: string;
		stamp?: string[];
		variantId: string;
	}>;
}

/** Map a TCGdex card detail response to {@link FocusCardData}. Drops pricing fields. */
export function mapTcgdexFocusCard(card: TcgdexFocusCard): FocusCardData {
	// No TCGdex image → bake the same pokemontcg.io fallback the corpus build uses
	// (override or constructed), so the detail view matches the grid instead of
	// showing the empty-state identity card. imageBase stays null (the fallback is
	// not the TCGdex CDN, so there is nothing to localize).
	const fallback = card.image ? null : fallbackImageUrl(card.id);
	return {
		id: card.id,
		imageUrl: card.image ? `${card.image}/high.webp` : (fallback?.large ?? ""),
		// Strip "https://assets.tcgdex.net/{lang}/" → the language-invariant tail
		// ("base/base4/4") so the detail view can derive a localized image.
		imageBase: card.image
			? card.image.replace(/^https?:\/\/[^/]+\/[^/]+\//, "")
			: null,
		name: card.name,
		rarity: card.rarity,
		// TCGdex has no `subtypes` field — assemble it from the typed fields.
		subtypes: subtypesFromTcgdex(card),
		// TCGdex has no `supertype` — derive the accented app supertype from category.
		supertype: supertypeFromCategory(card.category),
		setId: card.set.id,
		setName: card.set.name,
		// A card's SetBrief carries no serie/releaseDate; the caller
		// (getCardForRouteFn) joins setSeries + setReleaseDate from the nav tree.
		setSeries: "",
		cardNumber: card.localId,
		nationalPokedexNumbers: card.dexId,
		variantsDetailed: card.variants_detailed?.map((v) => ({
			variantId: v.variantId,
			type: v.type,
			subtype: v.subtype ?? null,
			size: v.size ?? null,
			stamp: v.stamp ?? null,
		})),
		setLogo: card.set.logo ? `${card.set.logo}.png` : undefined,
		setReleaseDate: undefined,
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
		// TCGdex's card detail carries no rule-box text (`rules`), so it stays undefined.
	};
}
