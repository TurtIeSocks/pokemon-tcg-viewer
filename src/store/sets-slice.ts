import type { StateCreator } from "zustand";
import { getSetsFn } from "../server/card-data";
import type { PokemonSet } from "../server/card-mappers";
import { shouldRefetch } from "./freshness";

export interface SetsSlice {
	sets: PokemonSet[] | null;
	setsFetchedAt: number | null;
	setsLoading: boolean;
	loadSets: () => Promise<void>;
}

export const createSetsSlice: StateCreator<SetsSlice> = (set, get) => ({
	sets: null,
	setsFetchedAt: null,
	setsLoading: false,
	loadSets: async () => {
		const { setsLoading, setsFetchedAt } = get();
		if (setsLoading) return;
		if (!shouldRefetch({ lastFetchedAt: setsFetchedAt, kind: "sets" })) return;
		set({ setsLoading: true });
		try {
			const sets = await getSetsFn();
			set({ sets, setsFetchedAt: Date.now(), setsLoading: false });
		} catch (e) {
			console.error(e);
			set({ setsLoading: false });
		}
	},
});
