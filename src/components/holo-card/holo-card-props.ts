import type { HoloCardProps } from "./holo-card";
import type { HoloCardData } from "./types";

/**
 * Maps the shared card-identity fields from {@link HoloCardData} onto the prop
 * subset every <HoloCard> call site needs, renaming `setSeries` → `series` to
 * match the component's API. Spread the result onto <HoloCard>/<HoloCardIsland>
 * alongside any per-site props (hoverOverlay, owned, size, style, className).
 */
export function holoCardProps(
	card: HoloCardData,
): Pick<
	HoloCardProps,
	| "imageUrl"
	| "imageUrlSmall"
	| "imageUrlFallback"
	| "name"
	| "rarity"
	| "subtypes"
	| "supertype"
	| "setId"
	| "series"
	| "variants"
	| "cardNumber"
> {
	return {
		imageUrl: card.imageUrl,
		imageUrlSmall: card.imageUrlSmall,
		imageUrlFallback: card.imageUrlFallback,
		name: card.name,
		rarity: card.rarity,
		subtypes: card.subtypes,
		supertype: card.supertype,
		setId: card.setId,
		series: card.setSeries,
		variants: card.variants,
		cardNumber: card.cardNumber,
	};
}
