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
 * True when the reverse holo is the card's ONLY printing (e.g. the WotC
 * movie promos Scizor 33 / Entei 34 / Pichu 35 — no standard print exists).
 * Such cards render the reverse foil by default.
 */
export function isReverseOnlyPrinting(variants?: string[] | null): boolean {
	return (
		!!variants?.length &&
		variants.every((v) => v.toLowerCase().startsWith("reverse"))
	);
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
 * Parse free-form variant/foil text (e.g. a CSV "Foil" column) into a
 * synthesized printing, or null when no finish token is recognized. Matching
 * is case-insensitive on the trimmed text; precedence is load-bearing
 * ("Reverse Holofoil" contains "holo" and "foil"; "Non-Foil" contains "foil"):
 * reverse first, then a negation ("Non-Holo"/"Non-Foil") forces the normal
 * family WITHOUT short-circuiting, so a 1st-edition stamp still applies
 * ("1st Edition Non-Holo" → 1st-edition Normal), then holo/foil, then normal.
 *
 * Synthesized printings carry `variantId: ""` — that's fine: `variantId` is a
 * TCGdex back-reference, not a price key (see the CardVariant doc at the top
 * of this file). `finishForPrinting` (valuation.ts) resolves these by
 * `type`/`stamp` alone.
 */
export function printingFromVariantText(text: string): CardVariant | null {
	const t = text.trim().toLowerCase();
	if (!t) return null;
	const base: CardVariant = {
		variantId: "",
		type: "",
		subtype: null,
		size: null,
		stamp: null,
	};
	if (t.includes("reverse")) return { ...base, type: "reverse" };
	// "Non-Foil"/"Non-Holo" negate the positive tokens they contain; a negation
	// is itself a recognized normal-family finish (Foil/Non-Foil column pairs).
	const negated = /non[-\s]?(holo|foil)/.test(t);
	const holo = !negated && (t.includes("holo") || t.includes("foil"));
	if (/\b1st\b/.test(t) || t.includes("first edition")) {
		return { ...base, type: holo ? "holo" : "normal", stamp: ["1st-edition"] };
	}
	if (holo) return { ...base, type: "holo" };
	if (negated || /\b(normal|regular|unlimited)\b/.test(t)) {
		return { ...base, type: "normal" };
	}
	return null;
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
