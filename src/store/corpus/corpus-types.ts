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
	rarity?: string;
	subtypes?: string[];
	supertype: string;
	types?: string[];
	setId: string;
	number: string;
	nationalPokedexNumbers?: number[];
	variants?: string[];
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
