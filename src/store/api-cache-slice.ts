import type { StateCreator } from "zustand";
import {
	getRarities,
	getSets,
	getSubtypes,
	getSupertypes,
	getTypes,
	type PokemonListEntry,
	type PokemonSet,
} from "../api";
import { shouldRefetch } from "./freshness";

const POKEMON_LIST_LIMIT = 1025;

export interface ApiCacheSlice {
	sets: PokemonSet[] | null;
	setsFetchedAt: number | null;
	setsLoading: boolean;

	pokemonList: PokemonListEntry[] | null;
	pokemonListFetchedAt: number | null;
	pokemonListLoading: boolean;

	types: string[] | null;
	typesFetchedAt: number | null;
	typesLoading: boolean;

	rarities: string[] | null;
	raritiesFetchedAt: number | null;
	raritiesLoading: boolean;

	supertypes: string[] | null;
	supertypesFetchedAt: number | null;
	supertypesLoading: boolean;

	subtypes: string[] | null;
	subtypesFetchedAt: number | null;
	subtypesLoading: boolean;

	loadSets: () => Promise<void>;
	loadPokemonList: () => Promise<void>;
	loadTypes: () => Promise<void>;
	loadRarities: () => Promise<void>;
	loadSupertypes: () => Promise<void>;
	loadSubtypes: () => Promise<void>;
}

export const createApiCacheSlice: StateCreator<ApiCacheSlice> = (set, get) => ({
	sets: null,
	setsFetchedAt: null,
	setsLoading: false,

	pokemonList: null,
	pokemonListFetchedAt: null,
	pokemonListLoading: false,

	types: null,
	typesFetchedAt: null,
	typesLoading: false,

	rarities: null,
	raritiesFetchedAt: null,
	raritiesLoading: false,

	supertypes: null,
	supertypesFetchedAt: null,
	supertypesLoading: false,

	subtypes: null,
	subtypesFetchedAt: null,
	subtypesLoading: false,

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

	loadTypes: async () => {
		const { typesLoading, typesFetchedAt } = get();
		if (typesLoading) return;
		if (!shouldRefetch({ lastFetchedAt: typesFetchedAt, kind: "filterValues" }))
			return;
		set({ typesLoading: true });
		try {
			const types = await getTypes();
			set({ types, typesFetchedAt: Date.now(), typesLoading: false });
		} catch (e) {
			console.error(e);
			set({ typesLoading: false });
		}
	},

	loadRarities: async () => {
		const { raritiesLoading, raritiesFetchedAt } = get();
		if (raritiesLoading) return;
		if (
			!shouldRefetch({ lastFetchedAt: raritiesFetchedAt, kind: "filterValues" })
		)
			return;
		set({ raritiesLoading: true });
		try {
			const rarities = await getRarities();
			set({ rarities, raritiesFetchedAt: Date.now(), raritiesLoading: false });
		} catch (e) {
			console.error(e);
			set({ raritiesLoading: false });
		}
	},

	loadSupertypes: async () => {
		const { supertypesLoading, supertypesFetchedAt } = get();
		if (supertypesLoading) return;
		if (
			!shouldRefetch({
				lastFetchedAt: supertypesFetchedAt,
				kind: "filterValues",
			})
		)
			return;
		set({ supertypesLoading: true });
		try {
			const supertypes = await getSupertypes();
			set({
				supertypes,
				supertypesFetchedAt: Date.now(),
				supertypesLoading: false,
			});
		} catch (e) {
			console.error(e);
			set({ supertypesLoading: false });
		}
	},

	loadSubtypes: async () => {
		const { subtypesLoading, subtypesFetchedAt } = get();
		if (subtypesLoading) return;
		if (
			!shouldRefetch({ lastFetchedAt: subtypesFetchedAt, kind: "filterValues" })
		)
			return;
		set({ subtypesLoading: true });
		try {
			const subtypes = await getSubtypes();
			set({ subtypes, subtypesFetchedAt: Date.now(), subtypesLoading: false });
		} catch (e) {
			console.error(e);
			set({ subtypesLoading: false });
		}
	},
});
