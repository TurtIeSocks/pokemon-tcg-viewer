import type { FocusCardData } from "../server/card-mappers";

export interface PriceLine {
	source: "TCGPlayer" | "Cardmarket";
	url: string;
	priceLabel: string;
	updatedAt: string;
}

/** Returns price lines for the card. Always empty until pricing data is re-added (spec D3). */
export function buildPriceLines(_card: FocusCardData): PriceLine[] {
	return [];
}
