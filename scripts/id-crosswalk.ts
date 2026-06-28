import table from "./set-crosswalk.json";

const PTCG_TO_TCGDEX: Record<string, string> = table;
const TCGDEX_TO_PTCG: Record<string, string> = Object.fromEntries(
	// Later entries win on collisions (e.g. swsh4.5 has two ptcg sources);
	// acceptable — reverse map only feeds image fallback URL construction,
	// where any valid pokemontcg.io set id for the artwork works.
	Object.entries(PTCG_TO_TCGDEX).map(([ptcg, tcgdex]) => [tcgdex, ptcg]),
);

export function ptcgSetToTcgdex(setId: string): string {
	return PTCG_TO_TCGDEX[setId] ?? setId;
}

export function tcgdexSetToPtcg(setId: string): string {
	return TCGDEX_TO_PTCG[setId] ?? setId;
}

/** TCGdex id -> pokemontcg.io id. Easy direction: reverse setId, strip zero-pad. */
export function tcgdexCardToPtcg(id: string): string {
	const dash = id.indexOf("-");
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
