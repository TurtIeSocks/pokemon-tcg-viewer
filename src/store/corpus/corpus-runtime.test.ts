import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test";
import type { PokemonSet } from "../../server/card-mappers";
import { useStore } from "../index";
import { buildIndex } from "./corpus-engine";
import {
	CORPUS_REVALIDATE_TTL_MS,
	ensureRegionForLanguage,
	ensureRegionsForOwned,
	loadCorpus,
	makeCorpusFetcher,
	useCorpusRuntime,
} from "./corpus-runtime";
import { clearCorpus } from "./corpus-store";
import type { CorpusCard } from "./corpus-types";

import { useI18nRuntime } from "./i18n-runtime";

/** Fixed clock origin for the revalidation-window tests. */
const T0 = 1_000_000_000;

const realFetch = globalThis.fetch;

function gzipOf(cards: CorpusCard[]): ArrayBuffer {
	const { gzipSync } = require("node:zlib");
	const buf = gzipSync(Buffer.from(JSON.stringify(cards)));
	return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

const sample: CorpusCard[] = [
	{
		id: "base1-4",
		name: "Charizard",
		imageUrl: "a",
		imageUrlSmall: "b",
		supertype: "Pokémon",
		setId: "base1",
		number: "4",
	},
];

beforeEach(async () => {
	await clearCorpus();
	await clearCorpus("asia");
	useCorpusRuntime.setState({
		indices: {},
		activeRegion: "west",
		loading: {},
		index: null,
	});
	// Default to English (no overlay) for every test.
	useI18nRuntime.setState({
		lang: "en",
		namesById: null,
		version: null,
		status: "idle",
	});
	useStore.setState({ sets: null, setsByRegion: {}, setsByRegionLoading: {} });
});
afterEach(() => {
	globalThis.fetch = realFetch;
	useI18nRuntime.setState({
		lang: "en",
		namesById: null,
		version: null,
		status: "idle",
	});
});

test("loadCorpus fetches, stores, and exposes a ready index", async () => {
	const gz = gzipOf(sample);
	globalThis.fetch = mock(
		async () => new Response(gz, { status: 200, headers: { ETag: '"v1"' } }),
	) as unknown as typeof fetch;
	await loadCorpus();
	expect(useCorpusRuntime.getState().index?.cards.length).toBe(1);
});

const twoCards: CorpusCard[] = [
	...sample,
	{
		id: "base1-5",
		name: "Charmeleon",
		imageUrl: "a",
		imageUrlSmall: "b",
		supertype: "Pokémon",
		setId: "base1",
		number: "5",
	},
];

test("loadCorpus skips the network while the stored copy is inside the window", async () => {
	globalThis.fetch = mock(
		async () =>
			new Response(gzipOf(sample), { status: 200, headers: { ETag: '"v1"' } }),
	) as unknown as typeof fetch;
	await loadCorpus();
	expect(useCorpusRuntime.getState().index?.cards.length).toBe(1);

	// Second page load, same hour. This used to cost one conditional GET every
	// time just to be told nothing changed, which was the largest source of
	// worker invocations from real users.
	useCorpusRuntime.setState({ index: null });
	const f = mock(async () => new Response(gzipOf(twoCards), { status: 200 }));
	globalThis.fetch = f as unknown as typeof fetch;

	await loadCorpus();

	expect(f).not.toHaveBeenCalled();
	expect(useCorpusRuntime.getState().index?.cards.length).toBe(1);
});

test("loadCorpus revalidates past the window and picks up a new build", async () => {
	const nowSpy = spyOn(Date, "now").mockReturnValue(T0);
	try {
		globalThis.fetch = mock(
			async () =>
				new Response(gzipOf(sample), {
					status: 200,
					headers: { ETag: '"v1"' },
				}),
		) as unknown as typeof fetch;
		await loadCorpus();
		expect(useCorpusRuntime.getState().index?.cards.length).toBe(1);

		// Past the window the ETag is still the only invalidation signal, so a new
		// build must be adopted. Two browsers may disagree for at most one window,
		// never indefinitely.
		nowSpy.mockReturnValue(T0 + CORPUS_REVALIDATE_TTL_MS + 1);
		useCorpusRuntime.setState({ index: null });
		const f = mock(
			async () =>
				new Response(gzipOf(twoCards), {
					status: 200,
					headers: { ETag: '"v2"' },
				}),
		);
		globalThis.fetch = f as unknown as typeof fetch;

		await loadCorpus();

		expect(f).toHaveBeenCalled();
		expect(useCorpusRuntime.getState().index?.cards.length).toBe(2);
	} finally {
		nowSpy.mockRestore();
	}
});

test("a settings Refresh still reaches the network inside the window", async () => {
	globalThis.fetch = mock(
		async () =>
			new Response(gzipOf(sample), { status: 200, headers: { ETag: '"v1"' } }),
	) as unknown as typeof fetch;
	await loadCorpus();

	// What the Refresh button does: clearCorpus drops the stored blob AND its
	// meta, so the freshness gate has nothing to short-circuit on. Without this
	// the button would silently do nothing for an hour.
	await clearCorpus();
	useCorpusRuntime.setState({ index: null });
	const f = mock(
		async () =>
			new Response(gzipOf(twoCards), {
				status: 200,
				headers: { ETag: '"v2"' },
			}),
	);
	globalThis.fetch = f as unknown as typeof fetch;

	await loadCorpus();

	expect(f).toHaveBeenCalled();
	expect(useCorpusRuntime.getState().index?.cards.length).toBe(2);
});

test("loadCorpus falls back to the stored blob when offline", async () => {
	// Past the revalidation window on purpose. Inside it the freshness gate
	// short-circuits before any fetch, so this would pass without ever
	// exercising the offline path it exists to cover.
	const nowSpy = spyOn(Date, "now").mockReturnValue(T0);
	try {
		globalThis.fetch = mock(
			async () =>
				new Response(gzipOf(sample), {
					status: 200,
					headers: { ETag: '"v1"' },
				}),
		) as unknown as typeof fetch;
		await loadCorpus();
		useCorpusRuntime.setState({ index: null });
		nowSpy.mockReturnValue(T0 + CORPUS_REVALIDATE_TTL_MS + 1);

		const f = mock(async () => {
			throw new Error("offline");
		});
		globalThis.fetch = f as unknown as typeof fetch;
		await loadCorpus();

		expect(f).toHaveBeenCalled();
		expect(useCorpusRuntime.getState().index?.cards.length).toBe(1);
	} finally {
		nowSpy.mockRestore();
	}
});

test("makeCorpusFetcher returns a paginated CardFetcher over the index", async () => {
	globalThis.fetch = mock(
		async () =>
			new Response(gzipOf(sample), { status: 200, headers: { ETag: '"v1"' } }),
	) as unknown as typeof fetch;
	await loadCorpus();

	const fetcher = makeCorpusFetcher({ query: "char", relevance: true });
	const { cards, totalCount } = await fetcher("char", 1, 20);
	expect(totalCount).toBe(1);
	expect(cards[0].id).toBe("base1-4");
});

test("loadCorpus toggles the loading flag (true during, false after)", async () => {
	globalThis.fetch = mock(
		async () =>
			new Response(gzipOf(sample), { status: 200, headers: { ETag: '"v1"' } }),
	) as unknown as typeof fetch;
	const p = loadCorpus();
	expect(useCorpusRuntime.getState().loading.west).toBe(true);
	await p;
	expect(useCorpusRuntime.getState().loading.west).toBe(false);
	expect(useCorpusRuntime.getState().index).not.toBeNull();
});

test("makeCorpusFetcher owned filter keeps only owned / only missing", async () => {
	globalThis.fetch = mock(
		async () =>
			new Response(
				gzipOf([
					{
						id: "base1-1",
						name: "A",
						imageUrl: "",
						imageUrlSmall: "",
						supertype: "P",
						setId: "base1",
						number: "1",
					},
					{
						id: "base1-2",
						name: "B",
						imageUrl: "",
						imageUrlSmall: "",
						supertype: "P",
						setId: "base1",
						number: "2",
					},
				]),
				{ status: 200, headers: { ETag: '"v2"' } },
			),
	) as unknown as typeof fetch;
	await loadCorpus();
	const owned = new Set(["base1-1"]);
	const f1 = makeCorpusFetcher(
		{ setId: "base1", relevance: false },
		{ mode: "owned", ownedCardIds: owned },
	);
	expect((await f1("k-owned", 1, 20)).cards.map((c) => c.id)).toEqual([
		"base1-1",
	]);
	const f2 = makeCorpusFetcher(
		{ setId: "base1", relevance: false },
		{ mode: "missing", ownedCardIds: owned },
	);
	expect((await f2("k-missing", 1, 20)).cards.map((c) => c.id)).toEqual([
		"base1-2",
	]);
});

test("makeCorpusFetcher localizes names from the active i18n overlay and re-derives on switch", async () => {
	globalThis.fetch = mock(
		async () =>
			new Response(gzipOf(sample), { status: 200, headers: { ETag: '"v1"' } }),
	) as unknown as typeof fetch;
	await loadCorpus();

	const fetcher = makeCorpusFetcher({ setId: "base1", relevance: false });
	// English (no overlay): the baked EN name.
	expect((await fetcher("k", 1, 20)).cards[0].name).toBe("Charizard");

	// Switch to a French overlay; the cache key folds in the language so the same
	// query string re-derives instead of serving the cached EN row.
	useI18nRuntime.setState({
		lang: "fr",
		namesById: new Map([["base1-4", "Dracaufeu"]]),
		version: "frv1",
		status: "ready",
	});
	expect((await fetcher("k", 1, 20)).cards[0].name).toBe("Dracaufeu");
});

const asiaSample: CorpusCard[] = [
	{
		id: "asia1-1",
		name: "Fushigidane",
		imageUrl: "a",
		imageUrlSmall: "b",
		supertype: "Pokémon",
		setId: "asia1",
		number: "1",
	},
];

test("loadCorpus('asia') fetches /corpus-region/asia and populates indices.asia, leaving west untouched", async () => {
	const westGz = gzipOf(sample);
	const asiaGz = gzipOf(asiaSample);
	const f = mock(async (url: string) => {
		if (url.includes("/corpus-region/asia")) {
			return new Response(asiaGz, { status: 200, headers: { ETag: '"a1"' } });
		}
		return new Response(westGz, { status: 200, headers: { ETag: '"w1"' } });
	});
	globalThis.fetch = f as unknown as typeof fetch;

	await loadCorpus("west");
	await loadCorpus("asia");

	const calledUrls = f.mock.calls.map((c) => String(c[0]));
	expect(calledUrls.some((u) => u.endsWith("/corpus-region/asia"))).toBe(true);
	expect(
		calledUrls.some((u) => u.endsWith("/corpus") && !u.includes("region")),
	).toBe(true);

	expect(useCorpusRuntime.getState().indices.asia?.cards[0]?.id).toBe(
		"asia1-1",
	);
	expect(useCorpusRuntime.getState().indices.west?.cards[0]?.id).toBe(
		"base1-4",
	);
});

test("loadCorpus('asia') twice in a row only fetches asia once (second call is a no-op)", async () => {
	const asiaGz = gzipOf(asiaSample);
	const f = mock(
		async () =>
			new Response(asiaGz, { status: 200, headers: { ETag: '"a1"' } }),
	);
	globalThis.fetch = f as unknown as typeof fetch;

	await loadCorpus("asia");
	expect(f).toHaveBeenCalledTimes(1);
	await loadCorpus("asia");
	// Already loaded (indices.asia populated) — no additional network call.
	expect(f).toHaveBeenCalledTimes(1);
});

test("loadCorpus() with no args still hits /corpus (west)", async () => {
	const f = mock(
		async (_url: string) =>
			new Response(gzipOf(sample), { status: 200, headers: { ETag: '"v1"' } }),
	);
	globalThis.fetch = f as unknown as typeof fetch;
	await loadCorpus();
	const url = String(f.mock.calls[0]?.[0]);
	expect(url.endsWith("/corpus")).toBe(true);
	expect(url.includes("region")).toBe(false);
	expect(useCorpusRuntime.getState().indices.west?.cards.length).toBe(1);
});

test("loadCorpus can load west and asia concurrently without one blocking the other", async () => {
	const westGz = gzipOf(sample);
	const asiaGz = gzipOf(asiaSample);
	const f = mock(async (url: string) => {
		if (url.includes("/corpus-region/asia")) {
			return new Response(asiaGz, { status: 200, headers: { ETag: '"a1"' } });
		}
		return new Response(westGz, { status: 200, headers: { ETag: '"w1"' } });
	});
	globalThis.fetch = f as unknown as typeof fetch;

	await Promise.all([loadCorpus("west"), loadCorpus("asia")]);

	expect(useCorpusRuntime.getState().indices.west?.cards[0]?.id).toBe(
		"base1-4",
	);
	expect(useCorpusRuntime.getState().indices.asia?.cards[0]?.id).toBe(
		"asia1-1",
	);
});

test("ensureRegionForLanguage loads the asia corpus for an asian language", async () => {
	const asiaGz = gzipOf(asiaSample);
	const f = mock(
		async () =>
			new Response(asiaGz, { status: 200, headers: { ETag: '"a1"' } }),
	);
	globalThis.fetch = f as unknown as typeof fetch;

	await ensureRegionForLanguage("ja");
	expect(useCorpusRuntime.getState().indices.asia?.cards[0]?.id).toBe(
		"asia1-1",
	);
});

test("ensureRegionForLanguage loads the west corpus for a western language", async () => {
	const f = mock(
		async () =>
			new Response(gzipOf(sample), { status: 200, headers: { ETag: '"v1"' } }),
	);
	globalThis.fetch = f as unknown as typeof fetch;

	await ensureRegionForLanguage("fr");
	expect(useCorpusRuntime.getState().indices.west?.cards[0]?.id).toBe(
		"base1-4",
	);
});

test("ensureRegionsForOwned triggers an asia load when an owned id is unresolved in west", async () => {
	// west loaded, but does NOT contain the owned id below.
	globalThis.fetch = mock(
		async () =>
			new Response(gzipOf(sample), { status: 200, headers: { ETag: '"v1"' } }),
	) as unknown as typeof fetch;
	await loadCorpus("west");

	const asiaGz = gzipOf(asiaSample);
	const f = mock(
		async () =>
			new Response(asiaGz, { status: 200, headers: { ETag: '"a1"' } }),
	);
	globalThis.fetch = f as unknown as typeof fetch;

	// Stub loadSetsForRegion: it delegates to getSetsFn, a createServerFn wrapper
	// that can't be invoked directly outside the TanStack Start server runtime
	// (throws "No Start context found in AsyncLocalStorage" -- same constraint
	// documented in server/corpus-server.test.ts). The region-load ALSO calling
	// loadSetsForRegion("asia") is asserted via this spy instead.
	const loadSetsForRegionSpy = spyOn(
		useStore.getState(),
		"loadSetsForRegion",
	).mockResolvedValue(undefined);

	await ensureRegionsForOwned(["asia1-1"]);
	expect(f).toHaveBeenCalled();
	expect(useCorpusRuntime.getState().indices.asia?.cards[0]?.id).toBe(
		"asia1-1",
	);
	expect(loadSetsForRegionSpy).toHaveBeenCalledWith("asia");
	loadSetsForRegionSpy.mockRestore();
});

test("ensureRegionsForOwned is a no-op when every owned id resolves in west", async () => {
	globalThis.fetch = mock(
		async () =>
			new Response(gzipOf(sample), { status: 200, headers: { ETag: '"v1"' } }),
	) as unknown as typeof fetch;
	await loadCorpus("west");

	const f = mock(async () => {
		throw new Error("should not be called");
	});
	globalThis.fetch = f as unknown as typeof fetch;

	await ensureRegionsForOwned(["base1-4"]);
	expect(f).not.toHaveBeenCalled();
	expect(useCorpusRuntime.getState().indices.asia).toBeUndefined();
});

test("ensureRegionsForOwned does NOT load asia before the west baseline is present", async () => {
	// west index unloaded: a naive `!byId?.has(id)` would treat the first owned id
	// as unresolved and eagerly download the large Asian corpus for every user.
	const f = mock(async () => {
		throw new Error("should not fetch asia before west is loaded");
	});
	globalThis.fetch = f as unknown as typeof fetch;

	await ensureRegionsForOwned(["asia1-1"]);
	expect(f).not.toHaveBeenCalled();
	expect(useCorpusRuntime.getState().indices.asia).toBeUndefined();
});

// --- Region-aware client sets (asian-catalog fix E) -------------------------

const asiaSet: PokemonSet = {
	id: "asia1",
	name: "Expansion Pack",
	series: "Original Era",
	releaseDate: "1996-10-20",
	total: 1,
	images: {},
};

const westSet: PokemonSet = {
	id: "base1",
	name: "Base Set",
	series: "Base",
	releaseDate: "1999-01-09",
	total: 1,
	images: {},
};

test("makeCorpusFetcher hydrates asia cards with the real asia set name once asia sets are loaded, and a year filter keeps them", async () => {
	useCorpusRuntime.getState().setIndex("asia", buildIndex(asiaSample, "asia"));
	useCorpusRuntime.getState().setActiveRegion("asia");
	// Simulate loadSetsForRegion("asia") having populated the region-keyed cache
	// (west `sets` stays whatever it was -- untouched by an asia load).
	useStore.setState((s) => ({
		setsByRegion: { ...s.setsByRegion, asia: [asiaSet] },
	}));

	const fetcher = makeCorpusFetcher({ relevance: false, yearMin: 1990 });
	const { cards, totalCount } = await fetcher("k", 1, 20);
	expect(totalCount).toBe(1);
	expect(cards[0].id).toBe("asia1-1");
	// Real set name/series, not the raw set-id fallback ("asia1", "").
	expect(cards[0].setName).toBe("Expansion Pack");
	expect(cards[0].setSeries).toBe("Original Era");

	// A year filter that would exclude the card if setsForRegion returned
	// undefined (Number(undefined) => NaN, always excluded) instead keeps it,
	// because the release year (1996) resolves from the loaded asia set.
	const excluded = await makeCorpusFetcher({
		relevance: false,
		yearMin: 2000,
	})("k2", 1, 20);
	expect(excluded.totalCount).toBe(0);
});

test("makeCorpusFetcher falls back to raw setId + drops the card from a year filter when asia sets have NOT loaded yet (pre-fix regression guard)", async () => {
	useCorpusRuntime.getState().setIndex("asia", buildIndex(asiaSample, "asia"));
	useCorpusRuntime.getState().setActiveRegion("asia");
	// No asia sets loaded at all -- setsForRegion("asia") is undefined.

	const fetcher = makeCorpusFetcher({ relevance: false });
	const { cards } = await fetcher("k", 1, 20);
	expect(cards[0].setName).toBe("asia1"); // raw set id fallback
	expect(cards[0].setSeries).toBe("");

	const yearFiltered = await makeCorpusFetcher({
		relevance: false,
		yearMin: 1990,
	})("k2", 1, 20);
	// Number(undefined) => NaN => excluded, even though 1996 would pass.
	expect(yearFiltered.totalCount).toBe(0);
});

test("makeCorpusFetcher still reads west sets when activeRegion is west (unchanged)", async () => {
	useCorpusRuntime.getState().setIndex("west", buildIndex(sample, "west"));
	useStore.setState({ sets: [westSet], setsByRegion: { west: [westSet] } });

	const fetcher = makeCorpusFetcher({ relevance: false });
	const { cards } = await fetcher("k", 1, 20);
	expect(cards[0].setName).toBe("Base Set");
	expect(cards[0].setSeries).toBe("Base");
});

// --- ensureSetsCoverageWhenReady: the sets-coverage check must survive the
// corpus-load-vs-store-rehydration race. In prod the corpus load completed
// while the persisted sets slice was still rehydrating from IDB (sets===null),
// so a coverage check that only runs at corpus-load time silently skips and
// never re-runs — dead modal tabs for the new set persist all session.

import * as cardDataMod from "../../server/card-data";
import { resetSetsCoverageForTests } from "../sets-slice";
import { ensureSetsCoverageWhenReady } from "./corpus-runtime";

const staleSets: PokemonSet[] = [
	{
		id: "base1",
		name: "Base Set",
		series: "Base",
		releaseDate: "1999-01-09",
		total: 102,
		images: {},
	},
];
const freshSets: PokemonSet[] = [
	...staleSets,
	{
		id: "me05",
		name: "Pitch Black",
		series: "Mega Evolution",
		releaseDate: "2026-07-17",
		total: 120,
		images: {},
	},
];

test("ensureSetsCoverageWhenReady refetches immediately when sets are already loaded and stale", async () => {
	resetSetsCoverageForTests();
	useStore.setState({ sets: staleSets, setsFetchedAt: Date.now() });
	const spy = spyOn(cardDataMod, "getSetsFn").mockResolvedValue(freshSets);

	ensureSetsCoverageWhenReady(new Set(["base1", "me05"]));
	await new Promise((r) => setTimeout(r, 0));

	expect(spy).toHaveBeenCalledTimes(1);
	expect(useStore.getState().sets).toBe(freshSets);
	spy.mockRestore();
});

test("ensureSetsCoverageWhenReady defers until the persisted sets rehydrate, then refetches", async () => {
	resetSetsCoverageForTests();
	useStore.setState({ sets: null, setsFetchedAt: null });
	const spy = spyOn(cardDataMod, "getSetsFn").mockResolvedValue(freshSets);

	ensureSetsCoverageWhenReady(new Set(["base1", "me05"]));
	await new Promise((r) => setTimeout(r, 0));
	expect(spy).not.toHaveBeenCalled(); // nothing to compare yet

	// Rehydration lands: stale list, recent stamp (the exact prod state).
	useStore.setState({ sets: staleSets, setsFetchedAt: Date.now() });
	await new Promise((r) => setTimeout(r, 0));

	expect(spy).toHaveBeenCalledTimes(1);
	expect(useStore.getState().sets).toBe(freshSets);
	spy.mockRestore();
});

test("ensureSetsCoverageWhenReady deferred path is a no-op when the rehydrated list already covers the corpus", async () => {
	resetSetsCoverageForTests();
	useStore.setState({ sets: null, setsFetchedAt: null });
	const spy = spyOn(cardDataMod, "getSetsFn").mockResolvedValue(freshSets);

	ensureSetsCoverageWhenReady(new Set(["base1"]));
	useStore.setState({ sets: staleSets, setsFetchedAt: Date.now() });
	await new Promise((r) => setTimeout(r, 0));

	expect(spy).not.toHaveBeenCalled();
	spy.mockRestore();
});
