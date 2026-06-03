import { expect, test } from "bun:test";
import type { PokemonSet } from "../../server/card-mappers";
import { buildIndex, hydrateCard, queryCorpus } from "./corpus-engine";
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

function corpusCard(id: string, over: Partial<CorpusCard> = {}): CorpusCard {
	return {
		id,
		name: over.name ?? "Test",
		imageUrl: `https://img.invalid/${id}.png`,
		imageUrlSmall: `https://img.invalid/${id}-sm.png`,
		supertype: over.supertype ?? "Pokémon",
		setId: over.setId ?? "base1",
		number: over.number ?? "1",
		...over,
	};
}

const base1: PokemonSet = {
	id: "base1",
	name: "Base",
	series: "Base",
	releaseDate: "1999-01-09",
	total: 102,
	images: { symbol: "", logo: "" },
};

test("buildIndex exposes a byId lookup", () => {
	const index = buildIndex([corpusCard("base1-1"), corpusCard("base1-2")]);
	expect(index.byId.size).toBe(2);
	expect(index.byId.get("base1-2")?.id).toBe("base1-2");
	expect(index.byId.get("missing")).toBeUndefined();
});

test("hydrateCard joins set name/series from setsById", () => {
	const setsById = new Map([["base1", base1]]);
	const out = hydrateCard(
		corpusCard("base1-4", { setId: "base1", name: "Charizard" }),
		setsById,
	);
	expect(out.name).toBe("Charizard");
	expect(out.setName).toBe("Base");
	expect(out.setSeries).toBe("Base");
});

test("hydrateCard falls back to setId when set is unknown", () => {
	const out = hydrateCard(corpusCard("x-1", { setId: "unknown" }), new Map());
	expect(out.setName).toBe("unknown");
	expect(out.setSeries).toBe("");
});

// --- year range filter tests ---

const yearSet1999: PokemonSet = {
	id: "yr1999",
	name: "Vintage 1999",
	series: "Base",
	releaseDate: "1999/01/01",
	total: 10,
	images: { symbol: "", logo: "" },
};

const yearSet2001: PokemonSet = {
	id: "yr2001",
	name: "Neo 2001",
	series: "Neo",
	releaseDate: "2001/01/01",
	total: 10,
	images: { symbol: "", logo: "" },
};

const yearCorpus = buildIndex([
	card({ id: "yr1999-1", name: "Bulbasaur", setId: "yr1999", number: "1" }),
	card({ id: "yr2001-1", name: "Chikorita", setId: "yr2001", number: "1" }),
]);

const yearSetsById = new Map<string, PokemonSet>([
	["yr1999", yearSet1999],
	["yr2001", yearSet2001],
]);

test("yearMax: only cards at or before the year", () => {
	const r = queryCorpus(
		yearCorpus,
		{ yearMax: 1999, relevance: false },
		yearSetsById,
	);
	expect(r.map((c) => c.id)).toEqual(["yr1999-1"]);
});

test("yearMin: only cards at or after the year", () => {
	const r = queryCorpus(
		yearCorpus,
		{ yearMin: 2000, relevance: false },
		yearSetsById,
	);
	expect(r.map((c) => c.id)).toEqual(["yr2001-1"]);
});

test("yearMin + yearMax: inclusive range returns both", () => {
	const r = queryCorpus(
		yearCorpus,
		{ yearMin: 1999, yearMax: 2001, relevance: false },
		yearSetsById,
	);
	expect(r.map((c) => c.id)).toContain("yr1999-1");
	expect(r.map((c) => c.id)).toContain("yr2001-1");
});

test("no year bounds: all cards returned unchanged", () => {
	const r = queryCorpus(yearCorpus, { relevance: false }, yearSetsById);
	expect(r.map((c) => c.id)).toContain("yr1999-1");
	expect(r.map((c) => c.id)).toContain("yr2001-1");
});

// --- exact match-mode tests ---

test("exact mode drops the typo (fuzzy) match", () => {
	const fuzzy = queryCorpus(
		index,
		{ query: "charizrd", relevance: true },
		setsById,
	);
	expect(fuzzy.map((c) => c.id)).toContain("base1-4"); // fuzzy still finds it
	const exact = queryCorpus(
		index,
		{ query: "charizrd", relevance: true, exact: true },
		setsById,
	);
	expect(exact).toEqual([]); // exact rejects the typo
});

test("exact mode keeps exact and prefix matches", () => {
	const r = queryCorpus(
		index,
		{ query: "charizard", relevance: true, exact: true },
		setsById,
	);
	expect(r.map((c) => c.id)).toEqual(["base1-4", "swsh1-25"]); // exact + prefix survive
});
