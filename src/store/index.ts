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

// v9: collection moved out of the persist blob into the repo-backed userland
// store (src/store/userland). Only the sets cache is persisted here now.
const STORAGE_VERSION = 9;

export const useStore = create<AppStore>()(
	persist(createSetsSlice, {
		name: "pokemon-tcg-viewer",
		version: STORAGE_VERSION,
		storage: createIdbStorage<PersistedStore>(),
		partialize: (state) => ({
			sets: state.sets,
			setsFetchedAt: state.setsFetchedAt,
		}),
		// Older blobs may carry `owned` + cards-cache keys; we only keep the sets cache.
		migrate: (persisted) => {
			const p = (persisted ?? {}) as Partial<PersistedStore>;
			return {
				sets: p.sets ?? null,
				setsFetchedAt: p.setsFetchedAt ?? null,
			} as PersistedStore;
		},
	}),
);
