import { create } from "zustand";
import { persist } from "zustand/middleware";
import { type ApiCacheSlice, createApiCacheSlice } from "./api-cache-slice";

type AppStore = ApiCacheSlice;

// Bump if the persisted shape changes in a non-additive way and you want to
// drop old data instead of writing a migration. Bumping for Phase 1 to drop
// the now-stale selectedSetId / selectedPokedexNumber values from anyone who
// used Phase 0 with localStorage selection.
const STORAGE_VERSION = 2;

export const useStore = create<AppStore>()(
	persist(createApiCacheSlice, {
		name: "pokemon-tcg-viewer",
		version: STORAGE_VERSION,
		// Only mirror these fields to localStorage. Loading/in-flight flags and
		// any future ephemeral state stay in memory. Page selection now lives
		// in the URL, not here.
		partialize: (state) => ({
			sets: state.sets,
			setsFetchedAt: state.setsFetchedAt,
			pokemonList: state.pokemonList,
			pokemonListFetchedAt: state.pokemonListFetchedAt,
		}),
	}),
);
