import { useMemo } from "react";
import type { HoloCardData } from "../../components/holo-card";
import { apiBase } from "../../lib/api-base-client";
import { type CardRouteParams, cardRouteParams } from "../../lib/card-route";
import { type Region, regionForLanguage } from "../../lib/languages";
import { buildSlugIndex, type SlugIndex } from "../../lib/slug";
import type { PokemonSet } from "../../server/card-mappers";
import { useStore } from "../index";
import { setsForRegion } from "../sets-slice";
import {
	buildIndex,
	type CorpusIndex,
	type CorpusQuery,
	queryCorpus,
	setsById,
} from "./corpus-engine";
import { useCorpusRuntime } from "./corpus-runtime-store";
import { type CorpusMeta, readGz, readMeta, writeCorpus } from "./corpus-store";
import type { CorpusCard } from "./corpus-types";
import { getActiveI18n } from "./i18n-active";

export type CardFetcher = (
	key: string,
	page: number,
	pageSize: number,
) => Promise<{ cards: HoloCardData[]; totalCount: number }>;

// The store lives in a leaf module (corpus-runtime-store) so non-corpus code can
// read the index without importing this heavy module. Re-export it here so every
// existing `import { useCorpusRuntime } from ".../corpus-runtime"` still resolves.
export { useCorpusRuntime };

async function gunzip(buf: ArrayBuffer): Promise<string> {
	const ds = new DecompressionStream("gzip");
	const stream = new Blob([buf]).stream().pipeThrough(ds);
	return await new Response(stream).text();
}

async function buildIndexFromGz(
	gz: ArrayBuffer,
	region: Region,
): Promise<CorpusIndex> {
	const text = await gunzip(gz);
	const cards = JSON.parse(text) as CorpusCard[];
	return buildIndex(cards, region);
}

/** URL for a region's base-corpus blob. West keeps the original unsuffixed path. */
function corpusUrl(region: Region): string {
	return region === "asia"
		? `${apiBase()}/corpus-region/asia`
		: `${apiBase()}/corpus`;
}

// Per-region in-flight promise map (mirrors i18n-runtime's DEDUPE pattern): lets
// west and asia load concurrently while de-duping repeat calls for the SAME
// region.
const inFlight = new Map<Region, Promise<void>>();

/**
 * Load a region's corpus into memory: conditional GET (`/corpus` for west,
 * `/corpus-region/asia` for asia), store on 200, reuse stored bytes on
 * 304/offline. Idempotent per region within a session; skips the network if
 * that region is already loaded. Two different regions can load concurrently;
 * repeat calls for the same region de-dupe onto the in-flight request.
 */
export function loadCorpus(region: Region = "west"): Promise<void> {
	if (useCorpusRuntime.getState().indices[region]) return Promise.resolve();
	const existing = inFlight.get(region);
	if (existing) return existing;
	useCorpusRuntime.getState().setLoading(region, true);
	const task = (async () => {
		// Independent IDB reads — run them together, not in a waterfall.
		const [meta, stored] = await Promise.all([
			readMeta(region),
			readGz(region),
		]);
		// Always revalidate against the server (cheap conditional GET): the ETag is
		// the build hash, so it's the only sound cache-invalidation signal. A pure
		// time window (e.g. "fresh < 1 day") let two browsers on the same URL serve
		// different corpus builds for up to a day. 304 → reuse stored bytes (no
		// re-download); 200 → adopt the new build; offline/error → fall back to
		// stored. loadCorpus is idempotent per region within a session (early
		// return above), so this is one 304 per page load, not per navigation.
		try {
			const res = await fetch(corpusUrl(region), {
				// Only send If-None-Match when the cached body is actually present:
				// a 304 with no stored blob would leave us with no corpus at all.
				headers: meta?.etag && stored ? { "If-None-Match": meta.etag } : {},
			});
			if (res.status === 304 && stored) {
				await writeCorpus(
					stored,
					{ ...(meta as CorpusMeta), fetchedAt: Date.now() },
					region,
				);
				useCorpusRuntime
					.getState()
					.setIndex(region, await buildIndexFromGz(stored, region));
				return;
			}
			if (res.ok) {
				const gz = await res.arrayBuffer();
				const etag = res.headers.get("ETag") ?? "";
				await writeCorpus(
					gz,
					{ etag, version: etag.replace(/"/g, ""), fetchedAt: Date.now() },
					region,
				);
				useCorpusRuntime
					.getState()
					.setIndex(region, await buildIndexFromGz(gz, region));
				return;
			}
			if (stored) {
				useCorpusRuntime
					.getState()
					.setIndex(region, await buildIndexFromGz(stored, region));
			}
		} catch {
			if (stored) {
				useCorpusRuntime
					.getState()
					.setIndex(region, await buildIndexFromGz(stored, region));
			}
		}
	})()
		.then(() => {
			// The corpus revalidates by ETag every load, but the persisted west sets
			// list sits behind a 7-day TTL — a brand-new set can exist in the corpus
			// while missing from the list, which makes buildSlugIndex drop its cards
			// (dead modal tab links; the "Pitch Black" incident). Let the sets slice
			// force a refetch when the freshly-loaded corpus outruns the list. Asia
			// sets are in-memory only (never persisted), so only west can go stale.
			const index = useCorpusRuntime.getState().indices[region];
			if (region === "west" && index)
				ensureSetsCoverageWhenReady(new Set(index.cards.map((c) => c.setId)));
		})
		.finally(() => {
			inFlight.delete(region);
			useCorpusRuntime.getState().setLoading(region, false);
		});
	inFlight.set(region, task);
	return task;
}

/**
 * Run the sets-coverage check ({@link SetsSlice.ensureSetsCoverCorpus}) now if
 * the persisted sets list has rehydrated, else once it does. The corpus load
 * can finish BEFORE the async IDB rehydrate of the sets slice (observed in
 * prod: the check saw `sets === null`, skipped, and never re-ran because
 * loadCorpus is idempotent per session) — so when sets aren't there yet, defer
 * to the first store write that has them.
 */
export function ensureSetsCoverageWhenReady(setIds: Set<string>): void {
	if (useStore.getState().sets) {
		void useStore.getState().ensureSetsCoverCorpus(setIds);
		return;
	}
	const unsub = useStore.subscribe((s) => {
		if (!s.sets) return;
		unsub();
		void useStore.getState().ensureSetsCoverCorpus(setIds);
	});
}

/** Imperative: load whichever region's base corpus covers `lang`. */
export function ensureRegionForLanguage(lang: string): Promise<void> {
	return loadCorpus(regionForLanguage(lang));
}

/**
 * Lazily load the Asian-region corpus (AND its sets list) when the owned
 * collection references a card that the Western index can't resolve (e.g.
 * imported/synced ownership of an Asian-only printing before the user ever
 * switches display language). No-op if every id already resolves in the west
 * index. Loading the asia sets alongside the index is required so an owned
 * asia card's manage link can resolve via its OWN region's slug index (see
 * `cardRouteParamsForRegion`) even while `activeRegion` stays "west" -- the
 * index alone isn't enough; `buildSlugIndex` also needs that region's sets.
 */
export function ensureRegionsForOwned(
	ownedCardIds: Iterable<string>,
): Promise<void> {
	const byId = useCorpusRuntime.getState().indices.west?.byId;
	// Wait for the west baseline to load before deciding. Without this guard an
	// unloaded west index (byId undefined) makes the FIRST owned id look
	// unresolved, eagerly downloading the large Asian corpus for every collector.
	// The caller re-invokes this once west is ready (see useEnsureOwnedRegions).
	if (!byId) return Promise.resolve();
	for (const id of ownedCardIds) {
		if (!byId.has(id)) {
			return Promise.all([
				loadCorpus("asia"),
				useStore.getState().loadSetsForRegion("asia"),
			]).then(() => undefined);
		}
	}
	return Promise.resolve();
}

// Memoize the full sorted match list per (index, cacheKey). Keyed by the index
// object via a WeakMap, so a corpus reload (new index) auto-invalidates every
// cached result — no stale pages after a version bump.
const queryCache = new WeakMap<CorpusIndex, Map<string, HoloCardData[]>>();

export interface OwnedFilter {
	mode: "owned" | "missing";
	ownedCardIds: Set<string>;
}

/** Build a CardFetcher backed by the in-memory corpus for the given params. */
export function makeCorpusFetcher(
	params: CorpusQuery,
	owned?: OwnedFilter,
): CardFetcher {
	return (key, page, pageSize) => {
		const runtime = useCorpusRuntime.getState();
		const index = runtime.index;
		if (!index) return Promise.resolve({ cards: [], totalCount: 0 });
		const i18n = getActiveI18n();
		let perKey = queryCache.get(index);
		if (!perKey) {
			perKey = new Map();
			queryCache.set(index, perKey);
		}
		// Fold the active language into the cache key so switching languages
		// re-derives localized rows instead of serving the previous language's.
		const langKey = `${i18n?.lang ?? "en"} ${key}`;
		let all = perKey.get(langKey);
		if (!all) {
			// Read the ACTIVE region's sets, not the bare (west-only) `sets` field --
			// an asia grid must hydrate cards' setName/setSeries/releaseDate from the
			// asia sets list, or every asia card falls back to a raw set-id name and
			// the year filter's `Number(undefined)` drops it (see setsForRegion).
			const sets = setsForRegion(useStore.getState(), runtime.activeRegion);
			all = queryCorpus(index, params, setsById(sets), i18n);
			perKey.set(langKey, all);
		}
		const list = owned
			? all.filter((c) =>
					owned.mode === "owned"
						? owned.ownedCardIds.has(c.id)
						: !owned.ownedCardIds.has(c.id),
				)
			: all;
		return Promise.resolve({
			cards: list.slice((page - 1) * pageSize, page * pageSize),
			totalCount: list.length,
		});
	};
}

// Memoize the slug index per (corpus index, sets list). Keyed by the index via a
// WeakMap so a corpus reload auto-invalidates; the inner Map re-keys on the sets
// ref so a sets refresh rebuilds too. Built once, reused across every page.
const slugIndexCache = new WeakMap<CorpusIndex, Map<PokemonSet[], SlugIndex>>();

/** Build (or reuse the cached) slug index for a given corpus index + sets pair. */
function slugIndexFor(index: CorpusIndex, sets: PokemonSet[]): SlugIndex {
	let perSets = slugIndexCache.get(index);
	if (!perSets) {
		perSets = new Map();
		slugIndexCache.set(index, perSets);
	}
	let si = perSets.get(sets);
	if (!si) {
		si = buildSlugIndex(sets, index.cards);
		perSets.set(sets, si);
	}
	return si;
}

/**
 * Slug index over the in-memory corpus + sets — lets a client list build
 * card-detail links (/$series/$set/$card) with no server round trip. Null until
 * both the corpus and sets have loaded.
 *
 * Reads the ACTIVE region's sets (`setsForRegion`), not the bare (west-only)
 * `sets` field: while an asia grid is active, `index` is the asia index, and
 * pairing it with west-only sets would resolve zero set slugs, breaking every
 * asia card-detail link.
 */
function getSlugIndex(): SlugIndex | null {
	const runtime = useCorpusRuntime.getState();
	const index = runtime.index;
	const sets = setsForRegion(useStore.getState(), runtime.activeRegion);
	if (!index || !sets) return null;
	return slugIndexFor(index, sets);
}

/** Reactive {@link getSlugIndex}: re-renders when the corpus or sets load. */
export function useSlugIndex(): SlugIndex | null {
	const index = useCorpusRuntime((s) => s.index);
	const activeRegion = useCorpusRuntime((s) => s.activeRegion);
	const sets = useStore((s) => setsForRegion(s, activeRegion));
	return useMemo(() => (index && sets ? getSlugIndex() : null), [index, sets]);
}

/**
 * Resolve a card's `/$series/$set/$card` route params from ITS OWN region's
 * index + sets — not the currently-active region's slug index. An owned card
 * can belong to a region the viewer isn't currently browsing (e.g. an owned
 * asia card while `activeRegion` is "west"); building the link from the active
 * region's slug index would look the card up in the wrong index and fail.
 * Returns null when that region's index/sets aren't loaded yet, or the card
 * isn't resolvable in them (mirrors {@link cardRouteParams}'s null contract).
 */
export function cardRouteParamsForRegion(
	card: { id: string; setId: string },
	region: Region,
): CardRouteParams | null {
	const index = useCorpusRuntime.getState().indices[region];
	const sets = setsForRegion(useStore.getState(), region);
	if (!index || !sets) return null;
	return cardRouteParams(slugIndexFor(index, sets), card);
}

/**
 * Reactive {@link cardRouteParamsForRegion}: re-renders when that region's
 * corpus or sets load.
 */
export function useCardRouteParamsForRegion(
	card: { id: string; setId: string },
	region: Region,
): CardRouteParams | null {
	const index = useCorpusRuntime((s) => s.indices[region]);
	const sets = useStore((s) => setsForRegion(s, region));
	return useMemo(
		() => (index && sets ? cardRouteParamsForRegion(card, region) : null),
		[index, sets, card, region],
	);
}
