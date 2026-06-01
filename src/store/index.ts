import { create, type StateCreator } from "zustand";
import { persist } from "zustand/middleware";
import type { OwnedCard } from "./collection-slice";
import {
	type CollectionSlice,
	createCollectionSlice,
} from "./collection-slice";
import { createIdbStorage } from "./idb-storage";
import { createSetsSlice, type SetsSlice } from "./sets-slice";

type AppStore = SetsSlice & CollectionSlice;

// The persisted subset returned by partialize — matches what IDB stores.
interface PersistedStore {
	sets: SetsSlice["sets"];
	setsFetchedAt: number | null;
	owned: Record<string, OwnedCard>;
}

// v8: drop the cards-cache slice — the corpus runtime's in-memory query cache
// (src/store/corpus) replaced it, leaving cardsCache/cardsCacheOrder orphaned.
// Older blobs' stale keys are stripped on migrate; owned (collection) survives.
const STORAGE_VERSION = 8;

const composed: StateCreator<AppStore> = (set, get, store) => ({
	...createSetsSlice(set, get, store),
	...createCollectionSlice(set, get, store),
});

export const useStore = create<AppStore>()(
	persist(composed, {
		name: "pokemon-tcg-viewer",
		version: STORAGE_VERSION,
		storage: createIdbStorage<PersistedStore>(),
		partialize: (state) => ({
			sets: state.sets,
			setsFetchedAt: state.setsFetchedAt,
			owned: state.owned,
		}),
		migrate: (persisted, version) => {
			let next = persisted as Partial<AppStore>;
			if (version < 3) next = { ...next, owned: {} };
			if (version < 7)
				next = {
					sets: null,
					setsFetchedAt: null,
					owned: ((next as { owned?: Record<string, OwnedCard> }).owned ??
						{}) as Record<string, OwnedCard>,
				} as unknown as Partial<AppStore>;
			// v8 dropped cardsCache/cardsCacheOrder — strip them from older blobs.
			if (version < 8) {
				const n = next as Record<string, unknown>;
				delete n.cardsCache;
				delete n.cardsCacheOrder;
			}
			return next as AppStore;
		},
	}),
);
