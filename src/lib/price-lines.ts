import { formatPrice } from "@/store/userland/money";
import type { FocusCardData } from "../server/card-mappers";
import type { CardPriceEntry, FinishCode } from "./corpus/price-types";

export interface PriceLine {
	source: "TCGplayer" | "Cardmarket";
	/** Printing label for tcgplayer lines; null for cardmarket (no finish axis). */
	finish: string | null;
	/** Native-currency formatted price (tcgplayer USD, cardmarket EUR). */
	priceLabel: string;
	/** Deep link back to the source: a direct product page when the id is known,
	 * else a search result. */
	url: string;
	/** Source data date (YYYY-MM-DD); null when unknown. */
	updatedAt: string | null;
}

export interface PriceLinesMeta {
	tpDate: string | null;
	cmDate: string | null;
}

/** Stable render order + human label for each tcgplayer finish. */
const FINISH_ORDER: FinishCode[] = ["N", "H", "R", "1H", "1N"];
const FINISH_LABEL: Record<FinishCode, string> = {
	N: "Normal",
	H: "Holofoil",
	R: "Reverse Holofoil",
	"1H": "1st Ed. Holofoil",
	"1N": "1st Ed. Normal",
};

function tpSearchUrl(card: FocusCardData): string {
	const q = encodeURIComponent(`${card.name} ${card.cardNumber}`);
	return `https://www.tcgplayer.com/search/pokemon/product?q=${q}`;
}

/**
 * Direct tcgplayer product page. The slug segment is optional — tcgplayer
 * canonicalizes from the id alone — so `/product/{id}` is enough. Used when the
 * blob carries the product id; otherwise we fall back to {@link tpSearchUrl}.
 */
function tpProductUrl(tpId: number): string {
	return `https://www.tcgplayer.com/product/${tpId}`;
}

function cmSearchUrl(card: FocusCardData): string {
	const q = encodeURIComponent(card.name);
	return `https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=${q}`;
}

/**
 * Build the per-source price lines for a card from its blob entry. Pure: takes
 * the already-selected entry + source dates, so it is trivially testable and
 * holds no store dependency. tcgplayer lines (USD, per finish) come first in a
 * fixed finish order; the cardmarket line (EUR trend) comes last. A finish with
 * a null market price, or a cardmarket entry with a null trend, is skipped.
 */
export function buildPriceLines(
	card: FocusCardData,
	entry: CardPriceEntry | null,
	meta: PriceLinesMeta,
): PriceLine[] {
	if (!entry) return [];
	const lines: PriceLine[] = [];

	if (entry.tp) {
		// Direct product link when the blob carries the tcgplayer id; else search.
		const tpUrl =
			entry.tpId != null ? tpProductUrl(entry.tpId) : tpSearchUrl(card);
		for (const code of FINISH_ORDER) {
			const pair = entry.tp[code];
			if (!pair) continue;
			const [market] = pair;
			if (market === null) continue;
			lines.push({
				source: "TCGplayer",
				finish: FINISH_LABEL[code],
				priceLabel: formatPrice(market, "USD"),
				url: tpUrl,
				updatedAt: meta.tpDate,
			});
		}
	}

	if (entry.cm) {
		const trend = entry.cm[0];
		if (trend !== null) {
			lines.push({
				source: "Cardmarket",
				finish: null,
				priceLabel: formatPrice(trend, "EUR"),
				url: cmSearchUrl(card),
				updatedAt: meta.cmDate,
			});
		}
	}

	return lines;
}
