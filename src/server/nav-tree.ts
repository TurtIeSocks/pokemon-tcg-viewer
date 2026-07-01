import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import {
	isSupportedLanguage,
	REGION_BASE_LANGUAGE,
	type Region,
	regionForLanguage,
} from "../lib/languages";
import { deriveNavTree, type NavTree } from "../lib/nav-tree";
import { fetchAllSets } from "./card-data-fetch";

// Server-only: holds a createServerFn handler. The pure nav-tree API
// (types + deriveNavTree/findSeries/findSet) lives in ../lib/nav-tree and is
// what client islands import. A server fn must never share a module the client
// imports, or the serverfn-split bundler duplicates the module and the RPC
// dispatcher can't find the handler ("Server function info not found").
//
// Re-exported here only for server-side / route convenience (loaders that want
// both getNavTreeFn and findSet from one import). Client code imports from lib.
export {
	deriveNavTree,
	findSeries,
	findSet,
	type NavSeries,
	type NavSet,
	type NavTree,
} from "../lib/nav-tree";

// Memoize across requests in one server process, per region. The sets list
// changes monthly; a process restart (deploy) picks up new sets. Avoids
// rebuilding the index per request. A Map (not a single slot) so the west
// catalog (pokemontcg.io-backed, en) and the asia catalog (TCGdex-only, ja)
// cache independently — loading one must not evict or block the other.
const cache = new Map<Region, Promise<NavTree>>();

/**
 * Memoized nav tree (server-only), one per region. Shared by getNavTreeFn and
 * the card-route resolver so a route loader that needs both reuses one fetch +
 * build with no cross-server-fn RPC hop. No Cache-Control here — that's a
 * getNavTreeFn concern.
 */
export function loadNavTree(region: Region = "west"): Promise<NavTree> {
	let promise = cache.get(region);
	if (!promise) {
		promise = fetchAllSets(REGION_BASE_LANGUAGE[region]).then(deriveNavTree);
		// Evict on failure so a transient error doesn't poison the region forever.
		promise.catch(() => cache.delete(region));
		cache.set(region, promise);
	}
	return promise;
}

/** Parse+normalize an optional `lang`/`region` input: absent/unsupported → "west". */
function parseRegionInput(input: unknown): Region {
	if (input == null) return "west";
	if (typeof input === "string")
		return isSupportedLanguage(input) ? regionForLanguage(input) : "west";
	const o = input as { lang?: unknown; region?: unknown };
	if (o.region === "west" || o.region === "asia") return o.region;
	if (typeof o.lang === "string" && isSupportedLanguage(o.lang))
		return regionForLanguage(o.lang);
	return "west";
}

export const getNavTreeFn = createServerFn({ method: "GET" })
	.inputValidator(parseRegionInput)
	.handler(async ({ data: region }): Promise<NavTree> => {
		// The root loader calls this on every page, so the header sets the cache
		// policy for the SSR document (and this RPC on client nav). Sets change
		// ~monthly: a short fresh window with long stale-while-revalidate lets the
		// CDN/browser cache aggressively without serving badly stale data.
		setResponseHeader(
			"Cache-Control",
			"public, max-age=60, stale-while-revalidate=86400",
		);
		return loadNavTree(region);
	});
