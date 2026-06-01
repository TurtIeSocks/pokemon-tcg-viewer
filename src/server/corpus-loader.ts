import { gunzipSync } from "node:zlib";
import type { HoloCardData } from "../components/holo-card";
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

// Memoize for the process lifetime — a deploy restart picks up a fresh corpus.
// Mirrors the getNavTreeFn memoization pattern.
let cached: Promise<ServerCorpus> | null = null;

async function loadServerCorpus(): Promise<ServerCorpus> {
	const [gzRes, sets] = await Promise.all([
		fetch(`${apiBase()}/corpus`),
		fetchAllSets(),
	]);
	if (!gzRes.ok) throw new Error(`/corpus fetch failed: ${gzRes.status}`);
	const gz = await gzRes.arrayBuffer();
	const cards = decodeCorpusGz(gz);
	return {
		index: buildIndex(cards),
		setsById: new Map(sets.map((s) => [s.id, s])),
	};
}

function getServerCorpus(): Promise<ServerCorpus> {
	if (!cached)
		cached = loadServerCorpus().catch((e) => {
			cached = null; // allow retry on next request after a transient failure
			throw e;
		});
	return cached;
}

/**
 * Query the server-side corpus. Returns the full sorted match list. Server-only
 * (see the file header) — route loaders reach it through the createServerFn
 * wrappers in ./corpus-server, never by importing this directly.
 */
export async function queryCorpusServer(
	q: CorpusQuery,
): Promise<HoloCardData[]> {
	const { index, setsById } = await getServerCorpus();
	return queryCorpus(index, q, setsById);
}
