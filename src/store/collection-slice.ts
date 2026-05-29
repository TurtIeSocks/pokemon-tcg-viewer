import type { StateCreator } from "zustand";
import type { HoloCardData } from "../components/holo-card";

export interface OwnedCard {
	card: HoloCardData;
	count: number;
	addedAt: number;
}

export interface CollectionSlice {
	owned: Record<string, OwnedCard>;
	addToCollection: (card: HoloCardData) => void;
	removeFromCollection: (cardId: string) => void;
	clearCollection: () => void;
}

export const createCollectionSlice: StateCreator<CollectionSlice> = (
	set,
	get,
) => ({
	owned: {},

	addToCollection: (card) => {
		if (get().owned[card.id]) return; // idempotent
		set((s) => ({
			owned: {
				...s.owned,
				[card.id]: { card, count: 1, addedAt: Date.now() },
			},
		}));
	},

	removeFromCollection: (cardId) => {
		if (!get().owned[cardId]) return; // idempotent
		set((s) => {
			const next = { ...s.owned };
			delete next[cardId];
			return { owned: next };
		});
	},

	clearCollection: () => set({ owned: {} }),
});
