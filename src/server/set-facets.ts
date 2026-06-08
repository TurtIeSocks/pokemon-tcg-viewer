import type { HoloCardData } from "../components/holo-card";
import { titleCaseSlug } from "../lib/slug";

export interface PokemonFacet {
	dex: number;
	name: string;
}

export interface SetFacets {
	supertypes: string[];
	subtypes: string[];
	rarities: string[];
	types: string[];
	pokemon: PokemonFacet[];
}

const sortedDistinct = (vals: (string | undefined)[]): string[] =>
	[...new Set(vals.filter((v): v is string => !!v))].sort((a, b) =>
		a.localeCompare(b),
	);

/**
 * Distinct species (by national dex number) present in the cards, alphabetized
 * by display label. Cards without a dex number (Trainers, Energy) contribute
 * nothing; a multi-dex card (Tag Team) contributes one option per species.
 * Labels come from the optional resolver; absent → a `#<dex>` fallback.
 */
function derivePokemon(
	cards: HoloCardData[],
	dexName?: (dex: number) => string | null | undefined,
): PokemonFacet[] {
	const dexes = [
		...new Set(cards.flatMap((c) => c.nationalPokedexNumbers ?? [])),
	];
	return dexes
		.map((dex) => {
			const resolved = dexName?.(dex);
			return { dex, name: resolved ? titleCaseSlug(resolved) : `#${dex}` };
		})
		.sort((a, b) => a.name.localeCompare(b.name));
}

/** Distinct, sorted filter options that actually occur in the given cards. */
export function deriveFacets(
	cards: HoloCardData[],
	dexName?: (dex: number) => string | null | undefined,
): SetFacets {
	return {
		supertypes: sortedDistinct(cards.map((c) => c.supertype)),
		subtypes: sortedDistinct(cards.flatMap((c) => c.subtypes ?? [])),
		rarities: sortedDistinct(cards.map((c) => c.rarity)),
		types: sortedDistinct(cards.flatMap((c) => c.types ?? [])),
		pokemon: derivePokemon(cards, dexName),
	};
}
