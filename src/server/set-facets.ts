import type { HoloCardData } from "../components/holo-card";

export interface SetFacets {
	supertypes: string[];
	subtypes: string[];
	rarities: string[];
	types: string[];
}

const sortedDistinct = (vals: (string | undefined)[]): string[] =>
	[...new Set(vals.filter((v): v is string => !!v))].sort((a, b) =>
		a.localeCompare(b),
	);

/** Distinct, sorted filter options that actually occur in the given cards. */
export function deriveFacets(cards: HoloCardData[]): SetFacets {
	return {
		supertypes: sortedDistinct(cards.map((c) => c.supertype)),
		subtypes: sortedDistinct(cards.flatMap((c) => c.subtypes ?? [])),
		rarities: sortedDistinct(cards.map((c) => c.rarity)),
		types: sortedDistinct(cards.flatMap((c) => c.types ?? [])),
	};
}
