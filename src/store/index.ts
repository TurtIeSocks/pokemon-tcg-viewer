import { create, type StateCreator } from "zustand";
import { persist } from "zustand/middleware";
import { type CardsSlice, createCardsSlice } from "./cards-slice";
import type { OwnedCard } from "./collection-slice";
import {
	type CollectionSlice,
	createCollectionSlice,
} from "./collection-slice";
import { createIdbStorage } from "./idb-storage";
import { createSetsSlice, type SetsSlice } from "./sets-slice";

type AppStore = SetsSlice & CollectionSlice & CardsSlice;

// The persisted subset returned by partialize — matches what IDB stores.
interface PersistedStore {
	sets: SetsSlice["sets"];
	setsFetchedAt: number | null;
	owned: Record<string, OwnedCard>;
	cardsCache: CardsSlice["cardsCache"];
	cardsCacheOrder: string[];
}

// Phase 7: drop api-cache-slice (pokemonList, types, rarities, supertypes, subtypes)
// and pack-cards-slice. Preserve owned (collection) across migration.
const STORAGE_VERSION = 7;

const composed: StateCreator<AppStore> = (set, get, store) => ({
	...createSetsSlice(set, get, store),
	...createCollectionSlice(set, get, store),
	...createCardsSlice(set, get, store),
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
			cardsCache: state.cardsCache,
			cardsCacheOrder: state.cardsCacheOrder,
		}),
		migrate: (persisted, version) => {
			let next = persisted as Partial<AppStore>;
			if (version < 3) next = { ...next, owned: {} };
			if (version < 6) next = { ...next, cardsCache: {}, cardsCacheOrder: [] };
			if (version < 7)
				next = {
					sets: null,
					setsFetchedAt: null,
					owned: ((next as { owned?: Record<string, OwnedCard> }).owned ??
						{}) as Record<string, OwnedCard>,
					cardsCache: {},
					cardsCacheOrder: [],
				} as unknown as Partial<AppStore>;
			return next as AppStore;
		},
	}),
);
