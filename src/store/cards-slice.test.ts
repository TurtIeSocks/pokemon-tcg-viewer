import { describe, expect, test } from "bun:test";
import { create } from "zustand";
import type { HoloCardData } from "../components/holo-card";
import { type CardsSlice, createCardsSlice } from "./cards-slice";

function card(id: string): HoloCardData {
	return {
		id,
		imageUrl: `https://img/${id}.png`,
		name: id,
		setId: "base1",
		setName: "Base",
		setSeries: "Base",
		cardNumber: id,
	};
}

function makeStore() {
	return create<CardsSlice>()((set, get, store) =>
		createCardsSlice(set, get, store),
	);
}

describe("cards-slice", () => {
	test("starts empty", () => {
		const s = makeStore().getState();
		expect(s.cardsCache).toEqual({});
		expect(s.cardsCacheOrder).toEqual([]);
	});

	test("page 1 seeds the entry", () => {
		const store = makeStore();
		store.getState().appendCardsPage("k", [card("a"), card("b")], 1, 5, 1000);
		const e = store.getState().cardsCache.k;
		expect(e.cards.map((c) => c.id)).toEqual(["a", "b"]);
		expect(e.page).toBe(1);
		expect(e.totalCount).toBe(5);
		expect(e.fetchedAt).toBe(1000);
	});

	test("later pages append and dedup by id", () => {
		const store = makeStore();
		store.getState().appendCardsPage("k", [card("a"), card("b")], 1, 5, 1000);
		store.getState().appendCardsPage("k", [card("b"), card("c")], 2, 5, 2000);
		const e = store.getState().cardsCache.k;
		expect(e.cards.map((c) => c.id)).toEqual(["a", "b", "c"]);
		expect(e.page).toBe(2);
	});

	test("SWR revalidate (page 1, same totalCount) keeps accumulated pages, refreshes timestamp", () => {
		const store = makeStore();
		store.getState().appendCardsPage("k", [card("a"), card("b")], 1, 5, 1000);
		store.getState().appendCardsPage("k", [card("c")], 2, 5, 1500);
		// Revalidation refetches page 1 only:
		store.getState().appendCardsPage("k", [card("a"), card("b")], 1, 5, 9000);
		const e = store.getState().cardsCache.k;
		expect(e.cards.map((c) => c.id)).toEqual(["a", "b", "c"]); // not truncated
		expect(e.fetchedAt).toBe(9000);
		expect(e.page).toBe(2);
	});

	test("page 1 with a changed totalCount resets the entry", () => {
		const store = makeStore();
		store.getState().appendCardsPage("k", [card("a"), card("b")], 1, 5, 1000);
		store.getState().appendCardsPage("k", [card("c")], 2, 5, 1500);
		store.getState().appendCardsPage("k", [card("x"), card("y")], 1, 9, 2000);
		const e = store.getState().cardsCache.k;
		expect(e.cards.map((c) => c.id)).toEqual(["x", "y"]);
		expect(e.totalCount).toBe(9);
		expect(e.page).toBe(1);
	});

	test("LRU evicts the oldest key past the 50-key cap", () => {
		const store = makeStore();
		for (let i = 0; i < 51; i++) {
			store.getState().appendCardsPage(`k${i}`, [card(`c${i}`)], 1, 1, i);
		}
		const cache = store.getState().cardsCache;
		expect(cache.k0).toBeUndefined(); // evicted
		expect(cache.k50).toBeDefined();
		expect(store.getState().cardsCacheOrder.length).toBe(50);
	});

	test("touchCardsKey moves an existing key to most-recent", () => {
		const store = makeStore();
		store.getState().appendCardsPage("a", [card("a")], 1, 1, 1);
		store.getState().appendCardsPage("b", [card("b")], 1, 1, 2);
		store.getState().touchCardsKey("a");
		expect(store.getState().cardsCacheOrder).toEqual(["b", "a"]);
	});
});
