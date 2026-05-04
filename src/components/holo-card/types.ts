/**
 * Card data shape consumed by <HoloCard /> and the cross-link overlays.
 * Matches the previous external package's HoloCardData with the additions
 * needed for Phase 1 cross-mode linking.
 */
export interface HoloCardData {
	id: string;
	imageUrl: string;
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
}
