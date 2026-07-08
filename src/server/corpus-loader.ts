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
import { apiBase, fetchAllSets } from "./card-data-fetch";
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

// Memoize ONE index PER REGION for the process lifetime — a deploy restart
// picks up a fresh corpus. Mirrors the getNavTreeFn memoization pattern (and
// the client-side per-region in-flight map in store/corpus/corpus-runtime.ts).
const cached = new Map<Region, Promise<ServerCorpus>>();

async function loadServerCorpus(region: Region): Promise<ServerCorpus> {
	// The set tree MUST match the corpus region: an asia corpus (JP-lineage set
	// ids like SV1a) paired with the west/en set list would resolve no sets, so
	// every asia card would lose its setName/series/releaseDate and get dropped
	// by the year filter. Mirror nav-tree.ts, which fetches per region base lang.
	const [gzRes, sets] = await Promise.all([
		fetch(corpusUrl(region)),
		fetchAllSets(REGION_BASE_LANGUAGE[region]),
	]);
	if (!gzRes.ok)
		throw new Error(`${corpusUrl(region)} fetch failed: ${gzRes.status}`);
	const gz = await gzRes.arrayBuffer();
	const cards = decodeCorpusGz(gz);
	return {
		index: buildIndex(cards, region),
		setsById: new Map(sets.map((s) => [s.id, s])),
	};
}

function getServerCorpus(region: Region): Promise<ServerCorpus> {
	let entry = cached.get(region);
	if (!entry) {
		entry = loadServerCorpus(region).catch((e) => {
			cached.delete(region); // allow retry on next request after a transient failure
			throw e;
		});
		cached.set(region, entry);
	}
	return entry;
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

// Memoize the full slug index per region alongside the corpus (same lifetime).
// Built from the SAME (sets, cards) inputs as the client's slugIndexFor, so the
// slugs are byte-identical to the client links + the $card route's resolution.
const slugIndexCache = new Map<Region, Promise<SlugIndex>>();

function getServerSlugIndex(region: Region): Promise<SlugIndex> {
	let entry = slugIndexCache.get(region);
	if (!entry) {
		entry = getServerCorpus(region)
			.then(({ index, setsById }) =>
				buildSlugIndex([...setsById.values()], index.cards),
			)
			.catch((e) => {
				slugIndexCache.delete(region); // mirror getServerCorpus: allow retry
				throw e;
			});
		slugIndexCache.set(region, entry);
	}
	return entry;
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
