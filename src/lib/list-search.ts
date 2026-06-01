import type { ListSearch, Scope } from "./card-query";

const csv = (v: unknown): string[] =>
	typeof v === "string" && v ? v.split(",").filter(Boolean) : Array.isArray(v) ? (v as string[]) : [];

/** Shared validateSearch for any card-list route. */
export function validateListSearch(search: Record<string, unknown>): ListSearch {
	const scope: Scope = search.scope === "set" ? "set" : "all";
	return {
		q: typeof search.q === "string" ? search.q : "",
		types: csv(search.types),
		rarity: csv(search.rarity),
		supertype: csv(search.supertype),
		subtypes: csv(search.subtypes),
		scope,
	};
}

/** Serialize a ListSearch patch's array fields back to CSV for the URL. */
export function listSearchToUrl(s: Partial<ListSearch>): Record<string, string | undefined> {
	const out: Record<string, string | undefined> = {};
	if (s.q !== undefined) out.q = s.q || undefined;
	for (const k of ["types", "rarity", "supertype", "subtypes"] as const) {
		if (s[k] !== undefined) out[k] = s[k]?.length ? s[k]!.join(",") : undefined;
	}
	if (s.scope !== undefined) out.scope = s.scope === "set" ? "set" : undefined;
	return out;
}
