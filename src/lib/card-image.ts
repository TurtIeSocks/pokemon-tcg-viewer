import type { CorpusCard } from "@/store/corpus/corpus-types";

const CDN = "https://assets.tcgdex.net";

export interface CardImageUrls {
	imageUrl: string;
	imageUrlSmall: string;
}

/**
 * Resolve the high/low card image urls for a given language.
 *
 * The English base corpus bakes pokemontcg.io-or-TCGdex urls into
 * `imageUrl`/`imageUrlSmall`. For other Western languages we derive the
 * localized TCGdex urls from the language-invariant `imageBase` tail
 * ("{serie}/{set}/{localId}", e.g. "swsh/swsh3/136").
 *
 * Passes through the baked EN urls when:
 *  - `lang` is "en", or
 *  - the card has no `imageBase` (null/undefined) — no localized image exists.
 */
export function cardImage(card: CorpusCard, lang: string): CardImageUrls {
	if (lang === "en" || !card.imageBase) {
		return { imageUrl: card.imageUrl, imageUrlSmall: card.imageUrlSmall };
	}
	const base = `${CDN}/${lang}/${card.imageBase}`;
	return { imageUrl: `${base}/high.webp`, imageUrlSmall: `${base}/low.webp` };
}
