import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import {
	loadCorpus,
	makeCorpusFetcher,
	useCorpusRuntime,
} from "./corpus-runtime";
import { clearCorpus } from "./corpus-store";
import type { CorpusCard } from "./corpus-types";

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
	useCorpusRuntime.setState({ index: null, loading: false });
});
afterEach(() => {
	globalThis.fetch = realFetch;
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
	expect(useCorpusRuntime.getState().loading).toBe(true);
	await p;
	expect(useCorpusRuntime.getState().loading).toBe(false);
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
