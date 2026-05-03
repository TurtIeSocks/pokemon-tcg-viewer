import { create } from "zustand";
import { persist } from "zustand/middleware";
import { type ApiCacheSlice, createApiCacheSlice } from "./apiCacheSlice";
import { createUISlice, type UISlice } from "./uiSlice";

type AppStore = UISlice & ApiCacheSlice;

// Bump if the persisted shape changes in a non-additive way and you want to
// drop old data instead of writing a migration.
const STORAGE_VERSION = 1;

export const useStore = create<AppStore>()(
	persist(
		(...a) => ({
			...createUISlice(...a),
			...createApiCacheSlice(...a),
		}),
		{
			name: "pokemon-tcg-viewer",
			version: STORAGE_VERSION,
			// Only mirror these fields to localStorage. Loading/in-flight flags and
			// any future ephemeral state stay in memory.
			partialize: (state) => ({
				selectedSetId: state.selectedSetId,
				selectedPokedexNumber: state.selectedPokedexNumber,
				sets: state.sets,
				setsFetchedAt: state.setsFetchedAt,
				pokemonList: state.pokemonList,
				pokemonListFetchedAt: state.pokemonListFetchedAt,
			}),
		},
	),
);
