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
import {
	allLoadedSets,
	resetSetsCoverageForTests,
	setsForRegion,
} from "./sets-slice";

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

test("allLoadedSets returns an empty array when nothing has loaded", () => {
	expect(allLoadedSets(useStore.getState())).toEqual([]);
});

test("allLoadedSets returns the west list when only west has loaded (via the plain `sets` fallback)", () => {
	useStore.setState({ sets: westSets });
	expect(allLoadedSets(useStore.getState())).toEqual(westSets);
});

test("allLoadedSets merges west + asia and de-dupes by set id", () => {
	useStore.setState({
		sets: westSets,
		setsByRegion: { west: westSets, asia: asiaSets },
	});
	const merged = allLoadedSets(useStore.getState());
	expect(merged).toHaveLength(westSets.length + asiaSets.length);
	expect(merged).toEqual(expect.arrayContaining([...westSets, ...asiaSets]));

	// De-dupe: an asia set sharing an id with a west set collapses to one entry,
	// preferring the west copy (west merged first).
	const overriddenAsia: PokemonSet[] = [{ ...westSets[0], name: "Duplicate" }];
	useStore.setState({
		sets: westSets,
		setsByRegion: { west: westSets, asia: overriddenAsia },
	});
	const deduped = allLoadedSets(useStore.getState());
	expect(deduped).toHaveLength(westSets.length);
	expect(deduped[0]).toBe(westSets[0]);
});

test("allLoadedSets is memoized: stable ref for the same (sets, setsByRegion), fresh ref on change", () => {
	useStore.setState({
		sets: westSets,
		setsByRegion: { west: westSets, asia: asiaSets },
	});
	const a = allLoadedSets(useStore.getState());
	// Same inputs -> same array identity, so consumers can subscribe with a plain
	// useStore(allLoadedSets) (Object.is) and skip re-renders — no useShallow.
	expect(allLoadedSets(useStore.getState())).toBe(a);

	// A write that leaves sets + setsByRegion refs untouched (e.g. a loading-flag
	// toggle) returns the cached array — no spurious re-render.
	useStore.setState({ setsByRegionLoading: { asia: true } });
	expect(allLoadedSets(useStore.getState())).toBe(a);

	// A real sets change (new setsByRegion ref) invalidates the memo.
	useStore.setState({ setsByRegion: { west: westSets } });
	const c = allLoadedSets(useStore.getState());
	expect(c).not.toBe(a);
	expect(c).toEqual(westSets);
});

// --- ensureSetsCoverCorpus: corpus-driven invalidation of the persisted sets
// cache. The "Pitch Black" bug: the corpus blob ETag-revalidates every load
// (fresh) but the persisted sets list sits behind a 7-day TTL, so a brand-new
// set's cards exist in the corpus while its set is missing from the list —
// buildSlugIndex then drops them and every modal tab link silently no-ops.

const freshWestSets: PokemonSet[] = [
	...westSets,
	{
		id: "me05",
		name: "Pitch Black",
		series: "Mega Evolution",
		releaseDate: "2026-07-17",
		total: 120,
		images: {},
	},
];

test("ensureSetsCoverCorpus force-refetches when the corpus references a set missing from the cached list", async () => {
	resetSetsCoverageForTests();
	// Stale-but-"fresh-by-TTL" persisted sets: no me05, fetched just now.
	useStore.setState({ sets: westSets, setsFetchedAt: Date.now() });
	getSetsFnSpy = spyOn(cardData, "getSetsFn").mockResolvedValue(freshWestSets);

	await useStore.getState().ensureSetsCoverCorpus(["base1", "me05"]);

	expect(getSetsFnSpy).toHaveBeenCalledTimes(1);
	expect(useStore.getState().sets).toBe(freshWestSets);
});

test("ensureSetsCoverCorpus is a no-op when every corpus set is already in the list", async () => {
	resetSetsCoverageForTests();
	useStore.setState({ sets: westSets, setsFetchedAt: Date.now() });
	getSetsFnSpy = spyOn(cardData, "getSetsFn").mockResolvedValue(freshWestSets);

	await useStore.getState().ensureSetsCoverCorpus(["base1"]);

	expect(getSetsFnSpy).not.toHaveBeenCalled();
});

test("ensureSetsCoverCorpus refetches once per missing-set signature (no loop when the server also lacks the set)", async () => {
	resetSetsCoverageForTests();
	useStore.setState({ sets: westSets, setsFetchedAt: Date.now() });
	// Server ALSO missing me05: the refetched list still lacks it.
	getSetsFnSpy = spyOn(cardData, "getSetsFn").mockResolvedValue(westSets);

	await useStore.getState().ensureSetsCoverCorpus(["base1", "me05"]);
	await useStore.getState().ensureSetsCoverCorpus(["base1", "me05"]);

	expect(getSetsFnSpy).toHaveBeenCalledTimes(1);
});

test("ensureSetsCoverCorpus is a no-op before the sets list has loaded (initial-load path owns that fetch)", async () => {
	resetSetsCoverageForTests();
	useStore.setState({ sets: null, setsFetchedAt: null });
	getSetsFnSpy = spyOn(cardData, "getSetsFn").mockResolvedValue(freshWestSets);

	await useStore.getState().ensureSetsCoverCorpus(["me05"]);

	expect(getSetsFnSpy).not.toHaveBeenCalled();
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
