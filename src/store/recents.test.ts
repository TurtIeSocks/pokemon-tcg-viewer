import { beforeEach, describe, expect, it } from "bun:test";
import type { HoloCardData } from "../components/holo-card";
import { useRecentsStore } from "./recents";

const card = (id: string): HoloCardData => ({
	id,
	imageUrl: "",
	name: id,
	supertype: "Pokémon",
	setId: "s",
	setName: "S",
	setSeries: "X",
	cardNumber: "1",
});

beforeEach(() => {
	useRecentsStore.setState({ recentSearches: [], recentlyViewed: [] });
});

describe("addRecentSearch", () => {
	it("dedupes and moves to front, newest-first", () => {
		const { addRecentSearch } = useRecentsStore.getState();
		addRecentSearch("pikachu");
		addRecentSearch("charizard");
		addRecentSearch("pikachu");
		expect(useRecentsStore.getState().recentSearches).toEqual([
			"pikachu",
			"charizard",
		]);
	});
	it("ignores empty / whitespace", () => {
		useRecentsStore.getState().addRecentSearch("   ");
		expect(useRecentsStore.getState().recentSearches).toEqual([]);
	});
	it("caps at 10, newest first", () => {
		const { addRecentSearch } = useRecentsStore.getState();
		for (let i = 0; i < 15; i++) addRecentSearch(`q${i}`);
		const r = useRecentsStore.getState().recentSearches;
		expect(r).toHaveLength(10);
		expect(r[0]).toBe("q14");
	});
});

describe("addRecentlyViewed", () => {
	it("dedupes by id, newest-first", () => {
		const { addRecentlyViewed } = useRecentsStore.getState();
		addRecentlyViewed(card("a"));
		addRecentlyViewed(card("b"));
		addRecentlyViewed(card("a"));
		expect(useRecentsStore.getState().recentlyViewed.map((c) => c.id)).toEqual([
			"a",
			"b",
		]);
	});
	it("caps at 24", () => {
		const { addRecentlyViewed } = useRecentsStore.getState();
		for (let i = 0; i < 30; i++) addRecentlyViewed(card(`c${i}`));
		expect(useRecentsStore.getState().recentlyViewed).toHaveLength(24);
	});
});

describe("clearRecentSearches", () => {
	it("empties searches but keeps viewed", () => {
		const s = useRecentsStore.getState();
		s.addRecentSearch("x");
		s.addRecentlyViewed(card("a"));
		s.clearRecentSearches();
		expect(useRecentsStore.getState().recentSearches).toEqual([]);
		expect(useRecentsStore.getState().recentlyViewed).toHaveLength(1);
	});
});
