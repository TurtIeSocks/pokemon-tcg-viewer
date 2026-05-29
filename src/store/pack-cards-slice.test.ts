import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { create } from "zustand";
import type { HoloCardData } from "../components/holo-card";
import { createPackCardsSlice, type PackCardsSlice } from "./pack-cards-slice";

const sampleCards: HoloCardData[] = [
	{
		id: "base1-1",
		imageUrl: "https://example.invalid/1.png",
		name: "Alakazam",
		setId: "base1",
		setName: "Base",
		setSeries: "Base",
		cardNumber: "1",
	},
];

const fakeGetCardsBySet = mock(async (_setId: string) => ({
	cards: sampleCards,
	totalCount: sampleCards.length,
}));

mock.module("../api", () => ({
	getCardsBySet: fakeGetCardsBySet,
}));

function makeStore() {
	return create<PackCardsSlice>()((set, get, store) =>
		createPackCardsSlice(set, get, store),
	);
}

beforeEach(() => {
	fakeGetCardsBySet.mockClear();
});

afterEach(() => {
	fakeGetCardsBySet.mockClear();
});

describe("PackCardsSlice", () => {
	test("starts with empty packCards, packCardsFetchedAt, packCardsLoading", () => {
		const store = makeStore();
		expect(store.getState().packCards).toEqual({});
		expect(store.getState().packCardsFetchedAt).toEqual({});
		expect(store.getState().packCardsLoading).toEqual({});
	});

	test("loadPackCards(setId) populates the cache after fetch resolves", async () => {
		const store = makeStore();
		await store.getState().loadPackCards("base1");
		expect(store.getState().packCards.base1).toEqual(sampleCards);
		expect(typeof store.getState().packCardsFetchedAt.base1).toBe("number");
		expect(fakeGetCardsBySet).toHaveBeenCalledTimes(1);
	});

	test("loadPackCards is a no-op when the cache is still fresh", async () => {
		const store = makeStore();
		await store.getState().loadPackCards("base1");
		await store.getState().loadPackCards("base1");
		expect(fakeGetCardsBySet).toHaveBeenCalledTimes(1);
	});

	test("loadPackCards is a no-op when a load for the same setId is in flight", async () => {
		const store = makeStore();
		const a = store.getState().loadPackCards("base1");
		const b = store.getState().loadPackCards("base1");
		await Promise.all([a, b]);
		expect(fakeGetCardsBySet).toHaveBeenCalledTimes(1);
	});
});
