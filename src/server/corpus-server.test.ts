import { describe, expect, test } from "bun:test";
import { gzipSync } from "node:zlib";
import type { CorpusCard } from "../store/corpus/corpus-types";
import { decodeCorpusGz } from "./corpus-server";

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
