// Server-only raw data fetchers. These touch process.env (API base) and call
// external APIs directly, so they MUST NOT be imported from any client-reachable
// module. The createServerFn wrappers in ./card-data.ts are the client-facing
// surface; server modules (corpus-server, nav-tree) import these raw helpers
// directly to skip the cross-fn RPC hop.
//
// Keeping these out of ./card-data.ts means that module — which IS imported by
// the client (store/sets-slice → getSetsFn) — carries zero top-level server-only
// code, so the client/server split no longer rests solely on tree-shaking the
// stripped server-fn handlers. Defense in depth behind scripts/check-client-bundle.ts.

import { ptcgSetImageUrl } from "../lib/corpus/id-crosswalk";
import { OVERLAY_SET_IDS } from "../lib/corpus/overlay-sets";
import type { SupportedLanguage } from "../lib/languages";
import {
	type FocusCardData,
	mapTcgdexFocusCard,
	type PokemonListEntry,
	type PokemonSet,
	type TcgdexFocusCard,
} from "./card-mappers";

// v2: the CF Worker proxies TCGdex. Default changed from pokemontcg.io to the
// worker so cold starts without API_BASE still resolve to TCGdex data.
// Server-only — never in the client bundle.
export function apiBase(): string {
	return (
		process.env.API_BASE ?? "https://pokemon-tcg-proxy.ptcg-viewer.workers.dev"
	).replace(/\/$/, "");
}

/** TCGdex set detail shape (GET /v2/en/sets/{id}). */
export interface TcgdexSetDetail {
	id: string;
	name: string;
	releaseDate?: string;
	cardCount: { total: number; official: number };
	serie: { id: string; name: string };
	logo?: string;
	symbol?: string;
	// The set's cards (CardBrief[]). We only need the length: a phantom TCGdex
	// set can report a cardCount but list zero actual cards.
	cards?: { id: string }[];
}

/** Map a TCGdex set detail to the app's PokemonSet shape. */
export function mapTcgdexSet(s: TcgdexSetDetail): PokemonSet {
	return {
		id: s.id,
		name: s.name,
		series: s.serie.name,
		seriesId: s.serie.id,
		releaseDate: s.releaseDate ?? "",
		printedTotal: s.cardCount.official,
		total: s.cardCount.total,
		images: {
			// Fill TCGdex's 53/41 missing logos/symbols from pokemontcg.io (the
			// set-tile onError degrades a dead ptcg url to the set-name text).
			logo: s.logo ? `${s.logo}.png` : ptcgSetImageUrl(s.id, "logo"),
			symbol: s.symbol ? `${s.symbol}.png` : ptcgSetImageUrl(s.id, "symbol"),
		},
	};
}

/** Minimal list entry from GET /v2/en/sets (no releaseDate or serie). */
interface TcgdexSetListEntry {
	id: string;
}

const SETS_CONCURRENCY = 10;

/**
 * Raw async fetch of all sets from TCGdex. Fetches the list first, then
 * resolves each set's detail (which carries releaseDate + serie) with a
 * small concurrency limit. Safe to call from within a server function
 * handler (avoids the cross-fn RPC hop).
 *
 * @param baseLang TCGdex locale to list/resolve sets from. Defaults to "en"
 * (the Western catalog), which keeps existing callers byte-identical.
 * Pass a Region's base language (see `REGION_BASE_LANGUAGE`) for another
 * region's catalog — e.g. "ja" for the Asian region, which pokemontcg.io
 * has no equivalent for.
 */
export async function fetchAllSets(baseLang = "en"): Promise<PokemonSet[]> {
	const base = apiBase();
	const listResp = await fetch(`${base}/v2/${baseLang}/sets`);
	if (!listResp.ok) throw new Error("Unable to fetch sets list");
	const list = (await listResp.json()) as TcgdexSetListEntry[];

	const results: PokemonSet[] = [];
	for (let i = 0; i < list.length; i += SETS_CONCURRENCY) {
		const batch = list.slice(i, i + SETS_CONCURRENCY);
		const details = await Promise.all(
			batch.map(async (entry) => {
				// Encode the id: JP-lineage set ids contain characters like "+"
				// (e.g. SM1+, SM3+) that are otherwise mangled in the path and 404.
				const r = await fetch(
					`${base}/v2/${baseLang}/sets/${encodeURIComponent(entry.id)}`,
				);
				if (!r.ok) {
					// One unfetchable set must not abort the whole region's nav tree
					// (a single throw here would reject the batch and blank the entire
					// browse tree). Warn and drop just this set.
					console.warn(
						`skipping set "${entry.id}": detail fetch failed (${r.status})`,
					);
					return null;
				}
				return (await r.json()) as TcgdexSetDetail;
			}),
		);
		for (const d of details) {
			if (!d) continue;
			// Skip phantom sets: TCGdex sometimes reports a cardCount but lists zero
			// actual cards (e.g. `wp` "W Promotional" — cardCount.total 7, cards []).
			// The corpus crawl gets 0 cards for these, so a phantom in the nav shows a
			// "7 in sidebar, 0 in grid" mismatch. Drop them so nav matches the corpus.
			if (
				Array.isArray(d.cards) &&
				d.cards.length === 0 &&
				!OVERLAY_SET_IDS.has(d.id)
			) {
				console.warn(
					`skipping phantom set "${d.id}" (${d.name}): cardCount ${d.cardCount.total} but 0 cards listed`,
				);
				continue;
			}
			results.push(mapTcgdexSet(d));
		}
	}
	return results;
}

/**
 * Raw card-by-id fetch in the requested language. TCGdex serves the whole card
 * translated at /v2/{lang}/cards/{id} (name, abilities, attacks, flavor). A
 * non-English locale that lacks the card (e.g. es/it/pt vintage) 404s, so we
 * fall back to the always-complete English record. Safe to call from
 * loaders/handlers (no RPC-stub hop).
 */
export async function fetchCardById(
	id: string,
	lang: SupportedLanguage = "en",
): Promise<FocusCardData> {
	let resp = await fetch(`${apiBase()}/v2/${lang}/cards/${id}`);
	let usedEn = lang === "en";
	if (!resp.ok && lang !== "en") {
		resp = await fetch(`${apiBase()}/v2/en/cards/${id}`);
		usedEn = true;
	}
	if (!resp.ok) {
		if (resp.status === 404)
			throw new Response("Card not found", { status: 404 });
		throw new Error(`Failed to fetch card ${id}: ${resp.status}`);
	}
	const json = (await resp.json()) as TcgdexFocusCard;
	// A localized card can EXIST (name + translated ability/attack text) yet carry
	// no `image` — TCGdex has the German metadata for base1-1 "Simsala" but no
	// German scan. Without an image, mapTcgdexFocusCard drops to the pokemontcg.io
	// fallback and nulls imageBase, which kills the localize→EN-fallback→"EN" badge
	// path. Borrow the EN scan so the detail view derives the (missing) localized
	// image, reconciles it to English, and flags the English print — while keeping
	// the localized text. Skipped when the response already IS English (no point
	// re-fetching) or EN also has none (a truly imageless card → ptcg fallback).
	if (!json.image && !usedEn) {
		const en = await fetch(`${apiBase()}/v2/en/cards/${id}`);
		if (en.ok) {
			const enJson = (await en.json()) as TcgdexFocusCard;
			if (enJson.image) json.image = enJson.image;
		}
	}
	return mapTcgdexFocusCard(json);
}

const POKEMON_LIST_LIMIT = 1025;

/** Raw species-list fetch (PokéAPI). */
export async function fetchPokemonList(): Promise<PokemonListEntry[]> {
	const resp = await fetch(
		`https://pokeapi.co/api/v2/pokemon?limit=${POKEMON_LIST_LIMIT}`,
	);
	if (!resp.ok) throw new Error("Unable to fetch Pokémon list");
	const json = (await resp.json()) as { results: PokemonListEntry[] };
	return json.results;
}

let pokemonListCache: PokemonListEntry[] | null = null;
export async function getPokemonListCached(): Promise<PokemonListEntry[]> {
	if (!pokemonListCache) pokemonListCache = await fetchPokemonList();
	return pokemonListCache;
}

// Memoize card fetches for the process lifetime. Card data is effectively
// static (prices drift, but the focus view tolerates a process-lifetime cache;
// a deploy restart refreshes it). Caching the promise also dedupes concurrent
// opens of the same card. Evict on failure so a transient error doesn't poison.
const cardByIdCache = new Map<string, Promise<FocusCardData>>();
export function getCardByIdCached(
	id: string,
	lang: SupportedLanguage = "en",
): Promise<FocusCardData> {
	const key = `${lang}:${id}`;
	let p = cardByIdCache.get(key);
	if (!p) {
		p = fetchCardById(id, lang).catch((e) => {
			cardByIdCache.delete(key);
			throw e;
		});
		cardByIdCache.set(key, p);
	}
	return p;
}
