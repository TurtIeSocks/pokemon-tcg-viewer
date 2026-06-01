import { gunzipSync } from "node:zlib";
import { createServerFn } from "@tanstack/react-start";
import type { HoloCardData } from "../components/holo-card";
import { buildSetCardSlugs } from "../lib/card-slugs";
import {
	buildIndex,
	type CorpusIndex,
	type CorpusQuery,
	queryCorpus,
} from "../store/corpus/corpus-engine";
import type { CorpusCard } from "../store/corpus/corpus-types";
import { apiBase, fetchAllSets } from "./card-data";
import type { PokemonSet } from "./card-mappers";

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
 * Query the server-side corpus. Returns the full sorted match list.
 *
 * Raw (not a server fn) so other SERVER modules (card-resolve) can call it
 * directly. Route loaders MUST NOT import this — they call the createServerFn
 * wrappers below, so the corpus code (node:zlib, process.env, /corpus fetch)
 * never ships to the client bundle. (This module imports node:zlib at the top,
 * so importing it from anything client-reachable leaks Node builtins into the
 * browser — see the leak-guard in scripts/check-client-bundle.ts.)
 */
export async function queryCorpusServer(
	q: CorpusQuery,
): Promise<HoloCardData[]> {
	const { index, setsById } = await getServerCorpus();
	return queryCorpus(index, q, setsById);
}

// --- createServerFn wrappers: the ONLY corpus entry points routes may use. ---
// A loader calling these runs the body server-side on SSR and RPCs to our
// server on client navigation — the body (and its node:zlib/env deps) is never
// bundled into the client.

/** All cards in a set, natural (number) order. */
export const getSetCardsFn = createServerFn({ method: "GET" })
	.inputValidator((setId: string) => setId)
	.handler(({ data: setId }) => queryCorpusServer({ setId, relevance: false }));

/** Global name search, relevance order. */
export const searchCardsFn = createServerFn({ method: "GET" })
	.inputValidator((query: string) => query)
	.handler(({ data: query }) =>
		queryCorpusServer({ query, setId: null, relevance: true }),
	);

/** All cards for a national-dex number, across sets. */
export const getDexCardsFn = createServerFn({ method: "GET" })
	.inputValidator((dex: number) => dex)
	.handler(({ data: dex }) =>
		queryCorpusServer({ dexNumber: dex, setId: null, relevance: false }),
	);

/**
 * Resolve a card slug within a set → card id (or null). Server fn so the $card
 * route loader never imports the raw resolver (which pulls node:zlib).
 */
export const resolveCardInSetFn = createServerFn({ method: "GET" })
	.inputValidator((input: { setId: string; cardSlug: string }) => input)
	.handler(async ({ data }) => {
		const all = await queryCorpusServer({
			setId: data.setId,
			relevance: false,
		});
		return buildSetCardSlugs(all).idBySlug.get(data.cardSlug) ?? null;
	});
