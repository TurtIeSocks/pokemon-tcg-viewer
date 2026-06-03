import { expect, test } from "bun:test";
import type { PokemonSet } from "../../server/card-mappers";
import { buildIndex } from "../corpus/corpus-engine";
import type { CorpusCard } from "../corpus/corpus-types";
import {
	binderMembers,
	computeBinderProgress,
	toCorpusQuery,
} from "./binder-progress";
import type { Binder, SerializedQuery } from "./types";

// --- helpers ---

function card(
	id: string,
	setId: string,
	overrides: Partial<CorpusCard> = {},
): CorpusCard {
	return {
		id,
		name: id,
		imageUrl: "",
		imageUrlSmall: "",
		supertype: "Pokémon",
		setId,
		number: "1",
		...overrides,
	};
}

function set(
	id: string,
	releaseDate: string,
	overrides: Partial<PokemonSet> = {},
): PokemonSet {
	return {
		id,
		name: id,
		series: "Base",
		releaseDate,
		total: 10,
		images: { symbol: "", logo: "" },
		...overrides,
	};
}

/** Build a SerializedQuery with all optional fields defaulted; pass only what you need. */
function sq(partial: Partial<SerializedQuery> = {}): SerializedQuery {
	return {
		text: null,
		setId: null,
		dexNumber: null,
		types: [],
		rarities: [],
		supertypes: [],
		subtypes: [],
		yearMin: null,
		yearMax: null,
		exact: false,
		...partial,
	};
}

/** Build a minimal Binder. */
function binder(partial: Partial<Binder> = {}): Binder {
	return {
		id: "b1",
		name: "Test Binder",
		description: null,
		rules: [],
		includeCardIds: [],
		excludeCardIds: [],
		createdAt: 0,
		updatedAt: 0,
		...partial,
	};
}

// --- corpus fixture ---

const cards: CorpusCard[] = [
	card("pika-1", "base1", { supertype: "Pokémon", rarity: "Common" }),
	card("char-1", "base1", { supertype: "Pokémon", rarity: "Rare Holo" }),
	card("bulb-1", "base2", { supertype: "Pokémon", rarity: "Rare Holo" }),
	card("trainer-1", "base1", { supertype: "Trainer", rarity: "Common" }),
	card("old-1", "vintage1", { supertype: "Pokémon", rarity: "Common" }),
	card("new-1", "modern1", { supertype: "Pokémon", rarity: "Common" }),
];

const index = buildIndex(cards);

const setsMap = new Map<string, PokemonSet>([
	["base1", set("base1", "1999-01-09")],
	["base2", set("base2", "1999-06-16")],
	["vintage1", set("vintage1", "1999-11-24")],
	["modern1", set("modern1", "2001-01-01")],
]);

// --- toCorpusQuery ---

test("toCorpusQuery: null text → undefined query", () => {
	const cq = toCorpusQuery(sq());
	expect(cq.query).toBeUndefined();
	expect(cq.relevance).toBe(false);
});

test("toCorpusQuery: non-null text → query string", () => {
	const cq = toCorpusQuery(sq({ text: "Pikachu" }));
	expect(cq.query).toBe("Pikachu");
});

test("toCorpusQuery: null setId/dexNumber/yearMin/yearMax → undefined", () => {
	const cq = toCorpusQuery(sq());
	expect(cq.setId).toBeUndefined();
	expect(cq.dexNumber).toBeUndefined();
	expect(cq.yearMin).toBeUndefined();
	expect(cq.yearMax).toBeUndefined();
});

test("toCorpusQuery: non-null scalar fields pass through", () => {
	const cq = toCorpusQuery(
		sq({ setId: "base1", dexNumber: 25, yearMin: 1999, yearMax: 2000 }),
	);
	expect(cq.setId).toBe("base1");
	expect(cq.dexNumber).toBe(25);
	expect(cq.yearMin).toBe(1999);
	expect(cq.yearMax).toBe(2000);
});

test("toCorpusQuery: exact flag maps through (default false)", () => {
	expect(toCorpusQuery(sq()).exact).toBe(false);
	expect(toCorpusQuery(sq({ exact: true })).exact).toBe(true);
});

test("toCorpusQuery: legacy rule missing exact key defaults to fuzzy (false)", () => {
	// Rules stored before this field existed have no `exact` key. They must keep
	// their original fuzzy behavior, not silently flip to exact.
	const legacy = {
		text: "Pikachu",
		setId: null,
		dexNumber: null,
		types: [],
		rarities: [],
		supertypes: [],
		subtypes: [],
		yearMin: null,
		yearMax: null,
	} as unknown as SerializedQuery;
	expect(toCorpusQuery(legacy).exact).toBe(false);
});

test("toCorpusQuery: filter arrays passed through into filters object", () => {
	const cq = toCorpusQuery(
		sq({
			types: ["Fire"],
			rarities: ["Rare Holo"],
			supertypes: ["Pokémon"],
			subtypes: ["Stage 1"],
		}),
	);
	expect(cq.filters?.types).toEqual(["Fire"]);
	expect(cq.filters?.rarities).toEqual(["Rare Holo"]);
	expect(cq.filters?.supertypes).toEqual(["Pokémon"]);
	expect(cq.filters?.subtypes).toEqual(["Stage 1"]);
});

// --- binderMembers ---

test("binderMembers: no rules, no includes → empty set", () => {
	const members = binderMembers(binder(), index, setsMap);
	expect(members.size).toBe(0);
});

test("binderMembers: single rule returns matched cards", () => {
	const b = binder({
		rules: [{ id: "r1", query: sq({ supertypes: ["Trainer"] }) }],
	});
	const members = binderMembers(b, index, setsMap);
	expect(members.has("trainer-1")).toBe(true);
	expect(members.size).toBe(1);
});

test("binderMembers: two overlapping rules dedup in union (card matching both counted once)", () => {
	// rule 1: all Pokémon → pika-1, char-1, bulb-1, old-1, new-1
	// rule 2: Rare Holo → char-1, bulb-1
	// union should NOT double-count char-1 or bulb-1
	const b = binder({
		rules: [
			{ id: "r1", query: sq({ supertypes: ["Pokémon"] }) },
			{ id: "r2", query: sq({ rarities: ["Rare Holo"] }) },
		],
	});
	const members = binderMembers(b, index, setsMap);
	// All Pokémon cards: pika-1, char-1, bulb-1, old-1, new-1 (5)
	expect(members.has("pika-1")).toBe(true);
	expect(members.has("char-1")).toBe(true);
	expect(members.has("bulb-1")).toBe(true);
	expect(members.has("old-1")).toBe(true);
	expect(members.has("new-1")).toBe(true);
	expect(members.size).toBe(5); // no double-counting
});

test("binderMembers: includeCardIds adds a card no rule matches", () => {
	// rule only matches Trainers; explicitly include a Pokémon
	const b = binder({
		rules: [{ id: "r1", query: sq({ supertypes: ["Trainer"] }) }],
		includeCardIds: ["pika-1"],
	});
	const members = binderMembers(b, index, setsMap);
	expect(members.has("trainer-1")).toBe(true);
	expect(members.has("pika-1")).toBe(true);
	expect(members.size).toBe(2);
});

test("binderMembers: excludeCardIds removes a card a rule matched", () => {
	// rule matches all Pokémon; exclude char-1
	const b = binder({
		rules: [{ id: "r1", query: sq({ supertypes: ["Pokémon"] }) }],
		excludeCardIds: ["char-1"],
	});
	const members = binderMembers(b, index, setsMap);
	expect(members.has("char-1")).toBe(false);
	expect(members.has("pika-1")).toBe(true);
});

test("binderMembers: year-bounded rule keeps only cards in sets up to yearMax", () => {
	// yearMax: 1999 → should include old-1 (1999-11-24), base1 (1999-01-09), base2 (1999-06-16) cards
	// but NOT new-1 (2001-01-01)
	const b = binder({
		rules: [
			{ id: "r1", query: sq({ supertypes: ["Pokémon"], yearMax: 1999 }) },
		],
	});
	const members = binderMembers(b, index, setsMap);
	expect(members.has("old-1")).toBe(true);
	expect(members.has("pika-1")).toBe(true);
	expect(members.has("bulb-1")).toBe(true);
	expect(members.has("char-1")).toBe(true);
	expect(members.has("new-1")).toBe(false); // 2001 — excluded
});

// --- computeBinderProgress ---

test("computeBinderProgress: owned/total counts", () => {
	const b = binder({
		rules: [{ id: "r1", query: sq({ supertypes: ["Pokémon"] }) }],
	});
	// Pokémon cards: pika-1, char-1, bulb-1, old-1, new-1 → total = 5
	const owned = new Set(["pika-1", "char-1"]);
	const progress = computeBinderProgress(b, index, setsMap, owned);
	expect(progress.total).toBe(5);
	expect(progress.owned).toBe(2);
	expect(progress.members.has("pika-1")).toBe(true);
});

test("computeBinderProgress: empty binder → 0/0", () => {
	const progress = computeBinderProgress(
		binder(),
		index,
		setsMap,
		new Set(["pika-1"]),
	);
	expect(progress.total).toBe(0);
	expect(progress.owned).toBe(0);
	expect(progress.members.size).toBe(0);
});

test("computeBinderProgress: owned card not in binder not counted", () => {
	// binder has only trainer-1
	const b = binder({
		rules: [{ id: "r1", query: sq({ supertypes: ["Trainer"] }) }],
	});
	// own pika-1 which is not in binder
	const progress = computeBinderProgress(
		b,
		index,
		setsMap,
		new Set(["pika-1"]),
	);
	expect(progress.total).toBe(1);
	expect(progress.owned).toBe(0);
});

test("computeBinderProgress: include+exclude combined with owned", () => {
	const b = binder({
		rules: [{ id: "r1", query: sq({ supertypes: ["Pokémon"] }) }],
		includeCardIds: ["trainer-1"], // add trainer
		excludeCardIds: ["new-1"], // remove new-1
	});
	// Pokémon (5) + trainer-1 (1) - new-1 (1) = 5
	const owned = new Set(["pika-1", "trainer-1", "new-1"]);
	const progress = computeBinderProgress(b, index, setsMap, owned);
	// members: pika-1, char-1, bulb-1, old-1, trainer-1 (new-1 excluded)
	expect(progress.total).toBe(5);
	// owned from members: pika-1 ✓, trainer-1 ✓, new-1 ✗ (excluded)
	expect(progress.owned).toBe(2);
});
