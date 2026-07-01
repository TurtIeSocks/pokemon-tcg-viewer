import { ptcgSetToTcgdex } from "../../lib/corpus/id-crosswalk";

export type CardLookup = (
	tcgdexSetId: string,
	numericLocalId: number,
) => string | null;

export function remapPtcgSetId(ptcgSetId: string): string {
	return ptcgSetToTcgdex(ptcgSetId);
}

/** ptcg card id -> tcgdex card id, resolved against the corpus by numeric localId. */
export function remapPtcgCardId(ptcgId: string, lookup: CardLookup): string {
	const dash = ptcgId.indexOf("-");
	if (dash < 0) return ptcgId;
	const tcgdexSet = ptcgSetToTcgdex(ptcgId.slice(0, dash));
	const localId = ptcgId.slice(dash + 1);
	if (!/^\d+$/.test(localId)) {
		// promo/gallery localId (e.g. "TG01", "SV-P"): TCGdex keeps the same
		// string under the folded set — no corpus lookup needed.
		return `${tcgdexSet}-${localId}`;
	}
	return lookup(tcgdexSet, Number(localId)) ?? ptcgId;
}
