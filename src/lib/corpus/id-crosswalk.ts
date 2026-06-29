import table from "./set-crosswalk.json";

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
