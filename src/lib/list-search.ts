import type { ListSearch, Scope } from "./card-query";

const csv = (v: unknown): string[] => {
	if (Array.isArray(v)) return (v as string[]).filter(Boolean);
	if (typeof v !== "string" || !v) return [];
	// TanStack Router may serialize [] as the string "[]" — treat as empty.
	if (v === "[]" || v === "%5B%5D") return [];
	// JSON-serialized arrays (["fire","water"]) — try parse.
	if (v.startsWith("[")) {
		try {
			const parsed = JSON.parse(v);
			if (Array.isArray(parsed)) return (parsed as string[]).filter(Boolean);
		} catch {
			// fall through to CSV
		}
	}
	return v.split(",").filter(Boolean);
};

/** Shared validateSearch for any card-list route. */
export function validateListSearch(
	search: Record<string, unknown>,
): ListSearch {
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
export function listSearchToUrl(
	s: Partial<ListSearch>,
): Record<string, string | undefined> {
	const out: Record<string, string | undefined> = {};
	if (s.q !== undefined) out.q = s.q || undefined;
	for (const k of ["types", "rarity", "supertype", "subtypes"] as const) {
		if (s[k] !== undefined) out[k] = s[k]?.length ? s[k]?.join(",") : undefined;
	}
	if (s.scope !== undefined) out.scope = s.scope === "set" ? "set" : undefined;
	return out;
}
