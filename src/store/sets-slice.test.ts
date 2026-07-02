// src/store/sets-slice.test.ts
//
// getSetsFn is a createServerFn wrapper -- it can't be invoked directly outside
// the TanStack Start server runtime (throws "No Start context found in
// AsyncLocalStorage"; confirmed experimentally, same constraint documented in
// server/corpus-server.test.ts). So loadSetsForRegion's network path is
// exercised via spyOn on the card-data module (spyOn, never mock.module --
// module mocks leak across Bun test files; see lib/billing/entitlement.test.ts).

import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import * as cardData from "../server/card-data";
import type { PokemonSet } from "../server/card-mappers";
import { useStore } from "./index";
import { setsForRegion } from "./sets-slice";

const westSets: PokemonSet[] = [
	{
		id: "base1",
		name: "Base",
		series: "Base",
		releaseDate: "1999-01-09",
		total: 102,
		images: {},
	},
];

const asiaSets: PokemonSet[] = [
	{
		id: "sv1a",
		name: "Shiny Treasure ex",
		series: "Scarlet & Violet",
		releaseDate: "2023-12-01",
		total: 1,
		images: {},
	},
];

let getSetsFnSpy: ReturnType<typeof spyOn> | undefined;

beforeEach(() => {
	useStore.setState({
		sets: null,
		setsFetchedAt: null,
		setsLoading: false,
		setsByRegion: {},
		setsByRegionLoading: {},
	});
});

afterEach(() => {
	getSetsFnSpy?.mockRestore();
	getSetsFnSpy = undefined;
});

test("setsForRegion falls back to the plain `sets` field for west when setsByRegion.west is unset", () => {
	useStore.setState({ sets: westSets });
	expect(setsForRegion(useStore.getState(), "west")).toBe(westSets);
});

test("setsForRegion returns undefined for asia when nothing has loaded", () => {
	expect(setsForRegion(useStore.getState(), "asia")).toBeUndefined();
});

test("setsForRegion prefers the region-keyed cache over the plain `sets` field", () => {
	const otherWestSets: PokemonSet[] = [{ ...westSets[0], name: "Overridden" }];
	useStore.setState({ sets: westSets, setsByRegion: { west: otherWestSets } });
	expect(setsForRegion(useStore.getState(), "west")).toBe(otherWestSets);
});

test("loadSetsForRegion('west') delegates to loadSets and mirrors into setsByRegion.west", async () => {
	getSetsFnSpy = spyOn(cardData, "getSetsFn").mockResolvedValue(westSets);
	await useStore.getState().loadSetsForRegion("west");
	expect(useStore.getState().sets).toBe(westSets);
	expect(useStore.getState().setsByRegion.west).toBe(westSets);
});

test("loadSetsForRegion('asia') fetches with the asia base language and populates setsByRegion.asia, leaving west untouched", async () => {
	useStore.setState({ sets: westSets, setsByRegion: { west: westSets } });
	getSetsFnSpy = spyOn(cardData, "getSetsFn").mockResolvedValue(asiaSets);

	await useStore.getState().loadSetsForRegion("asia");

	expect(getSetsFnSpy).toHaveBeenCalledWith({ data: { lang: "ja" } });
	expect(useStore.getState().setsByRegion.asia).toBe(asiaSets);
	// West is untouched by an asia load.
	expect(useStore.getState().sets).toBe(westSets);
	expect(useStore.getState().setsByRegion.west).toBe(westSets);
});

test("loadSetsForRegion('asia') is idempotent: a second call is a no-op once asia sets are cached", async () => {
	getSetsFnSpy = spyOn(cardData, "getSetsFn").mockResolvedValue(asiaSets);
	await useStore.getState().loadSetsForRegion("asia");
	expect(getSetsFnSpy).toHaveBeenCalledTimes(1);

	await useStore.getState().loadSetsForRegion("asia");
	expect(getSetsFnSpy).toHaveBeenCalledTimes(1);
});

test("loadSetsForRegion('asia') de-dupes concurrent calls onto one in-flight request", async () => {
	let resolve: (v: PokemonSet[]) => void = () => {};
	const pending = new Promise<PokemonSet[]>((r) => {
		resolve = r;
	});
	getSetsFnSpy = spyOn(cardData, "getSetsFn").mockReturnValue(pending);

	const p1 = useStore.getState().loadSetsForRegion("asia");
	const p2 = useStore.getState().loadSetsForRegion("asia");
	resolve(asiaSets);
	await Promise.all([p1, p2]);

	expect(getSetsFnSpy).toHaveBeenCalledTimes(1);
	expect(useStore.getState().setsByRegion.asia).toBe(asiaSets);
});
