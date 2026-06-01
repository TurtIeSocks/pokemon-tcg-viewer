import { gunzipSync } from "node:zlib";
import { apiBase, fetchAllSets } from "./card-data";
import type { PokemonSet } from "./card-mappers";
import {
	buildIndex,
	type CorpusIndex,
	type CorpusQuery,
	queryCorpus,
} from "../store/corpus/corpus-engine";
import type { CorpusCard } from "../store/corpus/corpus-types";
import type { HoloCardData } from "../components/holo-card";

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

/** Query the server-side corpus. Returns the full sorted match list. */
export async function queryCorpusServer(q: CorpusQuery): Promise<HoloCardData[]> {
	const { index, setsById } = await getServerCorpus();
	return queryCorpus(index, q, setsById);
}
