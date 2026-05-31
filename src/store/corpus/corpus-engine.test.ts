import { expect, test } from "bun:test";
import type { PokemonSet } from "../../api";
import { buildIndex, queryCorpus } from "./corpus-engine";
import type { CorpusCard } from "./corpus-types";

function card(
	p: Partial<CorpusCard> & { id: string; name: string },
): CorpusCard {
	return {
		imageUrl: `${p.id}.png`,
		imageUrlSmall: `${p.id}-s.png`,
		supertype: "Pokémon",
		setId: "base1",
		number: "1",
		...p,
	};
}

const sets: PokemonSet[] = [
	{
		id: "base1",
		name: "Base",
		series: "Base",
		releaseDate: "1999/01/09",
		total: 102,
		images: { symbol: "", logo: "" },
	},
	{
		id: "swsh1",
		name: "Sword & Shield",
		series: "Sword & Shield",
		releaseDate: "2020/02/07",
		total: 202,
		images: { symbol: "", logo: "" },
	},
];

const corpus = [
	card({
		id: "base1-4",
		name: "Charizard",
		setId: "base1",
		number: "4",
		rarity: "Rare Holo",
		types: ["Fire"],
	}),
	card({
		id: "swsh1-25",
		name: "Charizard V",
		setId: "swsh1",
		number: "25",
		rarity: "Rare Holo V",
		types: ["Fire"],
	}),
	card({
		id: "base1-58",
		name: "Pikachu",
		setId: "base1",
		number: "58",
		rarity: "Common",
		types: ["Lightning"],
		nationalPokedexNumbers: [25],
	}),
	card({
		id: "base1-2",
		name: "Blastoise",
		setId: "base1",
		number: "2",
		rarity: "Rare Holo",
		types: ["Water"],
	}),
];
const index = buildIndex(corpus);
const setsById = new Map(sets.map((s) => [s.id, s]));

test("set browse: filters by setId, natural-number order, hydrates set fields", () => {
	const r = queryCorpus(index, { setId: "base1", relevance: false }, setsById);
	expect(r.map((c) => c.id)).toEqual(["base1-2", "base1-4", "base1-58"]);
	expect(r[0].setName).toBe("Base");
	expect(r[0].cardNumber).toBe("2");
});

test("name search: relevance order (exact/prefix before others)", () => {
	const r = queryCorpus(
		index,
		{ query: "charizard", relevance: true },
		setsById,
	);
	expect(r.map((c) => c.id)).toEqual(["base1-4", "swsh1-25"]); // exact before prefix
});

test("name search tolerates a typo", () => {
	const r = queryCorpus(
		index,
		{ query: "charizrd", relevance: true },
		setsById,
	);
	expect(r.map((c) => c.id)).toContain("base1-4");
});

test("type filter: OR within dimension, AND across", () => {
	const r = queryCorpus(
		index,
		{ filters: { types: ["Water"] }, relevance: false },
		setsById,
	);
	expect(r.map((c) => c.id)).toEqual(["base1-2"]);
});

test("pokedex: filters by national dex number", () => {
	const r = queryCorpus(index, { dexNumber: 25, relevance: false }, setsById);
	expect(r.map((c) => c.id)).toEqual(["base1-58"]);
});

test("missing set falls back to setId as name", () => {
	const orphan = buildIndex([card({ id: "x-1", name: "Mew", setId: "ghost" })]);
	const r = queryCorpus(orphan, { setId: "ghost", relevance: false }, setsById);
	expect(r[0].setName).toBe("ghost");
	expect(r[0].setReleaseDate).toBeUndefined();
});
