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
