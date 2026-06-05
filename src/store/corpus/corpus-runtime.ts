import { useMemo } from "react";
import { create } from "zustand";
import type { HoloCardData } from "../../components/holo-card";
import { apiBase } from "../../lib/api-base-client";
import { buildSlugIndex, type SlugIndex } from "../../lib/slug";
import type { PokemonSet } from "../../server/card-mappers";
import { useStore } from "../index";
import {
	buildIndex,
	type CorpusIndex,
	type CorpusQuery,
	queryCorpus,
	setsById,
} from "./corpus-engine";
import { type CorpusMeta, readGz, readMeta, writeCorpus } from "./corpus-store";
import type { CorpusCard } from "./corpus-types";

export type CardFetcher = (
	key: string,
	page: number,
	pageSize: number,
) => Promise<{ cards: HoloCardData[]; totalCount: number }>;

interface CorpusRuntimeState {
	index: CorpusIndex | null;
	/** True while loadCorpus is actively fetching/decompressing the corpus. */
	loading: boolean;
}

// Non-persisted store — holds the ~20k-card index in memory only. Never put
// this in the persisted useStore, which re-serializes on every change.
export const useCorpusRuntime = create<CorpusRuntimeState>(() => ({
	index: null,
	loading: false,
}));

const ONE_DAY = 24 * 60 * 60 * 1000;

async function gunzip(buf: ArrayBuffer): Promise<string> {
	const ds = new DecompressionStream("gzip");
	const stream = new Blob([buf]).stream().pipeThrough(ds);
	return await new Response(stream).text();
}

async function setIndexFromGz(gz: ArrayBuffer): Promise<void> {
	const text = await gunzip(gz);
	const cards = JSON.parse(text) as CorpusCard[];
	useCorpusRuntime.setState({ index: buildIndex(cards) });
}

let inFlight: Promise<void> | null = null;

/**
 * Load the corpus into memory: conditional GET /corpus, store on 200, reuse
 * stored bytes on 304/offline. Idempotent within a session; skips the network
 * if the last successful fetch was < 1 day ago.
 */
export function loadCorpus(): Promise<void> {
	if (useCorpusRuntime.getState().index) return Promise.resolve();
	if (inFlight) return inFlight;
	useCorpusRuntime.setState({ loading: true });
	inFlight = (async () => {
		const meta = await readMeta();
		const stored = await readGz();
		const fresh = meta && Date.now() - meta.fetchedAt < ONE_DAY;
		if (stored && fresh) {
			await setIndexFromGz(stored);
			return;
		}
		try {
			const res = await fetch(`${apiBase()}/corpus`, {
				// Only send If-None-Match when the cached body is actually present:
				// a 304 with no stored blob would leave us with no corpus at all.
				headers: meta?.etag && stored ? { "If-None-Match": meta.etag } : {},
			});
			if (res.status === 304 && stored) {
				await writeCorpus(stored, {
					...(meta as CorpusMeta),
					fetchedAt: Date.now(),
				});
				await setIndexFromGz(stored);
				return;
			}
			if (res.ok) {
				const gz = await res.arrayBuffer();
				const etag = res.headers.get("ETag") ?? "";
				await writeCorpus(gz, {
					etag,
					version: etag.replace(/"/g, ""),
					fetchedAt: Date.now(),
				});
				await setIndexFromGz(gz);
				return;
			}
			if (stored) await setIndexFromGz(stored);
		} catch {
			if (stored) await setIndexFromGz(stored);
		}
	})().finally(() => {
		inFlight = null;
		useCorpusRuntime.setState({ loading: false });
	});
	return inFlight;
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
		const index = useCorpusRuntime.getState().index;
		if (!index) return Promise.resolve({ cards: [], totalCount: 0 });
		let perKey = queryCache.get(index);
		if (!perKey) {
			perKey = new Map();
			queryCache.set(index, perKey);
		}
		let all = perKey.get(key);
		if (!all) {
			all = queryCorpus(index, params, setsById(useStore.getState().sets));
			perKey.set(key, all);
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

/**
 * Slug index over the in-memory corpus + sets — lets a client list build
 * card-detail links (/$series/$set/$card) with no server round trip. Null until
 * both the corpus and sets have loaded.
 */
function getSlugIndex(): SlugIndex | null {
	const index = useCorpusRuntime.getState().index;
	const sets = useStore.getState().sets;
	if (!index || !sets) return null;
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

/** Reactive {@link getSlugIndex}: re-renders when the corpus or sets load. */
export function useSlugIndex(): SlugIndex | null {
	const index = useCorpusRuntime((s) => s.index);
	const sets = useStore((s) => s.sets);
	return useMemo(() => (index && sets ? getSlugIndex() : null), [index, sets]);
}
