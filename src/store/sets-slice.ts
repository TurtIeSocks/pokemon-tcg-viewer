import type { StateCreator } from "zustand";
import type { Region } from "../lib/languages";
import { getSetsFn } from "../server/card-data";
import type { PokemonSet } from "../server/card-mappers";
import { shouldRefetch } from "./freshness";

export interface SetsSlice {
	/** West-region sets (unchanged shape/behavior -- existing consumers read this). */
	sets: PokemonSet[] | null;
	setsFetchedAt: number | null;
	setsLoading: boolean;
	/** Load the west-region sets list. Byte-identical to pre-region-split behavior. */
	loadSets: () => Promise<void>;
	/**
	 * Per-region sets cache (asian-catalog). `west` mirrors `sets` (same array
	 * reference) so `setsForRegion("west")` and reading `sets` directly agree.
	 * In-memory only -- not part of the persisted IDB blob (sets are cheap to
	 * refetch; region loads should not bloat the persisted snapshot every
	 * language switch).
	 */
	setsByRegion: Partial<Record<Region, PokemonSet[]>>;
	/** True while a `loadSetsForRegion` fetch for that region is in flight. */
	setsByRegionLoading: Partial<Record<Region, boolean>>;
	/**
	 * Load `region`'s sets list (idempotent: no-ops once that region's sets are
	 * already cached, and de-dupes a concurrent in-flight load for the same
	 * region). `loadSets`/`sets` stay the west-region path; this is the
	 * region-aware entry point used by asia browse/owned resolution.
	 */
	loadSetsForRegion: (region: Region) => Promise<void>;
	/**
	 * Corpus-driven invalidation of the persisted sets cache: when the loaded
	 * corpus references a set id missing from the cached west list, bypass the
	 * freshness TTL and refetch. See the "Pitch Black" incident: a new set's
	 * cards arrive via the ETag-revalidated corpus days before the 7-day sets
	 * TTL expires, and a sets list without the set makes buildSlugIndex drop
	 * every one of its cards (dead modal tab links).
	 */
	ensureSetsCoverCorpus: (corpusSetIds: Iterable<string>) => Promise<void>;
}

// Missing-set signatures already force-refetched this session. Guards the
// refetch loop when the SERVER's sets list also lacks the set (each corpus
// load would otherwise re-trigger a futile refetch).
const coverageForced = new Set<string>();

/** Test-only: forget which coverage signatures were already refetched. */
export function resetSetsCoverageForTests(): void {
	coverageForced.clear();
}

// Per-region in-flight promise map, mirroring corpus-runtime's loadCorpus
// dedupe pattern: lets west and asia sets load concurrently while de-duping
// repeat calls for the SAME region within a session.
const inFlight = new Map<Region, Promise<void>>();

export const createSetsSlice: StateCreator<SetsSlice> = (set, get) => ({
	sets: null,
	setsFetchedAt: null,
	setsLoading: false,
	setsByRegion: {},
	setsByRegionLoading: {},
	loadSets: async () => {
		const { setsLoading, setsFetchedAt } = get();
		if (setsLoading) return;
		if (!shouldRefetch({ lastFetchedAt: setsFetchedAt, kind: "sets" })) return;
		set({ setsLoading: true });
		try {
			const sets = await getSetsFn();
			set((s) => ({
				sets,
				setsFetchedAt: Date.now(),
				setsLoading: false,
				setsByRegion: { ...s.setsByRegion, west: sets },
			}));
		} catch (e) {
			console.error(e);
			set({ setsLoading: false });
		}
	},
	loadSetsForRegion: async (region) => {
		if (region === "west") return get().loadSets();
		if (get().setsByRegion[region]) return;
		const existing = inFlight.get(region);
		if (existing) return existing;
		set((s) => ({
			setsByRegionLoading: { ...s.setsByRegionLoading, [region]: true },
		}));
		const task = (async () => {
			try {
				const sets = await getSetsFn({ data: { lang: regionLang(region) } });
				set((s) => ({ setsByRegion: { ...s.setsByRegion, [region]: sets } }));
			} catch (e) {
				console.error(e);
			}
		})().finally(() => {
			inFlight.delete(region);
			set((s) => ({
				setsByRegionLoading: { ...s.setsByRegionLoading, [region]: false },
			}));
		});
		inFlight.set(region, task);
		return task;
	},
	ensureSetsCoverCorpus: async (corpusSetIds) => {
		const { sets, setsLoading } = get();
		// No cached list yet (cold start / rehydration still pending): the normal
		// loadSets path owns the first fetch — nothing to invalidate.
		// ponytail: if store rehydration ever lands AFTER the corpus load, this
		// misses one page load; corpus (network+gunzip) losing to a local IDB
		// rehydrate hasn't been observed.
		if (!sets || setsLoading) return;
		const have = new Set(sets.map((s) => s.id));
		const missing = [...new Set(corpusSetIds)].filter((id) => !have.has(id));
		if (missing.length === 0) return;
		const sig = missing.sort().join(",");
		if (coverageForced.has(sig)) return;
		coverageForced.add(sig);
		// Drop the freshness stamp so loadSets's shouldRefetch gate passes.
		set({ setsFetchedAt: null });
		return get().loadSets();
	},
});

/** A region's base display language, for the `getSetsFn({ data: { lang } })` RPC. */
function regionLang(region: Region): string {
	return region === "asia" ? "ja" : "en";
}

/**
 * Resolve a region's sets list from slice state: the region-keyed cache when
 * present, falling back to the plain `sets` field for `west` (covers the
 * window before `loadSets`'s first `setsByRegion` mirror, and any state shape
 * built before this field existed, e.g. `useStore.setState({ sets })` in
 * tests). Undefined (not null) when that region hasn't loaded yet, so callers
 * can distinguish "unknown" from "loaded but empty".
 */
export function setsForRegion(
	state: Pick<SetsSlice, "sets" | "setsByRegion">,
	region: Region,
): PokemonSet[] | undefined {
	return (
		state.setsByRegion[region] ??
		(region === "west" ? (state.sets ?? undefined) : undefined)
	);
}

function computeAllLoadedSets(
	state: Pick<SetsSlice, "sets" | "setsByRegion">,
): PokemonSet[] {
	const byId = new Map<string, PokemonSet>();
	const west = state.setsByRegion.west ?? state.sets ?? undefined;
	if (west) for (const set of west) byId.set(set.id, set);
	for (const [region, sets] of Object.entries(state.setsByRegion)) {
		if (region === "west" || !sets) continue;
		for (const set of sets) if (!byId.has(set.id)) byId.set(set.id, set);
	}
	return [...byId.values()];
}

// Memoize the concatenated list per (setsByRegion, sets) identity — mirrors the
// slugIndexFor WeakMap pattern. The list is a DERIVED array: recomputing it in
// every subscriber on every store write is the skill's expensive-selector trap.
// `setsByRegion` gets a fresh object ref on every sets load (loadSets /
// loadSetsForRegion), so it's a safe WeakMap key that invalidates exactly when
// the sets actually change; a loading-flag toggle leaves it (and `sets`)
// untouched, so we return the cached array ref. The stable ref lets consumers
// subscribe with a plain `useStore(allLoadedSets)` (Object.is) instead of
// `useShallow` — computed once, shared across all subscribers.
const allSetsMemo = new WeakMap<
	object,
	{ sets: PokemonSet[] | null; result: PokemonSet[] }
>();

/**
 * Every loaded region's sets, concatenated and de-duped by set `id` (set codes
 * are globally unique across regions, so no collision is possible). Falls back
 * to the plain `sets` field for `west` when `setsByRegion.west` hasn't been
 * mirrored yet, same as {@link setsForRegion}. For cross-region consumers
 * (owned collection, CSV import, shared snapshots, an owned-set view) where
 * cards can belong to any loaded region and ids/set-codes are globally unique.
 *
 * Memoized on `(setsByRegion, sets)` identity, so it returns a stable reference
 * until the sets actually change — subscribe with a plain `useStore(allLoadedSets)`,
 * no `useShallow` needed.
 */
export function allLoadedSets(
	state: Pick<SetsSlice, "sets" | "setsByRegion">,
): PokemonSet[] {
	const cached = allSetsMemo.get(state.setsByRegion);
	if (cached && cached.sets === state.sets) return cached.result;
	const result = computeAllLoadedSets(state);
	allSetsMemo.set(state.setsByRegion, { sets: state.sets, result });
	return result;
}
