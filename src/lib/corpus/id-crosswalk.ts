import overrideTable from "./ptcg-image-overrides.json";
import table from "./set-crosswalk.json";

// CDN-verified pokemontcg.io large-image overrides keyed by TCGdex card id, for
// imageless cards whose constructed fallback URL would otherwise be wrong. The
// "_comment"/"_count" metadata keys are filtered out.
const IMAGE_OVERRIDES: Record<string, string> = Object.fromEntries(
	Object.entries(overrideTable as Record<string, unknown>).filter(
		([k, v]) => !k.startsWith("_") && typeof v === "string",
	) as [string, string][],
);

const PTCG_TO_TCGDEX: Record<string, string> = table;
const TCGDEX_TO_PTCG: Record<string, string> = Object.fromEntries(
	// Later entries win on collisions (e.g. swsh4.5 has two ptcg sources);
	// the explicit overrides below correct the cases where the wrong winner
	// would land (cel25c → "cel25" clobbers the cel25 → "cel25" entry).
	Object.entries(PTCG_TO_TCGDEX).map(([ptcg, tcgdex]) => [tcgdex, ptcg]),
);
// Explicit collision fixes: the naive inversion produces wrong winners for
// these TCGdex keys because multiple PTCG set ids map to the same TCGdex id.
//   swsh4.5 ← swsh45 and swsh45sv  →  keep swsh45 (the primary print run)
//   cel25   ← cel25 and cel25c     →  keep cel25  (cel25c is an alt-art subset)
TCGDEX_TO_PTCG["swsh4.5"] = "swsh45";
TCGDEX_TO_PTCG.cel25 = "cel25";

export function ptcgSetToTcgdex(setId: string): string {
	return PTCG_TO_TCGDEX[setId] ?? setId;
}

export function tcgdexSetToPtcg(setId: string): string {
	return TCGDEX_TO_PTCG[setId] ?? setId;
}

/** TCGdex id -> pokemontcg.io id. Easy direction: reverse setId, strip zero-pad. */
export function tcgdexCardToPtcg(id: string): string {
	// Split at the LAST dash: TCGdex set ids contain dashes (e.g. "tk-ex-latia"),
	// but localIds never do, so the final dash always separates set from localId.
	const dash = id.lastIndexOf("-");
	const setId = id.slice(0, dash);
	const localId = id.slice(dash + 1);
	const ptcgSet = tcgdexSetToPtcg(setId);
	// Strip leading zeros only for purely-numeric localIds; promos like "SWSH001"
	// and gallery ids like "TG01" keep their form (pokemontcg.io matches them).
	const ptcgNum = /^\d+$/.test(localId) ? String(Number(localId)) : localId;
	return `${ptcgSet}-${ptcgNum}`;
}

export function ptcgImageUrl(
	setId: string,
	number: string,
): { large: string; small: string } {
	const root = `https://images.pokemontcg.io/${setId}/${number}`;
	return { large: `${root}_hires.png`, small: `${root}.png` };
}

/**
 * pokemontcg.io set logo/symbol url for a TCGdex set that has none (53/41 sets:
 * McDonald's, trainer kits, jumbo, promos). Crosswalks the set id. The set-tile
 * onError degrades a dead url to the set-name text, so an occasional 404 is safe.
 */
export function ptcgSetImageUrl(
	tcgdexSetId: string,
	kind: "logo" | "symbol",
): string {
	return `https://images.pokemontcg.io/${tcgdexSetToPtcg(tcgdexSetId)}/${kind}.png`;
}

/**
 * pokemontcg.io fallback image for a TCGdex card that has NO TCGdex image.
 * Prefers a CDN-verified override; otherwise constructs the URL from the
 * crosswalked id (split at the LAST dash so dashed TCGdex set ids survive).
 * Single source of truth shared by the corpus build and the live detail mapper.
 * NOTE: the build HEAD-probes these and blanks dead ones; the live path can't,
 * so a dead fallback degrades to the holo-card onError blank (same as before).
 */
export function fallbackImageUrl(cardId: string): {
	large: string;
	small: string;
} {
	const override = IMAGE_OVERRIDES[cardId];
	if (override) {
		return { large: override, small: override.replace("_hires.png", ".png") };
	}
	const ptcgId = tcgdexCardToPtcg(cardId);
	const dash = ptcgId.lastIndexOf("-");
	return ptcgImageUrl(ptcgId.slice(0, dash), ptcgId.slice(dash + 1));
}
