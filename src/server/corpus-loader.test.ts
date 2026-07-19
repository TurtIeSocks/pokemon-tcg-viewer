import {
	afterEach,
	beforeEach,
	describe,
	expect,
	mock,
	spyOn,
	test,
} from "bun:test";
import { gzipSync } from "node:zlib";
import type { CorpusCard } from "../store/corpus/corpus-types";
import {
	decodeCorpusGz,
	queryCorpusServer,
	resetServerCorpusForTests,
	SERVER_CORPUS_TTL_MS,
} from "./corpus-loader";

// This file assigns `globalThis.fetch` directly (a bun mock has no auto-restore
// the way spyOn does). Restore the real fetch after every test so the mock —
// and its recorded calls — never leak into later test files.
const realFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = realFetch;
});

const cards: CorpusCard[] = [
	{
		id: "swsh9-1",
		name: "Exeggcute",
		imageUrl: "l",
		imageUrlSmall: "s",
		supertype: "Pokémon",
		setId: "swsh9",
		number: "1",
	},
];

describe("decodeCorpusGz", () => {
	test("gunzips + parses a CorpusCard[] blob", () => {
		const gz = gzipSync(Buffer.from(JSON.stringify(cards)));
		const out = decodeCorpusGz(
			gz.buffer.slice(gz.byteOffset, gz.byteOffset + gz.byteLength),
		);
		expect(out).toHaveLength(1);
		expect(out[0].name).toBe("Exeggcute");
	});
});

const asiaCards: CorpusCard[] = [
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

function gzipOf(list: CorpusCard[]): ArrayBuffer {
	const gz = gzipSync(Buffer.from(JSON.stringify(list)));
	return gz.buffer.slice(gz.byteOffset, gz.byteOffset + gz.byteLength);
}

describe("queryCorpusServer region memoization", () => {
	test("region 'asia' fetches /corpus-region/asia and memoizes separately from west", async () => {
		const westGz = gzipOf(cards);
		const asiaGz = gzipOf(asiaCards);
		const f = mock(async (url: string) => {
			if (url.includes("/corpus-region/asia")) {
				return new Response(asiaGz, { status: 200 });
			}
			if (url.includes("/sets")) {
				return new Response(JSON.stringify([]), { status: 200 });
			}
			return new Response(westGz, { status: 200 });
		});
		globalThis.fetch = f as unknown as typeof fetch;

		const west1 = await queryCorpusServer(
			{ setId: null, relevance: false },
			"west",
		);
		const west2 = await queryCorpusServer(
			{ setId: null, relevance: false },
			"west",
		);
		const asia1 = await queryCorpusServer(
			{ setId: null, relevance: false },
			"asia",
		);
		const asia2 = await queryCorpusServer(
			{ setId: null, relevance: false },
			"asia",
		);

		expect(west1[0]?.id).toBe("swsh9-1");
		expect(west2[0]?.id).toBe("swsh9-1");
		expect(asia1[0]?.id).toBe("asia1-1");
		expect(asia2[0]?.id).toBe("asia1-1");

		const corpusCalls = f.mock.calls
			.map((c) => String(c[0]))
			.filter((u) => u.includes("/corpus"));
		const westHits = corpusCalls.filter(
			(u) => u.endsWith("/corpus") && !u.includes("region"),
		);
		const asiaHits = corpusCalls.filter((u) =>
			u.endsWith("/corpus-region/asia"),
		);
		// Each region's corpus endpoint is fetched exactly once across two same-region
		// calls (memoized), and both regions' endpoints are hit overall.
		expect(westHits).toHaveLength(1);
		expect(asiaHits).toHaveLength(1);
	});
});

const v2Cards: CorpusCard[] = [
	{
		id: "me05-1",
		name: "Mega Darkrai ex",
		imageUrl: "l2",
		imageUrlSmall: "s2",
		supertype: "Pokémon",
		setId: "me05",
		number: "1",
	},
];

/** Drain the microtask/timer queue so a background revalidation settles. */
async function settle() {
	for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
}

describe("queryCorpusServer TTL revalidation", () => {
	const T0 = 1_000_000_000;
	let nowSpy: ReturnType<typeof spyOn<DateConstructor, "now">>;
	/** Every corpus-endpoint fetch: the If-None-Match header it carried. */
	let corpusCalls: (string | null)[];
	/** What the corpus endpoint answers AFTER the initial 200 (per test). */
	let respond: () => Response;

	beforeEach(() => {
		resetServerCorpusForTests();
		nowSpy = spyOn(Date, "now").mockReturnValue(T0);
		corpusCalls = [];
		respond = () => new Response(null, { status: 304 });
		const v1gz = gzipOf(cards);
		globalThis.fetch = mock(async (url: string, init?: RequestInit) => {
			const u = String(url);
			if (u.includes("/sets"))
				return new Response(JSON.stringify([]), { status: 200 });
			const inm =
				(init?.headers as Record<string, string> | undefined)?.[
					"If-None-Match"
				] ?? null;
			corpusCalls.push(inm);
			if (corpusCalls.length === 1)
				return new Response(v1gz, {
					status: 200,
					headers: { ETag: '"v1"' },
				});
			return respond();
		}) as unknown as typeof fetch;
	});
	afterEach(() => {
		nowSpy.mockRestore();
	});

	const query = () => queryCorpusServer({ setId: null, relevance: false });

	test("within the TTL no revalidation fetch is issued", async () => {
		await query();
		nowSpy.mockReturnValue(T0 + SERVER_CORPUS_TTL_MS - 1);
		await query();
		await settle();
		expect(corpusCalls).toHaveLength(1);
	});

	test("after the TTL a background conditional GET goes out; 304 keeps the corpus and re-arms the TTL", async () => {
		await query();
		nowSpy.mockReturnValue(T0 + SERVER_CORPUS_TTL_MS + 1);
		const stale = await query(); // stale-while-revalidate: still served
		expect(stale[0]?.id).toBe("swsh9-1");
		await settle();
		expect(corpusCalls).toHaveLength(2);
		expect(corpusCalls[1]).toBe('"v1"'); // conditional GET with the stored ETag
		// 304 bumped freshness: no third fetch until another full TTL elapses.
		const after = await query();
		await settle();
		expect(after[0]?.id).toBe("swsh9-1");
		expect(corpusCalls).toHaveLength(2);
	});

	test("after the TTL a 200 revalidation swaps in the new corpus", async () => {
		await query();
		respond = () =>
			new Response(gzipOf(v2Cards), { status: 200, headers: { ETag: '"v2"' } });
		nowSpy.mockReturnValue(T0 + SERVER_CORPUS_TTL_MS + 1);
		await query();
		await settle();
		const fresh = await query();
		expect(fresh[0]?.id).toBe("me05-1");
		// The NEXT revalidation revalidates against the swapped-in ETag.
		nowSpy.mockReturnValue(T0 + 2 * (SERVER_CORPUS_TTL_MS + 1));
		respond = () => new Response(null, { status: 304 });
		await query();
		await settle();
		expect(corpusCalls[2]).toBe('"v2"');
	});

	test("a failed revalidation keeps serving the old corpus and backs off a full TTL", async () => {
		await query();
		respond = () => new Response(null, { status: 500 });
		nowSpy.mockReturnValue(T0 + SERVER_CORPUS_TTL_MS + 1);
		await query();
		await settle();
		const kept = await query();
		await settle();
		expect(kept[0]?.id).toBe("swsh9-1");
		expect(corpusCalls).toHaveLength(2); // failure re-armed the TTL, no hammering
	});
});
