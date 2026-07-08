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

	test("card filter sets ids in the global branch", () => {
		expect(buildCorpusQuery({ ...empty, ids: ["112"] }, {}).ids).toEqual([
			"112",
		]);
	});
	test("card filter sets ids within a set", () => {
		const q = buildCorpusQuery({ ...empty, ids: ["25"] }, { setId: "swsh9" });
		expect(q.setId).toBe("swsh9");
		expect(q.ids).toEqual(["25"]);
	});
	test("card filter forwards multiple selected ids (dex + trainer name)", () => {
		expect(
			buildCorpusQuery({ ...empty, ids: ["25", "Barry"] }, {}).ids,
		).toEqual(["25", "Barry"]);
	});
	test("dex page context ignores the ids filter (dexNumbers wins)", () => {
		const q = buildCorpusQuery({ ...empty, ids: ["25"] }, { dexNumber: 6 });
		expect(q.dexNumbers).toEqual([6]);
		expect(q.ids).toBeUndefined();
	});
	test("no card filter → undefined ids in global + set branches", () => {
		expect(buildCorpusQuery(empty, {}).ids).toBeUndefined();
		expect(buildCorpusQuery(empty, { setId: "swsh9" }).ids).toBeUndefined();
	});

	test("supertype context → locked supertype, chronological, no query relevance", () => {
		const q = buildCorpusQuery(empty, { supertype: "Trainer" });
		expect(q.setId).toBeNull();
		expect(q.filters?.supertypes).toEqual(["Trainer"]);
		expect(q.chronological).toBe(true);
		expect(q.nameSlug).toBeUndefined();
		expect(q.relevance).toBe(false);
	});
	test("supertype (Trainer/Energy) context sets excludeDexCards", () => {
		expect(
			buildCorpusQuery(empty, { supertype: "Trainer" }).excludeDexCards,
		).toBe(true);
		expect(
			buildCorpusQuery(empty, { supertype: "Energy" }).excludeDexCards,
		).toBe(true);
	});
	test("card filter (ids) applies on a supertype-anchored page (Trainer/Energy)", () => {
		const q = buildCorpusQuery(
			{ ...empty, ids: ["Barry"] },
			{ supertype: "Trainer" },
		);
		expect(q.ids).toEqual(["Barry"]);
		expect(q.filters?.supertypes).toEqual(["Trainer"]);
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
