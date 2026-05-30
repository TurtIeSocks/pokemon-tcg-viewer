import { create, type StateCreator } from "zustand";
import { persist } from "zustand/middleware";
import type { PokemonListEntry, PokemonSet } from "../api";
import type { HoloCardData } from "../components/holo-card";
import { type ApiCacheSlice, createApiCacheSlice } from "./api-cache-slice";
import { type CardsSlice, createCardsSlice } from "./cards-slice";
import type { OwnedCard } from "./collection-slice";
import {
	type CollectionSlice,
	createCollectionSlice,
} from "./collection-slice";
import { createIdbStorage } from "./idb-storage";
import { createPackCardsSlice, type PackCardsSlice } from "./pack-cards-slice";

type AppStore = ApiCacheSlice & CollectionSlice & PackCardsSlice & CardsSlice;

// The persisted subset returned by partialize — matches what IDB stores.
interface PersistedStore {
	sets: PokemonSet[] | null;
	setsFetchedAt: number | null;
	pokemonList: PokemonListEntry[] | null;
	pokemonListFetchedAt: number | null;
	types: string[] | null;
	typesFetchedAt: number | null;
	rarities: string[] | null;
	raritiesFetchedAt: number | null;
	supertypes: string[] | null;
	supertypesFetchedAt: number | null;
	subtypes: string[] | null;
	subtypesFetchedAt: number | null;
	owned: Record<string, OwnedCard>;
	packCards: Record<string, HoloCardData[]>;
	packCardsFetchedAt: Record<string, number>;
	cardsCache: CardsSlice["cardsCache"];
	cardsCacheOrder: string[];
}

// Phase 5: substrate moves from localStorage to IndexedDB. The data shape
// is unchanged, so the v4→v5 migration is a no-op. The IDB adapter handles
// the one-time copy from localStorage on first v5 read.
const STORAGE_VERSION = 6;

const composed: StateCreator<AppStore> = (set, get, store) => ({
	...createApiCacheSlice(set, get, store),
	...createCollectionSlice(set, get, store),
	...createPackCardsSlice(set, get, store),
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
			packCards: state.packCards,
			packCardsFetchedAt: state.packCardsFetchedAt,
			cardsCache: state.cardsCache,
			cardsCacheOrder: state.cardsCacheOrder,
		}),
		migrate: (persisted, version) => {
			let next = persisted as Partial<AppStore>;
			if (version < 3) next = { ...next, owned: {} };
			if (version < 4)
				next = { ...next, packCards: {}, packCardsFetchedAt: {} };
			// v4 → v5: substrate-only change; no field migration needed.
			if (version < 6) next = { ...next, cardsCache: {}, cardsCacheOrder: [] };
			return next as AppStore;
		},
	}),
);
