import { create, type StoreApi, type UseBoundStore } from "zustand";
import type { Region } from "../../lib/languages";
import type { CorpusIndex } from "./corpus-engine";

/**
 * The bare in-memory corpus-index store, in its OWN leaf module.
 *
 * WHY A SEPARATE FILE: `corpus-runtime.ts` is heavy (loadCorpus, queryCorpus,
 * slug index, i18n) and is statically imported by ~10 components. The userland
 * store's boot migration needs only `useCorpusRuntime.getState().index`. Reaching
 * it via `await import("../corpus/corpus-runtime")` made a dynamic import of a
 * statically-reachable module — a chunk-split cycle that the prod (rolldown)
 * bundle initialized out of order → TDZ crash ("p is not a function") that killed
 * the corpus runtime and left every grid/vault empty. Keeping just the store here
 * (zustand + a type-only import) lets non-corpus modules import it statically with
 * no cycle. `corpus-runtime.ts` re-exports it, so existing importers are unchanged.
 *
 * REGION MAP (Phase 2 asian-catalog): the store now holds one `CorpusIndex` per
 * `Region` (`west`, `asia`) instead of a single index, so Phase 2 can load the
 * Asian-region base corpus alongside the Western one without evicting it. Existing
 * call sites (`useCorpusRuntime((s) => s.index)`, `useCorpusRuntime.getState().index`,
 * and tests doing `useCorpusRuntime.setState({ index })`) predate the region split
 * and outnumber the region-aware call sites, so `index` stays a real,
 * always-in-sync field — a back-compat READ path (`indices[activeRegion] ??
 * null`, the ACTIVE region only) recomputed by `setIndex`/`setActiveRegion`, plus
 * a back-compat WRITE shim in `setState` that treats a bare `index` as shorthand
 * for the `west` region. This is lower churn than touching the ~15 files that
 * select `.index` today. `loading` is region-keyed from the start (no bare-value
 * back-compat) — use the `setLoading` action.
 */
export interface CorpusRuntimeState {
	/** Per-region in-memory corpus index. */
	indices: Partial<Record<Region, CorpusIndex>>;
	/** Which region's index the back-compat `index` field currently reflects. */
	activeRegion: Region;
	/** True while loadCorpus is actively fetching/decompressing a region's corpus. */
	loading: Partial<Record<Region, boolean>>;
	/**
	 * Back-compat: `indices[activeRegion] ?? null` (the ACTIVE region only). Kept as
	 * a real field (not a getter) so `useCorpusRuntime((s) => s.index)` selectors and
	 * `useCorpusRuntime.getState().index` reads — both pre-existing, un-migrated
	 * call sites — keep working unchanged.
	 */
	index: CorpusIndex | null;
	setIndex(region: Region, index: CorpusIndex): void;
	setActiveRegion(region: Region): void;
	/** Set (or clear) the loading flag for a single region without touching others. */
	setLoading(region: Region, loading: boolean): void;
}

/**
 * Back-compat shape accepted by `setState`: a bare `index` (predating the region
 * split) in place of the region-keyed `indices` map. See the REGION MAP note
 * above — this is the type-level counterpart of the runtime shim.
 *
 * `loading` is intentionally NOT part of this shim (unlike `index`): `loading`
 * is already `Partial<Record<Region, boolean>>` at the state level, so a raw
 * `setState({ loading: {...} })` is a normal (non-compat) partial update and
 * must NOT be reinterpreted as "west" shorthand — doing so would silently drop
 * every other region's flag. Use the `setLoading` action instead.
 */
type CorpusRuntimeCompatPatch = Partial<Omit<CorpusRuntimeState, "index">> & {
	index?: CorpusIndex | null;
};

/** `setState` widened to also accept {@link CorpusRuntimeCompatPatch}. */
type CompatSetState = (
	partial:
		| CorpusRuntimeState
		| Partial<CorpusRuntimeState>
		| CorpusRuntimeCompatPatch
		| ((
				state: CorpusRuntimeState,
		  ) =>
				| CorpusRuntimeState
				| Partial<CorpusRuntimeState>
				| CorpusRuntimeCompatPatch),
	replace?: false,
) => void;

function deriveIndex(
	indices: Partial<Record<Region, CorpusIndex>>,
	activeRegion: Region,
): CorpusIndex | null {
	// The ACTIVE region's index only — NO cross-region `?? indices.west` fallback.
	// When asia is active but not yet loaded, `index` must be null so a browse grid
	// stays on its correct (asia) SSR seed and `corpusReady` reads false, rather
	// than falling back to the west index and blanking the asia grid on hydration.
	return indices[activeRegion] ?? null;
}

// Non-persisted store — holds the ~20k-card index (per region) in memory only.
// Never put this in the persisted useStore, which re-serializes on every change.
const corpusRuntimeStore = create<CorpusRuntimeState>((set, get) => ({
	indices: {},
	activeRegion: "west",
	loading: {},
	index: null,
	setIndex: (region, index) => {
		const indices = { ...get().indices, [region]: index };
		set({ indices, index: deriveIndex(indices, get().activeRegion) });
	},
	setActiveRegion: (region) => {
		set({ activeRegion: region, index: deriveIndex(get().indices, region) });
	},
	setLoading: (region, loading) => {
		set({ loading: { ...get().loading, [region]: loading } });
	},
}));

// Back-compat WRITE shim: a bare `setState({ index })` predates the region
// split — every existing test call site (and `corpus-runtime.ts`'s
// `loadCorpus`) uses this shorthand for the `west` region. Wrap the store's
// own `setState` so those calls keep working, both at runtime and in the type
// system, without touching each call site. `loading` is intentionally NOT
// shimmed — see the CorpusRuntimeCompatPatch doc comment above; use the
// `setLoading` action instead.
const baseSetState = corpusRuntimeStore.setState;
const setStateCompat: CompatSetState = (partial, replace) => {
	const resolved =
		typeof partial === "function"
			? partial(corpusRuntimeStore.getState())
			: partial;
	if (
		resolved &&
		typeof resolved === "object" &&
		!("indices" in resolved) &&
		"index" in resolved
	) {
		const compat = resolved as CorpusRuntimeCompatPatch;
		const current = corpusRuntimeStore.getState();
		const shimmedIndex = compat.index ?? null;
		const indices = { ...current.indices };
		if (shimmedIndex == null) delete indices.west;
		else indices.west = shimmedIndex;
		const next: Partial<CorpusRuntimeState> = {
			...compat,
			indices,
			index: deriveIndex(indices, current.activeRegion),
		};
		baseSetState(next as CorpusRuntimeState, replace);
		return;
	}
	baseSetState(resolved as Partial<CorpusRuntimeState>, replace);
};
corpusRuntimeStore.setState =
	setStateCompat as StoreApi<CorpusRuntimeState>["setState"];

export const useCorpusRuntime = corpusRuntimeStore as UseBoundStore<
	Omit<StoreApi<CorpusRuntimeState>, "setState"> & {
		setState: CompatSetState;
	}
>;
