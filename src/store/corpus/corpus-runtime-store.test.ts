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

test("index falls back to indices.west when activeRegion has no index yet", () => {
	const west = fakeIndex("west-1");
	useCorpusRuntime.getState().setIndex("west", west);
	useCorpusRuntime.getState().setActiveRegion("asia");
	// asia has no index set — back-compat `index` falls back to west.
	expect(useCorpusRuntime.getState().index).toBe(west);
});

test("back-compat setState({ index }) shim writes through to indices.west", () => {
	const west = fakeIndex("shim-west");
	useCorpusRuntime.setState({ index: west });
	expect(useCorpusRuntime.getState().indices.west).toBe(west);
	expect(useCorpusRuntime.getState().index).toBe(west);
});

test("back-compat setState({ loading }) shim writes through to loading.west", () => {
	useCorpusRuntime.setState({ loading: true });
	expect(useCorpusRuntime.getState().loading.west).toBe(true);
});
