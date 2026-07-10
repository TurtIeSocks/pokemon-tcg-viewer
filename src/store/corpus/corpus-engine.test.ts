import { expect, test } from "bun:test";
import type { PokemonSet } from "../../server/card-mappers";
import { makeCorpusCard } from "../../test-utils";
import {
	buildIndex,
	hydrateCard,
	queryCorpus,
	resolveCardAcrossRegions,
} from "./corpus-engine";
import type { CorpusCard } from "./corpus-types";

const card = (
	p: Partial<CorpusCard> & { id: string; name: string },
): CorpusCard => makeCorpusCard(p);

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

test("pokedex: filters by a single national dex number", () => {
	const r = queryCorpus(
		index,
		{ dexNumbers: [25], relevance: false },
		setsById,
	);
	expect(r.map((c) => c.id)).toEqual(["base1-58"]);
});

const dexCorpus = buildIndex([
	card({
		id: "d-25",
		name: "Pikachu",
		setId: "base1",
		number: "1",
		nationalPokedexNumbers: [25],
	}),
	card({
		id: "d-6",
		name: "Charizard",
		setId: "base1",
		number: "2",
		nationalPokedexNumbers: [6],
	}),
	card({
		id: "d-9",
		name: "Blastoise",
		setId: "base1",
		number: "3",
		nationalPokedexNumbers: [9],
	}),
]);

test("pokedex: matches a card when ANY selected dex is in its list", () => {
	const r = queryCorpus(
		dexCorpus,
		{ dexNumbers: [25, 6], relevance: false },
		setsById,
	);
	expect(r.map((c) => c.id).sort()).toEqual(["d-25", "d-6"]);
});

test("pokedex: excludes every card when none of the selected dex match", () => {
	const r = queryCorpus(
		dexCorpus,
		{ dexNumbers: [151], relevance: false },
		setsById,
	);
	expect(r).toEqual([]);
});

test("pokedex: an empty dexNumbers array applies no species filter", () => {
	const r = queryCorpus(
		dexCorpus,
		{ dexNumbers: [], relevance: false },
		setsById,
	);
	expect(r.length).toBe(3);
});

// --- ids (card "name" filter: dex ids for Pokémon, names for dex-less Trainers) ---

const mixedCorpus = buildIndex([
	card({
		id: "m-6",
		name: "Charizard",
		setId: "base1",
		number: "1",
		nationalPokedexNumbers: [6],
	}),
	// Trainers have no national dex, so they key on their name.
	card({ id: "m-barry", name: "Barry", setId: "base1", number: "2" }),
	card({ id: "m-acerola", name: "Acerola", setId: "base1", number: "3" }),
]);

test("ids: a dex id matches the Pokémon with that national dex number", () => {
	const r = queryCorpus(
		mixedCorpus,
		{ ids: ["6"], relevance: false },
		setsById,
	);
	expect(r.map((c) => c.id)).toEqual(["m-6"]);
});

test("ids: a card name matches a dex-less Trainer by name", () => {
	const r = queryCorpus(
		mixedCorpus,
		{ ids: ["Barry"], relevance: false },
		setsById,
	);
	expect(r.map((c) => c.id)).toEqual(["m-barry"]);
});

test("ids: a mix of a dex id and a trainer name matches both", () => {
	const r = queryCorpus(
		mixedCorpus,
		{ ids: ["6", "Acerola"], relevance: false },
		setsById,
	);
	expect(r.map((c) => c.id).sort()).toEqual(["m-6", "m-acerola"]);
});

test("ids: an empty array applies no filter", () => {
	const r = queryCorpus(mixedCorpus, { ids: [], relevance: false }, setsById);
	expect(r.length).toBe(3);
});

// --- excludeDexCards (guard against upstream Pokémon mislabeled as Trainer/Energy) ---

test("excludeDexCards drops dex-bearing cards from a Trainer view", () => {
	const c = buildIndex([
		card({
			id: "real-potion",
			name: "Potion",
			setId: "base1",
			number: "1",
			supertype: "Trainer",
		}),
		// Upstream mislabel: supertype Trainer but carries a national dex (a Pokémon).
		card({
			id: "fake-combusken",
			name: "Combusken",
			setId: "base1",
			number: "2",
			supertype: "Trainer",
			nationalPokedexNumbers: [256],
		}),
	]);
	const r = queryCorpus(
		c,
		{
			filters: { supertypes: ["Trainer"] },
			excludeDexCards: true,
			relevance: false,
		},
		setsById,
	);
	expect(r.map((x) => x.id)).toEqual(["real-potion"]);
});

// --- sort=rarity (orders by rarity level, not alphabetically) ---

test("sort=rarity orders cards by rarity level", () => {
	const c = buildIndex([
		card({
			id: "s",
			name: "S",
			setId: "base1",
			number: "1",
			rarity: "Rare Secret",
		}),
		card({ id: "c", name: "C", setId: "base1", number: "2", rarity: "Common" }),
		card({
			id: "h",
			name: "H",
			setId: "base1",
			number: "3",
			rarity: "Rare Holo",
		}),
		card({
			id: "u",
			name: "U",
			setId: "base1",
			number: "4",
			rarity: "Uncommon",
		}),
	]);
	const r = queryCorpus(
		c,
		{ sort: "rarity", dir: "asc", relevance: false },
		setsById,
	);
	expect(r.map((x) => x.rarity)).toEqual([
		"Common",
		"Uncommon",
		"Rare Holo",
		"Rare Secret",
	]);
});

// --- nameSlug (Trainer/Energy per-name pages) ---

const namedIndex = buildIndex([
	card({
		id: "base1-83",
		name: "Rare Candy",
		setId: "base1",
		number: "83",
		supertype: "Trainer",
		subtypes: ["Item"],
	}),
	card({
		id: "swsh1-191",
		name: "Rare Candy",
		setId: "swsh1",
		number: "191",
		supertype: "Trainer",
		subtypes: ["Item"],
	}),
	card({
		id: "swsh1-192",
		name: "Boss's Orders",
		setId: "swsh1",
		number: "192",
		supertype: "Trainer",
		subtypes: ["Supporter"],
	}),
]);

test("nameSlug: keeps only printings whose slugified name matches", () => {
	const r = queryCorpus(
		namedIndex,
		{
			nameSlug: "rare-candy",
			filters: { supertypes: ["Trainer"] },
			chronological: true,
			relevance: false,
		},
		setsById,
	);
	// Both Rare Candy printings, oldest set first (chronological).
	expect(r.map((c) => c.id)).toEqual(["base1-83", "swsh1-191"]);
});

test("nameSlug + supertype excludes a same-supertype different name", () => {
	// slugify drops apostrophes (no hyphen): "Boss's Orders" -> "bosss-orders".
	const r = queryCorpus(
		namedIndex,
		{
			nameSlug: "bosss-orders",
			filters: { supertypes: ["Trainer"] },
			relevance: false,
		},
		setsById,
	);
	expect(r.map((c) => c.id)).toEqual(["swsh1-192"]);
});

test("chronological: cross-set results ordered oldest set first", () => {
	const r = queryCorpus(
		namedIndex,
		{
			filters: { supertypes: ["Trainer"] },
			chronological: true,
			relevance: false,
		},
		setsById,
	);
	// base1 (1999) before swsh1 (2020), regardless of card number.
	expect(r[0].setId).toBe("base1");
});

test("missing set falls back to setId as name", () => {
	const orphan = buildIndex([card({ id: "x-1", name: "Mew", setId: "ghost" })]);
	const r = queryCorpus(orphan, { setId: "ghost", relevance: false }, setsById);
	expect(r[0].setName).toBe("ghost");
	expect(r[0].setReleaseDate).toBeUndefined();
});

const corpusCard = (id: string, over: Partial<CorpusCard> = {}): CorpusCard =>
	makeCorpusCard({ id, ...over });

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

// --- search mode tests ---

test("fuzzy mode (default) finds typo match", () => {
	const r = queryCorpus(
		index,
		{ query: "charizrd", relevance: true },
		setsById,
	);
	expect(r.map((c) => c.id)).toContain("base1-4");
});

test("exact mode drops the typo (fuzzy) match and substring", () => {
	const r = queryCorpus(
		index,
		{ query: "charizrd", relevance: true, mode: "exact" },
		setsById,
	);
	expect(r).toEqual([]); // typo rejected by exact mode
});

test("exact mode: whole-name query matches, prefix does not", () => {
	const r = queryCorpus(
		index,
		{ query: "charizard", relevance: true, mode: "exact" },
		setsById,
	);
	// "Charizard" = tier 0 (whole-name match); "Charizard V" is NOT matched (exact mode rejects prefix)
	expect(r.map((c) => c.id)).toEqual(["base1-4"]);
});

test("contains mode: prefix + substring match, typo rejected", () => {
	const r = queryCorpus(
		index,
		{ query: "charizard", relevance: true, mode: "contains" },
		setsById,
	);
	// "charizard" matches "Charizard" (tier 0) and "Charizard V" (tier 1 prefix)
	expect(r.map((c) => c.id)).toEqual(["base1-4", "swsh1-25"]);
});

test("contains mode: typo rejected", () => {
	const r = queryCorpus(
		index,
		{ query: "charizrd", relevance: true, mode: "contains" },
		setsById,
	);
	expect(r).toEqual([]);
});

test("sort name: asc alphabetical, desc reversed", () => {
	expect(
		queryCorpus(
			index,
			{ sort: "name", dir: "asc", relevance: false },
			setsById,
		).map((c) => c.id),
	).toEqual(["base1-2", "base1-4", "swsh1-25", "base1-58"]);
	expect(
		queryCorpus(
			index,
			{ sort: "name", dir: "desc", relevance: false },
			setsById,
		).map((c) => c.id),
	).toEqual(["base1-58", "swsh1-25", "base1-4", "base1-2"]);
});
test("sort released desc puts the newest set first, base1 cards tie-break by number", () => {
	expect(
		queryCorpus(
			index,
			{ sort: "released", dir: "desc", relevance: false },
			setsById,
		).map((c) => c.id),
	).toEqual(["swsh1-25", "base1-2", "base1-4", "base1-58"]);
});
test("sort dex asc puts dex-bearing cards first (others sentinel-last)", () => {
	expect(
		queryCorpus(
			index,
			{ sort: "dex", dir: "asc", relevance: false },
			setsById,
		).map((c) => c.id),
	).toEqual(["base1-58", "base1-2", "base1-4", "swsh1-25"]);
});
test("sort default preserves the existing card-number order", () => {
	expect(
		queryCorpus(
			index,
			{ sort: "default", dir: "asc", relevance: false },
			setsById,
		).map((c) => c.id),
	).toEqual(["base1-2", "base1-4", "swsh1-25", "base1-58"]);
});

// --- i18n overlay (Phase 1b) ---

test("hydrateCard with no i18n keeps the EN name + baked image urls", () => {
	const setsById = new Map([["base1", base1]]);
	const out = hydrateCard(
		corpusCard("base1-4", {
			setId: "base1",
			name: "Charizard",
			imageBase: "base/base1/4",
			imageUrl: "https://images.pokemontcg.io/base1/4_hires.png",
			imageUrlSmall: "https://images.pokemontcg.io/base1/4.png",
		}),
		setsById,
	);
	expect(out.name).toBe("Charizard");
	expect(out.imageUrl).toBe("https://images.pokemontcg.io/base1/4_hires.png");
});

test("hydrateCard overlays a localized name when the id is in the map", () => {
	const setsById = new Map([["base1", base1]]);
	const namesById = new Map([["base1-4", "Dracaufeu"]]);
	const out = hydrateCard(
		corpusCard("base1-4", { setId: "base1", name: "Charizard" }),
		setsById,
		{ lang: "fr", namesById },
	);
	expect(out.name).toBe("Dracaufeu");
});

test("hydrateCard falls back to the EN name on an overlay miss", () => {
	const setsById = new Map([["base1", base1]]);
	const namesById = new Map<string, string>(); // empty → every lookup misses
	const out = hydrateCard(
		corpusCard("base1-4", { setId: "base1", name: "Charizard" }),
		setsById,
		{ lang: "fr", namesById },
	);
	expect(out.name).toBe("Charizard");
});

test("hydrateCard derives the localized image url from imageBase", () => {
	const setsById = new Map([["base1", base1]]);
	const out = hydrateCard(
		corpusCard("base1-4", {
			setId: "base1",
			name: "Charizard",
			imageBase: "base/base1/4",
			imageUrl: "https://images.pokemontcg.io/base1/4_hires.png",
			imageUrlSmall: "https://images.pokemontcg.io/base1/4.png",
		}),
		setsById,
		{ lang: "fr", namesById: null },
	);
	expect(out.imageUrl).toBe(
		"https://assets.tcgdex.net/fr/base/base1/4/high.webp",
	);
	expect(out.imageUrlSmall).toBe(
		"https://assets.tcgdex.net/fr/base/base1/4/low.webp",
	);
});

test("queryCorpus threads the i18n overlay into every hydrated row", () => {
	const namesById = new Map([
		["base1-4", "Dracaufeu"],
		["base1-58", "Pikachu (fr)"],
	]);
	const r = queryCorpus(index, { setId: "base1", relevance: false }, setsById, {
		lang: "fr",
		namesById,
	});
	const byId = new Map(r.map((c) => [c.id, c.name]));
	expect(byId.get("base1-4")).toBe("Dracaufeu");
	expect(byId.get("base1-58")).toBe("Pikachu (fr)");
	// base1-2 (Blastoise) is not in the overlay → EN fallback.
	expect(byId.get("base1-2")).toBe("Blastoise");
});

test("buildIndex defaults every card's region to west", () => {
	const idx = buildIndex([card({ id: "base1-4", name: "Charizard" })]);
	expect(idx.byId.get("base1-4")?.region).toBe("west");
});

test("buildIndex stamps the given region onto every card", () => {
	const idx = buildIndex(
		[
			card({ id: "sv1a-001", name: "Nyoromo" }),
			card({ id: "sv1a-002", name: "Nyorotono" }),
		],
		"asia",
	);
	expect(idx.cards.every((c) => c.region === "asia")).toBe(true);
	expect(idx.byId.get("sv1a-001")?.region).toBe("asia");
});

test("resolveCardAcrossRegions finds a card in whichever loaded region has it", () => {
	const west = buildIndex([card({ id: "base1-4", name: "Charizard" })]);
	const asia = buildIndex([card({ id: "sv1a-001", name: "Nyoromo" })], "asia");
	const found = resolveCardAcrossRegions("sv1a-001", { west, asia });
	expect(found?.id).toBe("sv1a-001");
	expect(found?.region).toBe("asia");
});

test("resolveCardAcrossRegions returns undefined when the id is in no loaded index", () => {
	const west = buildIndex([card({ id: "base1-4", name: "Charizard" })]);
	const asia = buildIndex([card({ id: "sv1a-001", name: "Nyoromo" })], "asia");
	expect(
		resolveCardAcrossRegions("missing-999", { west, asia }),
	).toBeUndefined();
});

test("resolveCardAcrossRegions works with only one region loaded", () => {
	const west = buildIndex([card({ id: "base1-4", name: "Charizard" })]);
	expect(resolveCardAcrossRegions("base1-4", { west })?.id).toBe("base1-4");
	expect(resolveCardAcrossRegions("sv1a-001", { west })).toBeUndefined();
});

// --- region-aware face language (Task D2) ---

test("hydrateCard: west card + active en -> en face (unchanged)", () => {
	const setsById = new Map([["base1", base1]]);
	const out = hydrateCard(
		corpusCard("base1-4", {
			setId: "base1",
			name: "Charizard",
			region: "west",
			imageBase: "base/base1/4",
			imageUrl: "https://images.pokemontcg.io/base1/4_hires.png",
			imageUrlSmall: "https://images.pokemontcg.io/base1/4.png",
		}),
		setsById,
		{ lang: "en", namesById: null },
	);
	expect(out.name).toBe("Charizard");
	expect(out.imageUrl).toBe("https://images.pokemontcg.io/base1/4_hires.png");
});

test("hydrateCard: west card + active ja -> en face (region base, not ja)", () => {
	const setsById = new Map([["base1", base1]]);
	const namesById = new Map([
		["base1-4", "リザードン (ja overlay, should not apply)"],
	]);
	const out = hydrateCard(
		corpusCard("base1-4", {
			setId: "base1",
			name: "Charizard",
			region: "west",
			imageBase: "base/base1/4",
			imageUrl: "https://images.pokemontcg.io/base1/4_hires.png",
			imageUrlSmall: "https://images.pokemontcg.io/base1/4.png",
		}),
		setsById,
		{ lang: "ja", namesById },
	);
	expect(out.name).toBe("Charizard");
	expect(out.imageUrl).toBe("https://images.pokemontcg.io/base1/4_hires.png");
});

test("hydrateCard: asia card + active en -> ja face (region base)", () => {
	const setsById = new Map([["base1", base1]]);
	const out = hydrateCard(
		corpusCard("sv1a-001", {
			setId: "base1",
			name: "Nyoromo",
			region: "asia",
			imageBase: "sv/sv1a/001",
			imageUrl: "https://images.pokemontcg.io/sv1a/001_hires.png",
			imageUrlSmall: "https://images.pokemontcg.io/sv1a/001.png",
		}),
		setsById,
		{ lang: "en", namesById: null },
	);
	expect(out.imageUrl).toBe(
		"https://assets.tcgdex.net/ja/sv/sv1a/001/high.webp",
	);
});

// --- search grammar via queryCorpus (centralized in the engine) ---

const ids = (r: { id: string }[]) => r.map((c) => c.id);
const sortedIds = (r: { id: string }[]) => ids(r).sort();

// REGRESSION PINS: a query with NO operators must return EXACTLY the same
// cards + order as before the grammar landed (protects shared URLs + binder
// smart-rules). The pinned values below are the pre-change engine output.

test("REGRESSION: plain single-word query is byte-identical to pre-grammar output", () => {
	const r = queryCorpus(
		index,
		{ query: "charizard", relevance: true },
		setsById,
	);
	expect(ids(r)).toEqual(["base1-4", "swsh1-25"]); // exact before prefix (unchanged)
});

test("REGRESSION: multi-word no-operator query stays ONE contiguous term", () => {
	// "pikachu ex" normalizes to "pikachuex" and fuzzy-matches Pikachu (dist 2),
	// exactly as the old normalize()+matchName path did.
	const r = queryCorpus(
		index,
		{ query: "pikachu ex", relevance: true },
		setsById,
	);
	expect(ids(r)).toEqual(["base1-58"]);
});

test("grammar OR (comma): matches either name", () => {
	const r = queryCorpus(
		index,
		{ query: "charizard, blastoise", relevance: true },
		setsById,
	);
	expect(sortedIds(r)).toEqual(["base1-2", "base1-4", "swsh1-25"]);
});

test("grammar AND (+): a name must contain both terms", () => {
	const r = queryCorpus(
		index,
		{ query: "char + v", relevance: true },
		setsById,
	);
	expect(ids(r)).toEqual(["swsh1-25"]); // only "Charizard V" has both
});

test("grammar NOT (!): excludes names containing the negated term", () => {
	const r = queryCorpus(
		index,
		{ query: "charizard + !v", relevance: true },
		setsById,
	);
	expect(ids(r)).toEqual(["base1-4"]); // "Charizard V" dropped by !v
});

test("grammar field op type: filters by card type (case-insensitive)", () => {
	const lower = queryCorpus(
		index,
		{ query: "type:fire", relevance: true },
		setsById,
	);
	const upper = queryCorpus(
		index,
		{ query: "type:FIRE", relevance: true },
		setsById,
	);
	expect(sortedIds(lower)).toEqual(["base1-4", "swsh1-25"]);
	expect(sortedIds(upper)).toEqual(["base1-4", "swsh1-25"]); // FIRE resolves to "Fire"
});

test("grammar field op AND name: both must hold (AND across dimensions)", () => {
	// charizards are Fire, so a Water constraint yields nothing.
	const r = queryCorpus(
		index,
		{ query: "type:water charizard", relevance: true },
		setsById,
	);
	expect(r).toEqual([]);
});

test("grammar field op rarity with a quoted multi-word value", () => {
	const r = queryCorpus(
		index,
		{ query: 'rarity:"rare holo"', relevance: true },
		setsById,
	);
	expect(sortedIds(r)).toEqual(["base1-2", "base1-4"]); // not "Rare Holo V"
});

test("grammar field op set: scopes to a set when no context setId", () => {
	const r = queryCorpus(
		index,
		{ query: "set:base1", relevance: false },
		setsById,
	);
	expect(sortedIds(r)).toEqual(["base1-2", "base1-4", "base1-58"]);
});

test("grammar field op merges with dropdown facets by OR-within-dimension", () => {
	// dropdown picked Water; query adds Fire → Water OR Fire.
	const r = queryCorpus(
		index,
		{ query: "type:fire", filters: { types: ["Water"] }, relevance: true },
		setsById,
	);
	expect(sortedIds(r)).toEqual(["base1-2", "base1-4", "swsh1-25"]);
});

test("grammar field op year: filters by release year", () => {
	const r = queryCorpus(
		yearCorpus,
		{ query: "year:1999", relevance: false },
		yearSetsById,
	);
	expect(ids(r)).toEqual(["yr1999-1"]);
});

test("grammar fail-open: lone ! applies no name filter (returns all)", () => {
	const r = queryCorpus(index, { query: "!", relevance: false }, setsById);
	expect(r.length).toBe(4);
});

test("grammar fail-open: trailing comma keeps the valid arm", () => {
	const r = queryCorpus(
		index,
		{ query: "charizard,", relevance: true },
		setsById,
	);
	expect(sortedIds(r)).toEqual(["base1-4", "swsh1-25"]);
});

test("hydrateCard: asia card + active ko -> ko face (matches region)", () => {
	const setsById = new Map([["base1", base1]]);
	const namesById = new Map([["sv1a-001", "니시노쿠쿠"]]);
	const out = hydrateCard(
		corpusCard("sv1a-001", {
			setId: "base1",
			name: "Nyoromo",
			region: "asia",
			imageBase: "sv/sv1a/001",
			imageUrl: "https://images.pokemontcg.io/sv1a/001_hires.png",
			imageUrlSmall: "https://images.pokemontcg.io/sv1a/001.png",
		}),
		setsById,
		{ lang: "ko", namesById },
	);
	expect(out.name).toBe("니시노쿠쿠");
	expect(out.imageUrl).toBe(
		"https://assets.tcgdex.net/ko/sv/sv1a/001/high.webp",
	);
});
