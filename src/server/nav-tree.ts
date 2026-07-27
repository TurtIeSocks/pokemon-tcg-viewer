import { createServerFn } from "@tanstack/react-start";
import { getCookies, setResponseHeader } from "@tanstack/react-start/server";
import {
	isSupportedLanguage,
	REGION_BASE_LANGUAGE,
	type Region,
	regionForLanguage,
} from "../lib/languages";
import { LANG_COOKIE } from "../lib/loader-region";
import { deriveNavTree, type NavSet, type NavTree } from "../lib/nav-tree";
import { getAllSetsCached, resetAllSetsCacheForTests } from "./card-data-fetch";

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

// Memoize across requests in one server process, per region, refreshed in the
// background after a TTL — a stale hit serves the old tree immediately while a
// refetch swaps in the new one, so upstream set-list changes reach a long-lived
// process within one TTL, no deploy needed. Same TTL as the server corpus
// (SERVER_CORPUS_TTL_MS) so nav and corpus drift apart by at most one window.
// A Map (not a single slot) so the west catalog (en) and the asia catalog (ja)
// cache independently — loading one must not evict or block the other.
interface NavCacheEntry {
	promise: Promise<NavTree>;
	fetchedAt: number;
	refreshing: boolean;
}
const cache = new Map<Region, NavCacheEntry>();

/** How long a fetched nav tree is trusted before a background refresh. */
export const NAV_TREE_TTL_MS = 15 * 60 * 1000;

/**
 * Test-only: drop the memoized trees so each test starts cold. Also clears the
 * set-catalog memo underneath — "cold" has to mean cold all the way down, or a
 * prior test's cached catalog silently satisfies this one's fetch assertions.
 */
export function resetNavTreeForTests(): void {
	cache.clear();
	resetAllSetsCacheForTests();
}

/**
 * Memoized nav tree (server-only), one per region. Shared by getNavTreeFn and
 * the card-route resolver so a route loader that needs both reuses one fetch +
 * build with no cross-server-fn RPC hop. No Cache-Control here — that's a
 * getNavTreeFn concern.
 */
export function loadNavTree(region: Region = "west"): Promise<NavTree> {
	const entry = cache.get(region);
	if (!entry) {
		const e = { fetchedAt: Date.now(), refreshing: false } as NavCacheEntry;
		e.promise = getAllSetsCached(REGION_BASE_LANGUAGE[region]).then(
			deriveNavTree,
		);
		// Evict on failure so a transient error doesn't poison the region forever.
		e.promise.catch(() => cache.delete(region));
		cache.set(region, e);
		return e.promise;
	}
	if (Date.now() - entry.fetchedAt > NAV_TREE_TTL_MS && !entry.refreshing) {
		entry.refreshing = true;
		getAllSetsCached(REGION_BASE_LANGUAGE[region])
			.then(deriveNavTree)
			.then((tree) => {
				entry.promise = Promise.resolve(tree);
			})
			.catch(() => {
				// Keep serving the old tree; the next window retries.
			})
			.finally(() => {
				entry.fetchedAt = Date.now();
				entry.refreshing = false;
			});
	}
	return entry.promise;
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

/** The other catalog region — the fallback resolveSetRegion tries on a miss. */
const OTHER_REGION: Record<Region, Region> = { west: "asia", asia: "west" };

/**
 * Resolve which region's nav tree contains a set, trying `preferred` first and
 * only falling back to the other region on a MISS. A set's region is intrinsic
 * and set slugs are globally unique across regions, so a set found in either
 * region is unambiguously THE set. This is the crash safety net: an Asian viewer
 * who refreshes an asia set page sends no `?lang` and has no client store on the
 * SSR pass, so `loaderRegion` can only guess the region — without this fallback a
 * wrong guess `throw notFound()`s a set that plainly exists.
 *
 * Pure + lazy: all tree loading is delegated to the injected `lookup`, and the
 * non-preferred region's `lookup` is only invoked when the preferred region
 * misses — so a west viewer browsing west sets never loads the asia tree.
 * Returns the found `{ region, set }`, or `null` when the set is in neither.
 */
export async function resolveSetRegion(
	preferred: Region,
	lookup: (region: Region) => NavSet | undefined | Promise<NavSet | undefined>,
): Promise<{ region: Region; set: NavSet } | null> {
	const hit = await lookup(preferred);
	if (hit) return { region: preferred, set: hit };
	const other = OTHER_REGION[preferred];
	const fallback = await lookup(other);
	if (fallback) return { region: other, set: fallback };
	return null;
}

/**
 * The preferred catalog region for a cold SSR load, read from the locale cookie
 * the client persists on every language change (see `writeLangCookie`). Absent
 * or unsupported cookie → "west". Server-only (reads the incoming request's
 * `Cookie` header via TanStack Start's ambient request context — same plumbing as
 * getSidebarStateFn / the supabase server client); the split client stub is a
 * cheap fetch, and the set loader only calls it on the SSR branch, so it never
 * becomes a per-navigation RPC. Recovers the region that
 * `profile.displayLanguage` (client IndexedDB, invisible to SSR) would have
 * picked, so an Asian viewer's refresh resolves the asia catalog without an
 * english flash — the resolveSetRegion fallback then guarantees correctness even
 * if the cookie is stale or missing.
 */
export const getPreferredRegionFn = createServerFn({ method: "GET" }).handler(
	(): Region => {
		const lang = getCookies()[LANG_COOKIE];
		return lang && isSupportedLanguage(lang) ? regionForLanguage(lang) : "west";
	},
);
