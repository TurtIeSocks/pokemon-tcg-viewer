// Cache freshness policy for the persisted API caches (sets list + Pokémon list).
//
// This is the single chokepoint that decides whether we trust localStorage data
// or fetch from the network on app load. Tweaking this function changes the
// app's startup latency and how quickly users see new data.
//
// Trade-offs to consider:
//
//   • Long TTL (e.g. 24h+) → fast cold starts, low API load, but new sets /
//     Pokémon won't appear until the cache expires.
//
//   • Short TTL (e.g. 1h)  → fresher data, more API hits, brief network wait
//     on every visit if you let the loader block on it.
//
//   • No expiry            → cached forever (until user clears storage). Best
//     for the Pokédex list (the 1025-entry list is essentially static) but
//     risky for the sets list (new sets release every ~3 months).
//
//   • Stale-while-revalidate → return cached immediately AND fire a background
//     refetch. Implemented separately in the loaders; this function only
//     decides "is this stale enough to warrant the refetch?"
//
// Note: each cache type can have its own policy. The Pokémon list and sets
// list change at very different cadences.

export interface FreshnessInput {
	/** ms since epoch when the cache entry was last fetched, or null if never. */
	lastFetchedAt: number | null;
	/** Which cache is being checked. Lets you pick a different TTL per kind. */
	kind: "sets" | "pokemonList";
}

const DAY_MS = 24 * 60 * 60 * 1000;

// New sets release ~quarterly, so a week between revalidations is plenty.
const SETS_TTL_MS = 7 * DAY_MS;

// The Pokédex list past #1025 hasn't grown in years; revalidate monthly.
const POKEMON_LIST_TTL_MS = 30 * DAY_MS;

/**
 * Return `true` if the cached data should be re-fetched from the network.
 *
 * Stale-while-revalidate: when this returns `true` but the store already has
 * cached data, the UI keeps showing the cached data while the loader refetches
 * in the background. The cache is only "blocking" on the very first load,
 * when there's nothing to show yet.
 */
export function shouldRefetch({
	lastFetchedAt,
	kind,
}: FreshnessInput): boolean {
	if (lastFetchedAt === null) return true;
	const age = Date.now() - lastFetchedAt;
	const ttl = kind === "sets" ? SETS_TTL_MS : POKEMON_LIST_TTL_MS;
	return age > ttl;
}
