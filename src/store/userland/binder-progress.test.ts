import { expect, test } from "bun:test";
import type { PokemonSet } from "../../server/card-mappers";
import { makeBinder, makeCorpusCard } from "../../test-utils";
import { buildIndex } from "../corpus/corpus-engine";
import type { CorpusCard } from "../corpus/corpus-types";
import {
	binderMembers,
	computeBinderProgress,
	type RegionCorpus,
	toCorpusQuery,
} from "./binder-progress";
import type { Binder, SerializedQuery } from "./types";

// --- helpers ---

const card = (
	id: string,
	setId: string,
	overrides: Partial<CorpusCard> = {},
): CorpusCard => makeCorpusCard({ id, setId, ...overrides });

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
		mode: "fuzzy",
		...partial,
	};
}

/** Build a minimal Binder. */
const binder = (partial: Partial<Binder> = {}): Binder =>
	makeBinder({ id: "b1", createdAt: 0, updatedAt: 0, ...partial });

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

// Single-region corpus list for the base cases below (cross-region has its own).
const regions: RegionCorpus[] = [{ index, setsMap }];

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

test("toCorpusQuery: mode maps through (default fuzzy)", () => {
	expect(toCorpusQuery(sq()).mode).toBe("fuzzy");
	expect(toCorpusQuery(sq({ mode: "exact" })).mode).toBe("exact");
	expect(toCorpusQuery(sq({ mode: "contains" })).mode).toBe("contains");
});

test("toCorpusQuery: legacy rule missing mode key defaults to fuzzy", () => {
	// Rules stored before this field existed have no `mode` key. They must keep
	// their original fuzzy behavior.
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
	expect(toCorpusQuery(legacy).mode).toBe("fuzzy");
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
	const members = binderMembers(binder(), regions);
	expect(members.size).toBe(0);
});

test("binderMembers: single rule returns matched cards", () => {
	const b = binder({
		rules: [{ id: "r1", query: sq({ supertypes: ["Trainer"] }) }],
	});
	const members = binderMembers(b, regions);
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
	const members = binderMembers(b, regions);
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
	const members = binderMembers(b, regions);
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
	const members = binderMembers(b, regions);
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
	const members = binderMembers(b, regions);
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
	const progress = computeBinderProgress(b, regions, owned);
	expect(progress.total).toBe(5);
	expect(progress.owned).toBe(2);
	expect(progress.members.has("pika-1")).toBe(true);
});

test("computeBinderProgress: empty binder → 0/0", () => {
	const progress = computeBinderProgress(
		binder(),
		regions,
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
	const progress = computeBinderProgress(b, regions, new Set(["pika-1"]));
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
	const progress = computeBinderProgress(b, regions, owned);
	// members: pika-1, char-1, bulb-1, old-1, trainer-1 (new-1 excluded)
	expect(progress.total).toBe(5);
	// owned from members: pika-1 ✓, trainer-1 ✓, new-1 ✗ (excluded)
	expect(progress.owned).toBe(2);
});

// --- cross-region binders ---

// A separate Asian-region corpus (JP-lineage ids/sets, disjoint from west).
const asiaCards: CorpusCard[] = [
	card("SV1a-1", "SV1a", {
		name: "Charizard",
		supertype: "Pokémon",
		region: "asia",
	}),
	card("SV1a-2", "SV1a", {
		name: "Pikachu",
		supertype: "Pokémon",
		region: "asia",
	}),
];
const asiaIndex = buildIndex(asiaCards, "asia");
const asiaSetsMap = new Map<string, PokemonSet>([
	["SV1a", set("SV1a", "2023-03-10")],
]);
const bothRegions: RegionCorpus[] = [
	{ index, setsMap },
	{ index: asiaIndex, setsMap: asiaSetsMap },
];

// For the NAME-rule tests, the west side needs an explicitly-named card (the
// shared fixture names cards after their id, so a "Charizard" text query would
// never match `char-1`). A dedicated west+asia pair, both named "Charizard".
const westNameIndex = buildIndex(
	[card("base1-cz", "base1", { name: "Charizard", supertype: "Pokémon" })],
	"west",
);
const nameRegions: RegionCorpus[] = [
	{ index: westNameIndex, setsMap },
	{ index: asiaIndex, setsMap: asiaSetsMap },
];

test("binderMembers: a name rule unions matches across regions (own it in either)", () => {
	const b = binder({
		rules: [{ id: "r1", query: sq({ text: "Charizard", mode: "contains" }) }],
	});
	const members = binderMembers(b, nameRegions);
	// The west Charizard AND the JP-lineage Charizard both count toward the goal.
	expect(members.has("base1-cz")).toBe(true);
	expect(members.has("SV1a-1")).toBe(true);
});

test("binderMembers: a west-set rule matches only west; an asia-set rule only asia", () => {
	const west = binder({ rules: [{ id: "r1", query: sq({ setId: "base1" }) }] });
	const asia = binder({ rules: [{ id: "r1", query: sq({ setId: "SV1a" }) }] });
	const westMembers = binderMembers(west, bothRegions);
	const asiaMembers = binderMembers(asia, bothRegions);
	// base1 (west) rule picks up no asia cards, and vice versa.
	expect(westMembers.has("pika-1")).toBe(true);
	expect([...westMembers].some((id) => id.startsWith("SV1a"))).toBe(false);
	expect(asiaMembers.has("SV1a-1")).toBe(true);
	expect(asiaMembers.has("SV1a-2")).toBe(true);
	expect([...asiaMembers].some((id) => !id.startsWith("SV1a"))).toBe(false);
});

test("computeBinderProgress: owned counts span regions", () => {
	const b = binder({
		rules: [{ id: "r1", query: sq({ text: "Charizard", mode: "contains" }) }],
	});
	// Own the JP Charizard but not the west one: 1 of 2 members owned.
	const progress = computeBinderProgress(b, nameRegions, new Set(["SV1a-1"]));
	expect(progress.total).toBe(2);
	expect(progress.owned).toBe(1);
});
