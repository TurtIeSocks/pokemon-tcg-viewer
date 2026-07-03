/**
 * One physical printing of a card, mirrored from TCGdex `variants_detailed`.
 * `variantId` is a TCGdex-internal back-reference only (NOT a price key); the
 * authoritative, portable identity is `type` / `subtype` / `stamp` / `size`.
 */
export interface CardVariant {
	variantId: string;
	type: string;
	subtype: string | null;
	size: string | null;
	stamp: string[] | null;
}

/** The structured printing identity stored on a stack (same shape as CardVariant). */
export type CardPrinting = CardVariant;

/**
 * True when a card's printing list includes a reverse holo ("reverse" TCGdex
 * key; "reverseHolofoil" in legacy TCGplayer-seeded data).
 */
export function hasReverseVariant(variants?: string[] | null): boolean {
	return !!variants?.some((v) => v.toLowerCase().startsWith("reverse"));
}

/**
 * True when a stack's recorded printing is the reverse holo one. Prefers the
 * exact TCGdex printing; falls back to the coarse legacy `variant` key.
 */
export function isReversePrinting(stack: {
	printing?: CardPrinting | null;
	variant?: string | null;
}): boolean {
	const t = stack.printing?.type ?? stack.variant;
	return !!t && t.toLowerCase().startsWith("reverse");
}

/**
 * Humanize a kebab token: "1st-edition" -> "1st Edition", "shadowless" ->
 * "Shadowless". A hyphen BETWEEN two digits is kept (year ranges like
 * "1999-2000-copyright" -> "1999-2000 Copyright"); every other hyphen is a
 * word boundary that becomes a space before title-casing.
 */
function humanize(token: string): string {
	return token
		.replace(/(?<=\D)-|-(?=\D)/g, " ")
		.split(" ")
		.map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
		.join(" ");
}

/**
 * Human label for a printing: stamp(s) · subtype · type, plus a non-"standard"
 * size. e.g. { type: holo, subtype: shadowless, stamp: [1st-edition] } ->
 * "1st Edition · Shadowless · Holo".
 */
export function variantLabel(v: CardVariant): string {
	const parts: string[] = [];
	if (v.stamp?.length) parts.push(...v.stamp.map(humanize));
	if (v.subtype) parts.push(humanize(v.subtype));
	parts.push(humanize(v.type));
	if (v.size && v.size !== "standard") parts.push(humanize(v.size));
	return parts.join(" · ");
}
