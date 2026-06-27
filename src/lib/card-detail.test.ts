import { beforeEach, expect, test } from "bun:test";
import type { FocusCardData, PokemonSet } from "../server/card-mappers";
import { buildIndex } from "../store/corpus/corpus-engine";
import type { CorpusCard } from "../store/corpus/corpus-types";
import {
	__resetCardDetailCacheForTests,
	getCardDetail,
	optimisticCardFromCorpus,
	parseCardOverlayParam,
	peekCardDetail,
} from "./card-detail";
import { buildSlugIndex } from "./slug";

const sets: PokemonSet[] = [
	{
		id: "base1",
		name: "Base",
		series: "Base",
		releaseDate: "1999/01/09",
		total: 102,
		images: { symbol: "", logo: "" },
	},
];

const charizard: CorpusCard = {
	id: "base1-4",
	name: "Charizard",
	imageUrl: "https://img.test/large.png",
	imageUrlSmall: "https://img.test/small.png",
	supertype: "Pokémon",
	setId: "base1",
	number: "4",
	rarity: "Rare Holo",
	subtypes: ["Stage 2"],
	types: ["Fire"],
	nationalPokedexNumbers: [6],
	variants: ["holofoil"],
};

const index = buildIndex([charizard]);
const slugIndex = buildSlugIndex(sets, index.cards);
// Slug scheme: series=slug(series), set=slug(name), card=slug(name)-number.
const params = { series: "base", set: "base", card: "charizard-4" };

beforeEach(() => {
	__resetCardDetailCacheForTests();
});

test("parseCardOverlayParam parses a valid triple and rejects the rest", () => {
	expect(parseCardOverlayParam("base/base/charizard-4")).toEqual(params);
	expect(parseCardOverlayParam("base/base")).toBeNull();
	expect(parseCardOverlayParam("")).toBeNull();
	expect(parseCardOverlayParam(undefined)).toBeNull();
});

test("optimisticCardFromCorpus widens a corpus card to a partial FocusCardData", () => {
	const card = optimisticCardFromCorpus(params, slugIndex, index, sets);
	expect(card).not.toBeNull();
	expect(card?.id).toBe("base1-4");
	expect(card?.name).toBe("Charizard");
	expect(card?.imageUrl).toBe("https://img.test/large.png");
	expect(card?.setName).toBe("Base");
	expect(card?.setSeries).toBe("Base");
	expect(card?.cardNumber).toBe("4");
	expect(card?.supertype).toBe("Pokémon");
	// Detail-only fields stay absent until the server RPC resolves.
	expect(card?.attacks).toBeUndefined();
	expect(card?.hp).toBeUndefined();
	expect(card?.tcgplayer).toBeUndefined();
});

test("optimisticCardFromCorpus returns null when corpus/sets/slug index unready", () => {
	expect(optimisticCardFromCorpus(params, null, index, sets)).toBeNull();
	expect(optimisticCardFromCorpus(params, slugIndex, null, sets)).toBeNull();
	expect(optimisticCardFromCorpus(params, slugIndex, index, null)).toBeNull();
});

test("optimisticCardFromCorpus returns null for an unknown card slug", () => {
	const miss = { series: "base", set: "base", card: "mewtwo-10" };
	expect(optimisticCardFromCorpus(miss, slugIndex, index, sets)).toBeNull();
});

test("getCardDetail dedupes concurrent calls for the same card", async () => {
	let calls = 0;
	const fetcher = async () => {
		calls++;
		return { card: { id: "base1-4" } as FocusCardData, crossLinks: [] };
	};
	const [a, b] = await Promise.all([
		getCardDetail(params, fetcher),
		getCardDetail(params, fetcher),
	]);
	expect(calls).toBe(1);
	expect(a).toBe(b);
});

test("peekCardDetail is undefined until resolved, then the value (no flash)", async () => {
	const data = { card: { id: "base1-4" } as FocusCardData, crossLinks: [] };
	expect(peekCardDetail(params)).toBeUndefined();
	const p = getCardDetail(params, async () => data);
	// Still in flight on the same tick — render must treat this as pending.
	expect(peekCardDetail(params)).toBeUndefined();
	await p;
	expect(peekCardDetail(params)).toBe(data);
});

test("getCardDetail evicts on error so the next open retries", async () => {
	let calls = 0;
	const failing = async () => {
		calls++;
		throw new Error("boom");
	};
	await expect(getCardDetail(params, failing)).rejects.toThrow("boom");
	await expect(getCardDetail(params, failing)).rejects.toThrow("boom");
	expect(calls).toBe(2);
});
