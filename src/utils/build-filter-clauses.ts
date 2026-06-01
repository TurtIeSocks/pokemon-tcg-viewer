import type { SetFacets } from "@/server/set-facets";

/**
 * Filter values per dimension. All optional. Empty/missing arrays are
 * treated as "no filter for this dimension".
 */

export type FilterClauses = Partial<SetFacets>;

/**
 * Compose pokemontcg.io query clauses from a filter object. Returns a
 * string ready to be appended to a primary query. Empty input → "".
 *
 * Within a dimension values OR; across dimensions AND. Rarity values
 * contain spaces and must be double-quoted; the other dimensions are
 * single tokens and don't need quoting.
 *
 * Example:
 *   buildFilterClauses({ types: ["fire", "water"], rarity: ["Rare Holo"] })
 *   →  ' AND (types:fire OR types:water) AND (rarity:"Rare Holo")'
 */
export function buildFilterClauses(filters: FilterClauses): string {
	const clauses: string[] = [];
	if (filters.types?.length) {
		clauses.push(`(${filters.types.map((t) => `types:${t}`).join(" OR ")})`);
	}
	if (filters.rarities?.length) {
		clauses.push(
			`(${filters.rarities.map((r) => `rarity:"${r}"`).join(" OR ")})`,
		);
	}
	if (filters.supertypes?.length) {
		clauses.push(
			`(${filters.supertypes.map((s) => `supertype:${s}`).join(" OR ")})`,
		);
	}
	if (filters.subtypes?.length) {
		clauses.push(
			`(${filters.subtypes.map((s) => `subtypes:${s}`).join(" OR ")})`,
		);
	}
	return clauses.length === 0 ? "" : ` AND ${clauses.join(" AND ")}`;
}
