import { beforeEach, expect, test } from "bun:test";
import type { CorpusIndex } from "./corpus-engine";
import { useCorpusRuntime } from "./corpus-runtime-store";

function fakeIndex(tag: string): CorpusIndex {
	// Minimal shape good enough for identity checks — tests never read into it.
	return {
		cards: [],
		byId: new Map(),
		bySet: new Map(),
		tag,
	} as unknown as CorpusIndex;
}

beforeEach(() => {
	useCorpusRuntime.setState({
		indices: {},
		activeRegion: "west",
		loading: {},
		index: null,
	});
});

test("setIndex stores a region's index and the back-compat `index` reflects it", () => {
	const west = fakeIndex("west-1");
	useCorpusRuntime.getState().setIndex("west", west);
	expect(useCorpusRuntime.getState().index).toBe(west);
	expect(useCorpusRuntime.getState().indices.west).toBe(west);
});

test("setActiveRegion + setIndex('asia', ...) makes `index` reflect the asia index", () => {
	const west = fakeIndex("west-1");
	const asia = fakeIndex("asia-1");
	useCorpusRuntime.getState().setIndex("west", west);
	useCorpusRuntime.getState().setActiveRegion("asia");
	useCorpusRuntime.getState().setIndex("asia", asia);
	expect(useCorpusRuntime.getState().activeRegion).toBe("asia");
	expect(useCorpusRuntime.getState().index).toBe(asia);
});

test("setting asia does not drop west", () => {
	const west = fakeIndex("west-1");
	const asia = fakeIndex("asia-1");
	useCorpusRuntime.getState().setIndex("west", west);
	useCorpusRuntime.getState().setIndex("asia", asia);
	expect(useCorpusRuntime.getState().indices.west).toBe(west);
	expect(useCorpusRuntime.getState().indices.asia).toBe(asia);
});

test("index is null (not a west fallback) when activeRegion has no index yet", () => {
	const west = fakeIndex("west-1");
	useCorpusRuntime.getState().setIndex("west", west);
	useCorpusRuntime.getState().setActiveRegion("asia");
	// asia is active but not loaded yet — `index` must be null so a browse grid
	// stays on its correct (asia) SSR seed rather than flashing west content.
	// (A cross-region `?? indices.west` fallback here is the browse bug: it makes
	// CardGridIsland re-query the west index and blank the asia grid on hydration.)
	expect(useCorpusRuntime.getState().index).toBeNull();
});

test("index resolves the asia index once it loads under an active asia region", () => {
	const west = fakeIndex("west-1");
	const asia = fakeIndex("asia-1");
	useCorpusRuntime.getState().setIndex("west", west);
	useCorpusRuntime.getState().setActiveRegion("asia");
	expect(useCorpusRuntime.getState().index).toBeNull(); // not loaded yet
	useCorpusRuntime.getState().setIndex("asia", asia);
	expect(useCorpusRuntime.getState().index).toBe(asia); // now resolves asia
});

test("back-compat setState({ index }) shim writes through to indices.west", () => {
	const west = fakeIndex("shim-west");
	useCorpusRuntime.setState({ index: west });
	expect(useCorpusRuntime.getState().indices.west).toBe(west);
	expect(useCorpusRuntime.getState().index).toBe(west);
});

test("setLoading sets a single region's flag without touching others", () => {
	useCorpusRuntime.getState().setLoading("asia", true);
	expect(useCorpusRuntime.getState().loading.asia).toBe(true);
	expect(useCorpusRuntime.getState().loading.west).toBeUndefined();

	useCorpusRuntime.getState().setLoading("west", true);
	useCorpusRuntime.getState().setLoading("asia", false);
	expect(useCorpusRuntime.getState().loading.west).toBe(true);
	expect(useCorpusRuntime.getState().loading.asia).toBe(false);
});
