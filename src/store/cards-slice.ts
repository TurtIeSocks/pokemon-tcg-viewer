import type { StateCreator } from "zustand";
import type { HoloCardData } from "../components/holo-card";

// Bound IndexedDB growth: keep the 50 most-recently-used grid keys.
const MAX_CARDS_KEYS = 50;

export interface CardsCacheEntry {
	cards: HoloCardData[];
	page: number;
	totalCount: number;
	fetchedAt: number;
}

export interface CardsSlice {
	cardsCache: Record<string, CardsCacheEntry>;
	/** LRU order, most-recently-used last. */
	cardsCacheOrder: string[];
	/**
	 * Merge a fetched page into the cache.
	 * - page <= 1 + same totalCount + existing → SWR no-op: keep accumulated
	 *   cards, just refresh `fetchedAt`.
	 * - page <= 1 otherwise → (re)seed the entry from this page.
	 * - page > 1 → append, deduping by id.
	 */
	appendCardsPage: (
		key: string,
		cards: HoloCardData[],
		page: number,
		totalCount: number,
		fetchedAt: number,
	) => void;
	/** Mark a key as most-recently-used without changing its data. */
	touchCardsKey: (key: string) => void;
}

export const createCardsSlice: StateCreator<CardsSlice> = (set) => ({
	cardsCache: {},
	cardsCacheOrder: [],

	appendCardsPage: (key, cards, page, totalCount, fetchedAt) =>
		set((s) => {
			const existing = s.cardsCache[key];

			let entry: CardsCacheEntry;
			if (page <= 1 && existing && existing.totalCount === totalCount) {
				// SWR revalidate, nothing changed upstream → preserve loaded pages.
				entry = { ...existing, fetchedAt };
			} else if (page <= 1) {
				// Fresh load or totalCount changed → reseed from page 1.
				const seen = new Set<string>();
				const deduped = cards.filter((c) => !seen.has(c.id) && seen.add(c.id));
				entry = { cards: deduped, page: 1, totalCount, fetchedAt };
			} else {
				const base = existing ?? {
					cards: [],
					page: 0,
					totalCount,
					fetchedAt,
				};
				const seen = new Set(base.cards.map((c) => c.id));
				const deduped = cards.filter((c) => !seen.has(c.id));
				entry = {
					cards: [...base.cards, ...deduped],
					page: Math.max(base.page, page),
					totalCount,
					fetchedAt,
				};
			}

			const order = [...s.cardsCacheOrder.filter((k) => k !== key), key];
			const cache = { ...s.cardsCache, [key]: entry };
			while (order.length > MAX_CARDS_KEYS) {
				const evicted = order.shift();
				if (evicted) delete cache[evicted];
			}
			return { cardsCache: cache, cardsCacheOrder: order };
		}),

	touchCardsKey: (key) =>
		set((s) => {
			if (!s.cardsCache[key]) return {};
			return {
				cardsCacheOrder: [...s.cardsCacheOrder.filter((k) => k !== key), key],
			};
		}),
});
