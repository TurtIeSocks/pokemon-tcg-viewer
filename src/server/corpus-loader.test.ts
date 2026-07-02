import { describe, expect, mock, test } from "bun:test";
import { gzipSync } from "node:zlib";
import type { CorpusCard } from "../store/corpus/corpus-types";
import { decodeCorpusGz, queryCorpusServer } from "./corpus-loader";

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
