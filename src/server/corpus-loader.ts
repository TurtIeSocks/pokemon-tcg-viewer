import { gunzipSync } from "node:zlib";
import type { HoloCardData } from "../components/holo-card";
import type { CardRouteParams } from "../lib/card-route";
import { REGION_BASE_LANGUAGE, type Region } from "../lib/languages";
import { buildSlugIndex, type SlugIndex } from "../lib/slug";
import {
	buildIndex,
	type CorpusIndex,
	type CorpusQuery,
	queryCorpus,
} from "../store/corpus/corpus-engine";
import type { CorpusCard } from "../store/corpus/corpus-types";
import {
	apiBase,
	getAllSetsCached,
	resetAllSetsCacheForTests,
} from "./card-data-fetch";
import type { PokemonSet } from "./card-mappers";

// SERVER-ONLY corpus loader. Imports node:zlib, so it must never reach the
// client bundle. The createServerFn wrappers in ./corpus-server import
// queryCorpusServer *dynamically* (inside their handlers), so this module — and
// node:zlib — stays out of the client module graph even in dev, where Vite does
// not tree-shake the unused server code the way the production build does. A
// plain top-level import here would ship node:zlib to the browser and throw
// ("Module node:zlib has been externalized"). Other server-only modules
// (card-resolve) may import this statically.

/** Gunzip + parse a gzipped CorpusCard[] blob (server-side; node:zlib). */
export function decodeCorpusGz(gz: ArrayBuffer): CorpusCard[] {
	const text = gunzipSync(Buffer.from(gz)).toString("utf8");
	return JSON.parse(text) as CorpusCard[];
}

interface ServerCorpus {
	index: CorpusIndex;
	setsById: Map<string, PokemonSet>;
}

/** Corpus blob URL for a region. West keeps the original unsuffixed path. */
function corpusUrl(region: Region): string {
	return region === "asia"
		? `${apiBase()}/corpus-region/asia`
		: `${apiBase()}/corpus`;
}

// Memoize ONE index PER REGION, revalidated in the background after a TTL —
// a stale hit is served immediately (stale-while-revalidate) while a
// conditional GET (If-None-Match against the worker's ETag) checks R2; a 304
// keeps the index, a 200 swaps in a freshly built one. So a corpus rebuild
// reaches a long-lived server process within one TTL, no deploy needed.
// Mirrors the loadNavTree TTL pattern (and the client-side per-region
// in-flight map in store/corpus/corpus-runtime.ts).
interface CacheEntry {
	promise: Promise<ServerCorpus>;
	etag: string | null;
	fetchedAt: number;
	revalidating: boolean;
}
const cached = new Map<Region, CacheEntry>();

/** How long a fetched corpus is trusted before a background ETag revalidation. */
export const SERVER_CORPUS_TTL_MS = 15 * 60 * 1000;

/**
 * Test-only: drop all memoized corpora so each test starts cold. Also clears
 * the set-catalog memo underneath, for the same reason resetNavTreeForTests
 * does: a leftover catalog would satisfy this test's fetch assertions.
 */
export function resetServerCorpusForTests(): void {
	cached.clear();
	resetAllSetsCacheForTests();
}

async function loadServerCorpus(
	region: Region,
): Promise<{ corpus: ServerCorpus; etag: string | null }> {
	// The set tree MUST match the corpus region: an asia corpus (JP-lineage set
	// ids like SV1a) paired with the west/en set list would resolve no sets, so
	// every asia card would lose its setName/series/releaseDate and get dropped
	// by the year filter. Mirror nav-tree.ts, which fetches per region base lang.
	const [gzRes, sets] = await Promise.all([
		fetch(corpusUrl(region)),
		getAllSetsCached(REGION_BASE_LANGUAGE[region]),
	]);
	if (!gzRes.ok)
		throw new Error(`${corpusUrl(region)} fetch failed: ${gzRes.status}`);
	const gz = await gzRes.arrayBuffer();
	const cards = decodeCorpusGz(gz);
	return {
		corpus: {
			index: buildIndex(cards, region),
			setsById: new Map(sets.map((s) => [s.id, s])),
		},
		etag: gzRes.headers.get("etag"),
	};
}

/**
 * Background refetch after the TTL. 304 → keep the index; 200 → build and swap
 * in the new corpus; any failure → keep serving the old one. Success or
 * failure, the TTL is re-armed so a broken upstream is probed at most once per
 * window, never per request.
 */
async function revalidateServerCorpus(
	region: Region,
	entry: CacheEntry,
): Promise<void> {
	try {
		const res = await fetch(
			corpusUrl(region),
			entry.etag ? { headers: { "If-None-Match": entry.etag } } : undefined,
		);
		if (res.status !== 304 && res.ok) {
			const [gz, sets] = await Promise.all([
				res.arrayBuffer(),
				getAllSetsCached(REGION_BASE_LANGUAGE[region]),
			]);
			const corpus: ServerCorpus = {
				index: buildIndex(decodeCorpusGz(gz), region),
				setsById: new Map(sets.map((s) => [s.id, s])),
			};
			entry.promise = Promise.resolve(corpus);
			entry.etag = res.headers.get("etag");
		}
	} catch {
		// Keep serving the old corpus; the next window retries.
	} finally {
		entry.fetchedAt = Date.now();
		entry.revalidating = false;
	}
}

function getServerCorpus(region: Region): Promise<ServerCorpus> {
	const entry = cached.get(region);
	if (!entry) {
		const e = {
			etag: null,
			fetchedAt: Date.now(),
			revalidating: false,
		} as CacheEntry;
		e.promise = loadServerCorpus(region)
			.then(({ corpus, etag }) => {
				e.etag = etag;
				e.fetchedAt = Date.now();
				return corpus;
			})
			.catch((err) => {
				cached.delete(region); // allow retry on next request after a transient failure
				throw err;
			});
		cached.set(region, e);
		return e.promise;
	}
	if (
		Date.now() - entry.fetchedAt > SERVER_CORPUS_TTL_MS &&
		!entry.revalidating
	) {
		entry.revalidating = true;
		void revalidateServerCorpus(region, entry);
	}
	return entry.promise;
}

/**
 * Query the server-side corpus for one region (default `west`, so existing
 * callers that don't pass a region are byte-compatible). Returns the full
 * sorted match list. Server-only (see the file header) — route loaders reach
 * it through the createServerFn wrappers in ./corpus-server, never by
 * importing this directly.
 */
export async function queryCorpusServer(
	q: CorpusQuery,
	region: Region = "west",
): Promise<HoloCardData[]> {
	const { index, setsById } = await getServerCorpus(region);
	return queryCorpus(index, q, setsById);
}

// Memoize the full slug index per corpus INSTANCE (WeakMap), so a TTL swap of
// the corpus atomically invalidates it and the old index is GC'd with the old
// corpus. Built from the SAME (sets, cards) inputs as the client's
// slugIndexFor, so the slugs are byte-identical to the client links + the
// $card route's resolution.
const slugIndexes = new WeakMap<ServerCorpus, SlugIndex>();

async function getServerSlugIndex(region: Region): Promise<SlugIndex> {
	const corpus = await getServerCorpus(region);
	let idx = slugIndexes.get(corpus);
	if (!idx) {
		idx = buildSlugIndex([...corpus.setsById.values()], corpus.index.cards);
		slugIndexes.set(corpus, idx);
	}
	return idx;
}

/**
 * Resolve the canonical `/$series/$set/$card` route params for a set of cards,
 * server-side, from the region's full slug index. Cards whose set/id aren't in
 * the index are omitted. Server-only; used by the pokemon-page loader so its
 * card links are correct in the FIRST SSR paint. Previously those links were
 * resolved client-side and returned null until the client corpus finished
 * loading, leaving early clicks dead-linked to the same route.
 */
export async function resolveCardRoutes(
	cards: { id: string; setId: string }[],
	region: Region = "west",
): Promise<Record<string, CardRouteParams>> {
	const idx = await getServerSlugIndex(region);
	const out: Record<string, CardRouteParams> = {};
	for (const c of cards) {
		const loc = idx.setSlugById.get(c.setId);
		const cardSlug = idx.cardSlugById.get(c.id);
		if (loc && cardSlug)
			out[c.id] = { series: loc.seriesSlug, set: loc.setSlug, card: cardSlug };
	}
	return out;
}

/**
 * The raw corpus card for one id in a region, or undefined if absent. Used by the
 * card-detail route to reconcile the live-fetched image against the authoritative
 * corpus image (see `withCorpusImage`), so SSR emits the corpus image directly.
 */
export async function getServerCorpusCard(
	cardId: string,
	region: Region = "west",
): Promise<CorpusCard | undefined> {
	const { index } = await getServerCorpus(region);
	return index.byId.get(cardId);
}
