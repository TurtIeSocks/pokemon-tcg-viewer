import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { HoloCardData } from "../components/holo-card";

const MAX_SEARCHES = 10;
const MAX_VIEWED = 24;

interface RecentsState {
	recentSearches: string[];
	recentlyViewed: HoloCardData[];
	addRecentSearch: (q: string) => void;
	addRecentlyViewed: (card: HoloCardData) => void;
	clearRecentSearches: () => void;
}

/**
 * Lightweight UI state (recent searches + recently viewed cards), persisted to
 * localStorage via Zustand's persist middleware. Kept separate from the IDB
 * domain store (src/store/index.ts) which holds cards/collection/cache.
 */
export const useRecentsStore = create<RecentsState>()(
	persist(
		(set) => ({
			recentSearches: [],
			recentlyViewed: [],
			addRecentSearch: (q) => {
				const trimmed = q.trim();
				if (!trimmed) return;
				set((s) => ({
					recentSearches: [
						trimmed,
						...s.recentSearches.filter((x) => x !== trimmed),
					].slice(0, MAX_SEARCHES),
				}));
			},
			addRecentlyViewed: (card) =>
				set((s) => ({
					recentlyViewed: [
						card,
						...s.recentlyViewed.filter((c) => c.id !== card.id),
					].slice(0, MAX_VIEWED),
				})),
			clearRecentSearches: () => set({ recentSearches: [] }),
		}),
		{
			name: "ptcgv-recents",
			storage: createJSONStorage(() =>
				typeof window === "undefined"
					? {
							getItem: () => null,
							setItem: () => {},
							removeItem: () => {},
						}
					: localStorage,
			),
			partialize: (s) => ({
				recentSearches: s.recentSearches,
				recentlyViewed: s.recentlyViewed,
			}),
		},
	),
);
