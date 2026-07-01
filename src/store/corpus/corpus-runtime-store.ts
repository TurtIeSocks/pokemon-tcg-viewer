import { create } from "zustand";
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
 */
export interface CorpusRuntimeState {
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
