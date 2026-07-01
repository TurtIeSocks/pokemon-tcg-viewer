import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import {
	ensureRegionForLanguage,
	ensureRegionsForOwned,
	loadCorpus,
	makeCorpusFetcher,
	useCorpusRuntime,
} from "./corpus-runtime";
import { clearCorpus } from "./corpus-store";
import type { CorpusCard } from "./corpus-types";
import { useI18nRuntime } from "./i18n-runtime";

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

test("loadCorpus revalidates a fresh cache and picks up a new build", async () => {
	// First load: corpus build "v1" (1 card), stored in IDB with a recent fetchedAt.
	globalThis.fetch = mock(
		async () =>
			new Response(gzipOf(sample), { status: 200, headers: { ETag: '"v1"' } }),
	) as unknown as typeof fetch;
	await loadCorpus();
	expect(useCorpusRuntime.getState().index?.cards.length).toBe(1);

	// New page load with the SAME (fresh, < 1 day old) IDB cache present, but the
	// server now serves a different build "v2" (2 cards). The cache must not be
	// trusted blindly: loadCorpus must revalidate and converge on the new build,
	// otherwise two browsers on the same URL show different corpora.
	useCorpusRuntime.setState({ index: null });
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
	const f = mock(
		async () =>
			new Response(gzipOf(twoCards), {
				status: 200,
				headers: { ETag: '"v2"' },
			}),
	);
	globalThis.fetch = f as unknown as typeof fetch;
	await loadCorpus();
	expect(f).toHaveBeenCalled(); // revalidated, did not short-circuit on freshness
	expect(useCorpusRuntime.getState().index?.cards.length).toBe(2);
});

test("loadCorpus falls back to the stored blob when offline", async () => {
	globalThis.fetch = mock(
		async () =>
			new Response(gzipOf(sample), { status: 200, headers: { ETag: '"v1"' } }),
	) as unknown as typeof fetch;
	await loadCorpus();
	useCorpusRuntime.setState({ index: null });

	globalThis.fetch = mock(async () => {
		throw new Error("offline");
	}) as unknown as typeof fetch;
	await loadCorpus();
	expect(useCorpusRuntime.getState().index?.cards.length).toBe(1);
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

	await ensureRegionsForOwned(["asia1-1"]);
	expect(f).toHaveBeenCalled();
	expect(useCorpusRuntime.getState().indices.asia?.cards[0]?.id).toBe(
		"asia1-1",
	);
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
