/**
 * Card data shape consumed by <HoloCard />. Matches the previous external
 * package's HoloCardData so call sites can swap import paths without
 * adjusting their data flow.
 */
export interface HoloCardData {
	id: string;
	imageUrl: string;
	name: string;
	rarity?: string;
	subtypes?: string[];
	supertype?: string;
	setId: string;
	cardNumber: string;
}
