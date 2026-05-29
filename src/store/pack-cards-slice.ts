import type { StateCreator } from "zustand";
import { getCardsBySet } from "../api";
import type { HoloCardData } from "../components/holo-card";
import { shouldRefetch } from "./freshness";

const PACK_PAGE_SIZE = 250;

export interface PackCardsSlice {
	packCards: Record<string, HoloCardData[]>;
	packCardsFetchedAt: Record<string, number>;
	packCardsLoading: Record<string, boolean>;
	loadPackCards: (setId: string) => Promise<void>;
}

export const createPackCardsSlice: StateCreator<PackCardsSlice> = (
	set,
	get,
) => ({
	packCards: {},
	packCardsFetchedAt: {},
	packCardsLoading: {},

	loadPackCards: async (setId) => {
		const state = get();
		if (state.packCardsLoading[setId]) return;
		if (
			!shouldRefetch({
				lastFetchedAt: state.packCardsFetchedAt[setId] ?? null,
				kind: "packCards",
			})
		)
			return;

		set((s) => ({
			packCardsLoading: { ...s.packCardsLoading, [setId]: true },
		}));
		try {
			const { cards } = await getCardsBySet(setId, 1, PACK_PAGE_SIZE);
			set((s) => ({
				packCards: { ...s.packCards, [setId]: cards },
				packCardsFetchedAt: { ...s.packCardsFetchedAt, [setId]: Date.now() },
				packCardsLoading: { ...s.packCardsLoading, [setId]: false },
			}));
		} catch (e) {
			console.error(e);
			set((s) => ({
				packCardsLoading: { ...s.packCardsLoading, [setId]: false },
			}));
		}
	},
});
