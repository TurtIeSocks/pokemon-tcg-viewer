import { describe, expect, test } from "bun:test";
import { buildCorpusQuery, type ListSearch } from "./card-query";

const empty: ListSearch = {
	q: "",
	types: [],
	rarity: [],
	supertype: [],
	subtypes: [],
	scope: "all",
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
	test("set context + scope=set + query → set-scoped, no relevance", () => {
		const q = buildCorpusQuery(
			{ ...empty, q: "char", scope: "set" },
			{ setId: "swsh9" },
		);
		expect(q.setId).toBe("swsh9");
		expect(q.query).toBe("char");
		expect(q.relevance).toBe(false);
	});
	test("set context + scope=all + query → global search (ignore set)", () => {
		const q = buildCorpusQuery(
			{ ...empty, q: "char", scope: "all" },
			{ setId: "swsh9" },
		);
		expect(q.setId).toBeNull();
		expect(q.relevance).toBe(true);
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
			rarity: ["Rare Holo"],
			supertype: undefined,
			subtypes: undefined,
		});
	});
});
