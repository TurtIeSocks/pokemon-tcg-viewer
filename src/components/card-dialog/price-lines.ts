import type { FocusCardData } from "../../api";

export interface PriceLine {
	source: "TCGPlayer" | "Cardmarket";
	url: string;
	priceLabel: string;
	updatedAt: string;
}

export function buildPriceLines(card: FocusCardData): PriceLine[] {
	const lines: PriceLine[] = [];
	if (card.tcgplayer?.prices && card.tcgplayer.url) {
		const variantKeys = Object.keys(card.tcgplayer.prices);
		const firstVariant = variantKeys[0];
		const prices = firstVariant
			? card.tcgplayer.prices[firstVariant]
			: undefined;
		const value = prices?.market ?? prices?.mid;
		if (value !== undefined) {
			lines.push({
				source: "TCGPlayer",
				url: card.tcgplayer.url,
				priceLabel: `$${value.toFixed(2)} market`,
				updatedAt: card.tcgplayer.updatedAt,
			});
		}
	}
	if (card.cardmarket?.prices && card.cardmarket.url) {
		const value =
			card.cardmarket.prices.averageSellPrice ??
			card.cardmarket.prices.trendPrice ??
			card.cardmarket.prices.avg30;
		if (value !== undefined) {
			lines.push({
				source: "Cardmarket",
				url: card.cardmarket.url,
				priceLabel: `€${value.toFixed(2)} avg`,
				updatedAt: card.cardmarket.updatedAt,
			});
		}
	}
	return lines;
}
