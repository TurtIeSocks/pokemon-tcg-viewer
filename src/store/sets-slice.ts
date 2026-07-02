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
