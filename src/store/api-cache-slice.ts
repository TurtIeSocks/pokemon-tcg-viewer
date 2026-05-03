import type { StateCreator } from "zustand";
import { getSets, type PokemonListEntry, type PokemonSet } from "../api";
import { shouldRefetch } from "./freshness";

const POKEMON_LIST_LIMIT = 1025;

export interface ApiCacheSlice {
	sets: PokemonSet[] | null;
	setsFetchedAt: number | null;
	setsLoading: boolean;

	pokemonList: PokemonListEntry[] | null;
	pokemonListFetchedAt: number | null;
	pokemonListLoading: boolean;

	loadSets: () => Promise<void>;
	loadPokemonList: () => Promise<void>;
}

export const createApiCacheSlice: StateCreator<ApiCacheSlice> = (set, get) => ({
	sets: null,
	setsFetchedAt: null,
	setsLoading: false,

	pokemonList: null,
	pokemonListFetchedAt: null,
	pokemonListLoading: false,

	loadSets: async () => {
		const { setsLoading, setsFetchedAt } = get();
		if (setsLoading) return;
		if (!shouldRefetch({ lastFetchedAt: setsFetchedAt, kind: "sets" })) return;
		set({ setsLoading: true });
		try {
			const sets = await getSets();
			set({ sets, setsFetchedAt: Date.now(), setsLoading: false });
		} catch (e) {
			console.error(e);
			set({ setsLoading: false });
		}
	},

	loadPokemonList: async () => {
		const { pokemonListLoading, pokemonListFetchedAt } = get();
		if (pokemonListLoading) return;
		if (
			!shouldRefetch({
				lastFetchedAt: pokemonListFetchedAt,
				kind: "pokemonList",
			})
		)
			return;
		set({ pokemonListLoading: true });
		try {
			const resp = await fetch(
				`https://pokeapi.co/api/v2/pokemon?limit=${POKEMON_LIST_LIMIT}`,
			);
			if (!resp.ok) throw new Error("Unable to fetch Pokémon list");
			const json = (await resp.json()) as { results: PokemonListEntry[] };
			set({
				pokemonList: json.results,
				pokemonListFetchedAt: Date.now(),
				pokemonListLoading: false,
			});
		} catch (e) {
			console.error(e);
			set({ pokemonListLoading: false });
		}
	},
});
