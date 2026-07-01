import {
	fallbackImageUrl,
	tcgdexCardToPtcg,
} from "../src/lib/corpus/id-crosswalk";
import type { CorpusCard } from "../src/store/corpus/corpus-types";
import { normalizeTcgdexRarity } from "./normalize-rarity";
import type { PtcgOverlay } from "./ptcg-overlay";

/**
 * Overlay pokemontcg.io's richer metadata onto the TCGdex base corpus.
 * Per card: crosswalk the id; if the ptcg record exists, overlay its rarity
 * (foil-table vocab) + subtypes (multi-tag), and prefer its hires/lowres images
 * for the English base. `imageBase` is kept so non-EN images still derive the
 * TCGdex localized art. An empty overlay (a failed ptcg crawl) returns the cards
 * unchanged — a flaky upstream must never blank the data.
 *
 * For cards that have NO ptcg match (crosswalk miss), `suffixById` supplies the
 * TCGdex mechanic suffix (e.g. "GX", "VMAX") so that coarse rarities like
 * "Ultra Rare" can be promoted to the correct foil-table vocab.
 */
export function mergePtcgOverlay(
	cards: CorpusCard[],
	overlay: PtcgOverlay,
	suffixById: Map<string, string> = new Map(),
): { merged: CorpusCard[]; hits: number } {
	if (overlay.size === 0) return { merged: cards, hits: 0 };
	let hits = 0;
	const merged = cards.map((card) => {
		const ov = overlay.get(tcgdexCardToPtcg(card.id));
		if (!ov) {
			const fixed = normalizeTcgdexRarity(card.rarity, suffixById.get(card.id));
			return fixed === card.rarity ? card : { ...card, rarity: fixed };
		}
		hits++;
		const { large, small } = fallbackImageUrl(card.id);
		return {
			...card,
			rarity: ov.rarity ?? card.rarity,
			subtypes: ov.subtypes?.length ? ov.subtypes : card.subtypes,
			imageUrl: large,
			imageUrlSmall: small,
		};
	});
	return { merged, hits };
}
