import { beforeEach, expect, test } from "bun:test";
import { useCorpusRuntime } from "./store/corpus/corpus-runtime-store";
import { makeCorpusCard, seedCorpus } from "./test-utils";

// Regression guard for a flake that survived months of "unreproducible": the
// store's `index` is derived (`indices[activeRegion] ?? null`), and the
// back-compat `setState({ index })` shim only writes `indices.west`. Seeding
// while `activeRegion` is "asia" therefore derived null and seeded nothing, so
// every component reading `s.index` rendered an empty corpus. `reset()`
// preserves `activeRegion` by design, so a single asia test poisoned every
// later seed in the same process — order-dependent, and so platform-dependent.
// It passed on macOS and failed 7 tests on Linux CI.

beforeEach(() => {
	useCorpusRuntime.getState().reset();
});

test("seedCorpus seeds a readable index from a clean store", () => {
	seedCorpus([makeCorpusCard({ id: "sv1-86", name: "Charizard ex" })]);

	const { index } = useCorpusRuntime.getState();
	expect(index).not.toBeNull();
	expect(index?.byId.get("sv1-86")?.name).toBe("Charizard ex");
});

test("seedCorpus is hermetic when a previous test left activeRegion on asia", () => {
	useCorpusRuntime.getState().setActiveRegion("asia");

	seedCorpus([makeCorpusCard({ id: "sv1-86", name: "Charizard ex" })]);

	// The seed must win. Before the fix this was null and the failure was
	// invisible: nothing threw, components just rendered nothing.
	expect(useCorpusRuntime.getState().index).not.toBeNull();
	expect(useCorpusRuntime.getState().activeRegion).toBe("west");
});

test("seedCorpus can target the asia region explicitly", () => {
	seedCorpus([makeCorpusCard({ id: "sv1a-1", name: "リザードン ex" })], "asia");

	const state = useCorpusRuntime.getState();
	expect(state.activeRegion).toBe("asia");
	expect(state.index?.byId.get("sv1a-1")?.name).toBe("リザードン ex");
});
