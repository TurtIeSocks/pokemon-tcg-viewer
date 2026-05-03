import { create } from "zustand";
import { persist } from "zustand/middleware";
import { type ApiCacheSlice, createApiCacheSlice } from "./api-cache-slice";

type AppStore = ApiCacheSlice;

// Bump if the persisted shape changes in a non-additive way and you want to
// drop old data instead of writing a migration. Phase 1 #5 only ADDS fields
// (filter-value caches with null defaults), so no bump needed — Phase 1 #4
// users keep their cached sets / pokémon list and just gain the new fields.
const STORAGE_VERSION = 2;

export const useStore = create<AppStore>()(
	persist(createApiCacheSlice, {
		name: "pokemon-tcg-viewer",
		version: STORAGE_VERSION,
		// Mirror cache data to localStorage. Loading flags stay in memory.
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
		}),
	}),
);
