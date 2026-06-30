/**
 * Shared TCGdex card-field derivations, used by BOTH the corpus build
 * (`scripts/build-corpus.ts`) and the live detail mapper
 * (`src/server/card-mappers.ts`) so the grid and the detail view never drift.
 *
 * TCGdex's API field names differ from the pokemontcg.io-style shape the app
 * renders. Two derivations are non-trivial and were a repeated source of
 * "read the wrong field" bugs, so they live here once:
 *  - `category` ("Pokemon" | "Trainer" | "Energy") -> the app's accented supertype.
 *  - the app's `subtypes[]` is ASSEMBLED — TCGdex has no `subtypes` field; it
 *    splits the concept across `stage` / `trainerType` / `energyType` / `suffix`.
 */

export const CATEGORY_TO_SUPERTYPE: Record<string, string> = {
	Pokemon: "Pokémon",
	Trainer: "Trainer",
	Energy: "Energy",
};

/** App supertype ("Pokémon" / "Trainer" / "Energy") from a TCGdex `category`. */
export function supertypeFromCategory(category: string): string {
	return CATEGORY_TO_SUPERTYPE[category] ?? category;
}

/** The TCGdex fields the app's `subtypes[]` is assembled from. */
export interface TcgdexSubtypeFields {
	stage?: string;
	trainerType?: string;
	energyType?: string;
	suffix?: string;
}

/**
 * Assemble the app's `subtypes[]` from TCGdex's typed fields. TCGdex has no
 * `subtypes` field — it splits the concept across stage / trainerType /
 * energyType / suffix. Returns `undefined` when none are present (so the field
 * is omitted, matching the corpus's optional-field convention).
 */
export function subtypesFromTcgdex(
	card: TcgdexSubtypeFields,
): string[] | undefined {
	const out: string[] = [];
	if (card.stage) out.push(card.stage);
	if (card.trainerType) out.push(card.trainerType);
	if (card.energyType) out.push(card.energyType);
	if (card.suffix) out.push(card.suffix);
	return out.length ? out : undefined;
}
