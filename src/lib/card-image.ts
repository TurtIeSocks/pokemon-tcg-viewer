import type { FocusCardData } from "../server/card-mappers";
import type { CorpusCard } from "../store/corpus/corpus-types";

const CDN = "https://assets.tcgdex.net";

export interface CardImageUrls {
	imageUrl: string;
	imageUrlSmall: string;
}

/**
 * The image-bearing fields cardImage needs. Structural so it accepts both a grid
 * `CorpusCard` and the detail `FocusCardData` (which carries no `imageUrlSmall`).
 */
export interface CardImageSource {
	imageBase?: string | null;
	imageUrl: string;
	imageUrlSmall?: string;
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
export function cardImage(card: CardImageSource, lang: string): CardImageUrls {
	if (lang === "en" || !card.imageBase) {
		return {
			imageUrl: card.imageUrl,
			imageUrlSmall: card.imageUrlSmall ?? card.imageUrl,
		};
	}
	const base = `${CDN}/${lang}/${card.imageBase}`;
	return { imageUrl: `${base}/high.webp`, imageUrlSmall: `${base}/low.webp` };
}

/**
 * Reconcile a live-fetched FocusCardData's IMAGE against the authoritative corpus
 * card. The live TCGdex fetch (mapTcgdexFocusCard) derives a pokemontcg.io fallback
 * for a card with no native scan; the corpus holds the real image — the tcgcsv JP
 * overlay fill, the ptcg hi-res for west, or a deliberate blank (suppressed Western
 * fallback). Preferring the corpus image makes the focus view match the grid on the
 * FIRST (SSR) frame, so a cold page load no longer flashes the wrong image before
 * the client corpus loads. Text fields (attacks/flavor) are untouched. No-op when
 * the corpus has no card for this id (its region isn't loaded server-side).
 */
export function withCorpusImage(
	card: FocusCardData,
	corpusCard: Pick<CorpusCard, "imageUrl" | "imageBase"> | undefined | null,
): FocusCardData {
	if (!corpusCard) return card;
	return {
		...card,
		imageUrl: corpusCard.imageUrl,
		imageBase: corpusCard.imageBase ?? null,
	};
}
