import { create, type StateCreator } from "zustand";
import { persist } from "zustand/middleware";
import { type ApiCacheSlice, createApiCacheSlice } from "./api-cache-slice";
import {
	type CollectionSlice,
	createCollectionSlice,
} from "./collection-slice";

type AppStore = ApiCacheSlice & CollectionSlice;

// Bump if the persisted shape changes in a non-additive way and you want to
// drop old data instead of writing a migration. Phase 1 #5 only ADDS fields,
// so was kept at 2. Phase 3 #1 adds `owned: {}` via the additive migration
// below; bumped to 3.
const STORAGE_VERSION = 3;

const composed: StateCreator<AppStore> = (set, get, store) => ({
	...createApiCacheSlice(set, get, store),
	...createCollectionSlice(set, get, store),
});

export const useStore = create<AppStore>()(
	persist(composed, {
		name: "pokemon-tcg-viewer",
		version: STORAGE_VERSION,
		// Mirror cache data + collection to localStorage. Loading flags stay in memory.
		partialize: (state) => ({
			sets: state.sets,
			setsFetchedAt: state.setsFetchedAt,
			pokemonList: state.pokemonList,
			pokemonListFetchedAt: state.pokemonListFetchedAt,
			types: state.types,
			typesFetchedAt: state.typesFetchedAt,
			rarities: state.rarities,
			raritiesFetchedAt: state.raritiesFetchedAt,
			supertypes: state.supertypes,
			supertypesFetchedAt: state.supertypesFetchedAt,
			subtypes: state.subtypes,
			subtypesFetchedAt: state.subtypesFetchedAt,
			owned: state.owned,
		}),
		// Pre-Phase-3 persisted state has no `owned` key. Add it without
		// dropping the api-cache data so users don't lose their snapshot.
		migrate: (persisted, version) => {
			if (version < 3) {
				return {
					...(persisted as Partial<AppStore>),
					owned: {},
				} as AppStore;
			}
			return persisted as AppStore;
		},
	}),
);
