/**
 * Card data shape consumed by <HoloCard /> and the cross-link overlays.
 * Matches the previous external package's HoloCardData with the additions
 * needed for Phase 1 cross-mode linking.
 */
export interface HoloCardData {
	id: string;
	imageUrl: string;
	/** Smaller (~245px) image for grids; falls back to imageUrl when absent. */
	imageUrlSmall?: string;
	name: string;
	rarity?: string;
	subtypes?: string[];
	supertype?: string;
	setId: string;
	setName: string;
	setSeries: string;
	setReleaseDate?: string;
	cardNumber: string;
	nationalPokedexNumbers?: number[];
	/**
	 * TCGplayer price-variant keys (e.g. ["normal"], ["holofoil"],
	 * ["normal","reverseHolofoil"]). The API has no "is holo" flag; these encode
	 * the actual printing. Drives the holo/non-holo split (see variantsToHolo).
	 * Undefined when the card has no TCGplayer data.
	 */
	variants?: string[];
}
