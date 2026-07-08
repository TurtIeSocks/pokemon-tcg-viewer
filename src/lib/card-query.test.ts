import { describe, expect, test } from "bun:test";
import { buildCorpusQuery } from "./card-query";
import { LIST_SEARCH_DEFAULTS } from "./list-search";

const empty = LIST_SEARCH_DEFAULTS;

describe("buildCorpusQuery", () => {
	test("set context, no query → set-scoped natural order", () => {
		const q = buildCorpusQuery(empty, { setId: "swsh9" });
		expect(q.setId).toBe("swsh9");
		expect(q.query).toBeUndefined();
		expect(q.relevance).toBe(false);
	});
	test("name query with no context → global relevance", () => {
		const q = buildCorpusQuery({ ...empty, q: "charizard" }, {});
		expect(q.query).toBe("charizard");
		expect(q.setId).toBeNull();
		expect(q.relevance).toBe(true);
	});
	test("set context + query → set-scoped within the set, no relevance", () => {
		const q = buildCorpusQuery({ ...empty, q: "char" }, { setId: "swsh9" });
		expect(q.setId).toBe("swsh9");
		expect(q.query).toBe("char");
		expect(q.relevance).toBe(false);
	});
	test("dex context → dex-scoped natural order", () => {
		const q = buildCorpusQuery(empty, { dexNumber: 6 });
		expect(q.dexNumbers).toEqual([6]);
		expect(q.relevance).toBe(false);
	});
	test("filters pass through; empty arrays omitted", () => {
		const q = buildCorpusQuery(
			{ ...empty, types: ["fire"], rarity: ["Rare Holo"] },
			{ setId: "swsh9" },
		);
		expect(q.filters).toEqual({
			types: ["fire"],
			rarities: ["Rare Holo"],
			supertypes: undefined,
			subtypes: undefined,
		});
	});
	test("yearMin/yearMax null → undefined in CorpusQuery", () => {
		const q = buildCorpusQuery(empty, {});
		expect(q.yearMin).toBeUndefined();
		expect(q.yearMax).toBeUndefined();
	});
	test("yearMin/yearMax forwarded in set context", () => {
		const q = buildCorpusQuery(
			{ ...empty, yearMin: 2020, yearMax: 2023 },
			{ setId: "swsh9" },
		);
		expect(q.yearMin).toBe(2020);
		expect(q.yearMax).toBe(2023);
	});
	test("yearMin/yearMax forwarded in dex context", () => {
		const q = buildCorpusQuery(
			{ ...empty, yearMin: 1999, yearMax: null },
			{ dexNumber: 6 },
		);
		expect(q.yearMin).toBe(1999);
		expect(q.yearMax).toBeUndefined();
	});
	test("yearMin/yearMax forwarded in global context", () => {
		const q = buildCorpusQuery({ ...empty, yearMin: null, yearMax: 2022 }, {});
		expect(q.yearMin).toBeUndefined();
		expect(q.yearMax).toBe(2022);
	});
	test("mode defaults to 'fuzzy'", () => {
		expect(buildCorpusQuery(empty, {}).mode).toBe("fuzzy");
	});
	test("mode forwarded in global, set, and dex contexts", () => {
		expect(buildCorpusQuery({ ...empty, mode: "exact" }, {}).mode).toBe(
			"exact",
		);
		expect(
			buildCorpusQuery({ ...empty, mode: "contains" }, { setId: "swsh9" }).mode,
		).toBe("contains");
		expect(
			buildCorpusQuery({ ...empty, mode: "exact" }, { dexNumber: 6 }).mode,
		).toBe("exact");
	});

	test("pokemon filter sets dexNumbers in the global branch", () => {
		expect(
			buildCorpusQuery({ ...empty, pokemon: [112] }, {}).dexNumbers,
		).toEqual([112]);
	});
	test("pokemon filter sets dexNumbers within a set", () => {
		const q = buildCorpusQuery({ ...empty, pokemon: [25] }, { setId: "swsh9" });
		expect(q.setId).toBe("swsh9");
		expect(q.dexNumbers).toEqual([25]);
	});
	test("pokemon filter forwards multiple selected dex numbers", () => {
		expect(
			buildCorpusQuery({ ...empty, pokemon: [25, 6] }, {}).dexNumbers,
		).toEqual([25, 6]);
	});
	test("dex context wins over the pokemon filter", () => {
		const q = buildCorpusQuery({ ...empty, pokemon: [25] }, { dexNumber: 6 });
		expect(q.dexNumbers).toEqual([6]);
	});
	test("no pokemon filter → empty dexNumbers in global + set branches", () => {
		expect(buildCorpusQuery(empty, {}).dexNumbers).toEqual([]);
		expect(buildCorpusQuery(empty, { setId: "swsh9" }).dexNumbers).toEqual([]);
	});

	test("supertype context → locked supertype, chronological, no query relevance", () => {
		const q = buildCorpusQuery(empty, { supertype: "Trainer" });
		expect(q.setId).toBeNull();
		expect(q.filters?.supertypes).toEqual(["Trainer"]);
		expect(q.chronological).toBe(true);
		expect(q.nameSlug).toBeUndefined();
		expect(q.relevance).toBe(false);
	});
	test("supertype + nameSlug context → name-anchored", () => {
		const q = buildCorpusQuery(empty, {
			supertype: "Trainer",
			nameSlug: "rare-candy",
		});
		expect(q.nameSlug).toBe("rare-candy");
		expect(q.filters?.supertypes).toEqual(["Trainer"]);
	});
	test("supertype context + query → relevance on", () => {
		expect(
			buildCorpusQuery({ ...empty, q: "candy" }, { supertype: "Trainer" })
				.relevance,
		).toBe(true);
	});
	test("supertype lock overrides the user's supertype filter", () => {
		const q = buildCorpusQuery(
			{ ...empty, supertype: ["Pokémon"] },
			{ supertype: "Energy" },
		);
		expect(q.filters?.supertypes).toEqual(["Energy"]);
	});

	test("forwards sort + dir to the corpus query", () => {
		const q = buildCorpusQuery({ ...empty, sort: "name", dir: "desc" }, {});
		expect(q.sort).toBe("name");
		expect(q.dir).toBe("desc");
	});
	test("default sort still forwards (engine treats it as the context order)", () => {
		expect(buildCorpusQuery(empty, {}).sort).toBe("default");
	});
});
