import { describe, expect, test } from "bun:test";
import { buildCorpusQuery, type ListSearch } from "./card-query";

const empty: ListSearch = {
	q: "",
	types: [],
	rarity: [],
	supertype: [],
	subtypes: [],
	view: "grid",
};

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
		expect(q.dexNumber).toBe(6);
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
});
