import { create } from "zustand";
import { persist } from "zustand/middleware";
import { createIdbStorage } from "./idb-storage";
import { createSetsSlice, type SetsSlice } from "./sets-slice";

type AppStore = SetsSlice;

// The persisted subset returned by partialize — matches what IDB stores.
interface PersistedStore {
	sets: SetsSlice["sets"];
	setsFetchedAt: number | null;
}

// v10: TCGdex became the catalog source, changing set ids (e.g. base6 -> lc,
// sm75 -> sm7.5, plus TCGdex-only sets like Pokémon TCG Pocket). The persisted
// pokemontcg.io sets cache is now invalid — the bump discards it so loadSets
// refetches the TCGdex set list (otherwise renamed sets fail to join and card
// modal links break for existing users).
// v9: collection moved out of the persist blob into the repo-backed userland
// store (src/store/userland). Only the sets cache is persisted here now.
const STORAGE_VERSION = 10;

export const useStore = create<AppStore>()(
	persist(createSetsSlice, {
		name: "pokemon-tcg-viewer",
		version: STORAGE_VERSION,
		storage: createIdbStorage<PersistedStore>(),
		partialize: (state) => ({
			sets: state.sets,
			setsFetchedAt: state.setsFetchedAt,
		}),
		// A version bump invalidates the cached sets (ids/shape may have changed,
		// e.g. the pokemontcg.io -> TCGdex swap at v10): drop them so loadSets
		// refetches fresh. Older blobs may also carry legacy `owned`/cards-cache
		// keys, which are likewise discarded.
		migrate: () => ({ sets: null, setsFetchedAt: null }) as PersistedStore,
	}),
);
