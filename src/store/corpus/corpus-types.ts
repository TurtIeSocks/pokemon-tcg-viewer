import type { Region } from "../../lib/languages";

/**
 * Per-card metadata stored in the local corpus. Trimmed from the pokemontcg.io
 * card shape: enough to render the grid, match by name, filter, and sort.
 * setName/setSeries/setReleaseDate are NOT stored — joined from the cached
 * sets list at hydration time.
 */
export interface CorpusCard {
	id: string;
	name: string;
	imageUrl: string;
	imageUrlSmall: string;
	/** Language-invariant TCGdex image tail "{serie}/{set}/{localId}"; null => no
	 * localized image, use imageUrl (which is then a pokemontcg.io fallback).
	 * Optional so pre-existing CorpusCard fixtures need no churn; real build
	 * data always sets it (null or a value), and consumers guard with
	 * !card.imageBase, which treats null and undefined identically. */
	imageBase?: string | null;
	rarity?: string;
	subtypes?: string[];
	supertype: string;
	types?: string[];
	setId: string;
	number: string;
	nationalPokedexNumbers?: number[];
	variants?: string[];
	/**
	 * Which catalog region this card belongs to, stamped by `buildIndex` at
	 * index-build time (never stored in the corpus blob itself). Optional so
	 * pre-existing CorpusCard fixtures need no churn; absent means treat as
	 * `west` (the default every existing caller already gets).
	 */
	region?: Region;
}

/**
 * Per-card battle/flavor detail, stored in the optional offline detail blob
 * (corpus-detail.json.gz). Mirrors the CardStats fields the focus view renders,
 * minus prices (which drift) and setLogo (joined). Optional fields are omitted
 * when absent, matching CorpusCard.
 */
export interface DetailCard {
	hp?: string;
	evolvesFrom?: string;
	abilities?: { name: string; text: string; type: string }[];
	attacks?: { name: string; cost?: string[]; damage?: string; text?: string }[];
	rules?: string[];
	weaknesses?: { type: string; value: string }[];
	resistances?: { type: string; value: string }[];
	retreatCost?: string[];
	flavorText?: string;
	artist?: string;
}
