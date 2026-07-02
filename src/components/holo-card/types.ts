import type { Region } from "../../lib/languages";

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
	/**
	 * Baked English image url to fall back to when a localized image 404s (a
	 * language may lack an image EN has). Set by hydrateCard only when rendering
	 * a non-English language with a derived image; undefined for English (no
	 * reconciliation needed — imageUrl is already the baked url).
	 */
	imageUrlFallback?: string;
	/** Baked English LOW-res url (grid thumbnail counterpart to imageUrlFallback). */
	imageUrlSmallFallback?: string;
	name: string;
	rarity?: string;
	subtypes?: string[];
	types?: string[];
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
	/**
	 * Which catalog region this card belongs to, joined from `CorpusCard.region`
	 * by `hydrateCard`. Optional so pre-existing HoloCardData fixtures need no
	 * churn; absent means treat as `west` (the default every existing caller
	 * already gets) -- see `faceLanguageFor`.
	 */
	region?: Region;
}
