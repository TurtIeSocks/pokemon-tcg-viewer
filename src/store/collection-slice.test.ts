import { describe, expect, test } from "bun:test";
import { create } from "zustand";
import type { HoloCardData } from "../components/holo-card";
import {
	type CollectionSlice,
	createCollectionSlice,
} from "./collection-slice";

function makeStore() {
	return create<CollectionSlice>()((set, get, store) =>
		createCollectionSlice(set, get, store),
	);
}

function fixture(
	id: string,
	overrides: Partial<HoloCardData> = {},
): HoloCardData {
	return {
		id,
		imageUrl: `https://example.invalid/${id}.png`,
		name: overrides.name ?? "Test",
		setId: overrides.setId ?? "base1",
		setName: overrides.setName ?? "Base",
		setSeries: overrides.setSeries ?? "Base",
		setReleaseDate: overrides.setReleaseDate,
		cardNumber: overrides.cardNumber ?? "1",
		...overrides,
	};
}

describe("CollectionSlice", () => {
	test("starts with empty owned map", () => {
		const store = makeStore();
		expect(store.getState().owned).toEqual({});
	});

	test("addToCollection adds card with count 1 and addedAt timestamp", () => {
		const store = makeStore();
		const card = fixture("base1-58");
		store.getState().addToCollection(card);
		const entry = store.getState().owned["base1-58"];
		expect(entry).toBeDefined();
		expect(entry.card).toEqual(card);
		expect(entry.count).toBe(1);
		expect(typeof entry.addedAt).toBe("number");
	});

	test("addToCollection is idempotent — second add is a no-op", () => {
		const store = makeStore();
		const card = fixture("base1-58");
		store.getState().addToCollection(card);
		const firstAddedAt = store.getState().owned["base1-58"].addedAt;
		store.getState().addToCollection(card);
		const entry = store.getState().owned["base1-58"];
		expect(entry.count).toBe(1);
		expect(entry.addedAt).toBe(firstAddedAt);
	});

	test("removeFromCollection deletes the entry", () => {
		const store = makeStore();
		store.getState().addToCollection(fixture("base1-58"));
		store.getState().removeFromCollection("base1-58");
		expect(store.getState().owned["base1-58"]).toBeUndefined();
	});

	test("removeFromCollection on absent id is a no-op", () => {
		const store = makeStore();
		store.getState().removeFromCollection("never-added");
		expect(store.getState().owned).toEqual({});
	});

	test("clearCollection empties the map", () => {
		const store = makeStore();
		store.getState().addToCollection(fixture("a"));
		store.getState().addToCollection(fixture("b"));
		store.getState().clearCollection();
		expect(store.getState().owned).toEqual({});
	});
});
