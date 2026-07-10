import { compareRarity } from "../lib/rarity-order";
import { titleCaseSlug } from "../lib/slug";

/**
 * The subset of card fields facet derivation reads. Both the hydrated
 * `HoloCardData` (set pages) and the raw in-memory `CorpusCard` (the dev
 * all-cards grid) satisfy it, so either can be faceted without a cast.
 */
export interface FacetCard {
	name: string;
	supertype?: string;
	subtypes?: string[];
	rarity?: string;
	types?: string[];
	nationalPokedexNumbers?: number[];
}

/**
 * One option of the card ("name") filter. Pokémon are keyed by their national
 * dex number (as a string) so every printing of a species collapses to one
 * consistent option; Trainers/Energy have no dex, so they key by card name.
 * `label` is the display text (species name, or the card name); `group` is the
 * card's supertype, used to group the options (Pokémon / Trainer / Energy).
 */
export interface IdFacet {
	id: string;
	label: string;
	group: string;
}

export interface SetFacets {
	supertypes: string[];
	subtypes: string[];
	rarities: string[];
	types: string[];
	ids: IdFacet[];
}

const sortedDistinct = (vals: (string | undefined)[]): string[] =>
	[...new Set(vals.filter((v): v is string => !!v))].sort((a, b) =>
		a.localeCompare(b),
	);

/** Distinct rarities present, ordered by actual rarity level (not alphabetically). */
const raritiesByLevel = (vals: (string | undefined)[]): string[] =>
	[...new Set(vals.filter((v): v is string => !!v))].sort(compareRarity);

/**
 * Distinct filterable card identities present in the cards, alphabetized by
 * label. A card with dex numbers contributes one id per species (keyed by dex,
 * labelled via the resolver → `#<dex>` fallback); a card without (Trainer,
 * Energy) contributes one id keyed + labelled by its name. Each option carries
 * its `group` (supertype). First writer wins a given id's label + group.
 */
function deriveIds(
	cards: FacetCard[],
	dexName?: (dex: number) => string | null | undefined,
): IdFacet[] {
	const byId = new Map<string, IdFacet>();
	for (const c of cards) {
		const group = c.supertype || "Other";
		if (c.nationalPokedexNumbers?.length) {
			for (const dex of c.nationalPokedexNumbers) {
				const id = String(dex);
				if (byId.has(id)) continue;
				const resolved = dexName?.(dex);
				byId.set(id, {
					id,
					label: resolved ? titleCaseSlug(resolved) : c.name || `#${dex}`,
					group,
				});
			}
		} else if (c.name && !byId.has(c.name)) {
			byId.set(c.name, { id: c.name, label: c.name, group });
		}
	}
	return [...byId.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/** Distinct, sorted filter options that actually occur in the given cards. */
export function deriveFacets(
	cards: FacetCard[],
	dexName?: (dex: number) => string | null | undefined,
): SetFacets {
	return {
		supertypes: sortedDistinct(cards.map((c) => c.supertype)),
		subtypes: sortedDistinct(cards.flatMap((c) => c.subtypes ?? [])),
		rarities: raritiesByLevel(cards.map((c) => c.rarity)),
		types: sortedDistinct(cards.flatMap((c) => c.types ?? [])),
		ids: deriveIds(cards, dexName),
	};
}
