import { describe, expect, it } from "bun:test";
import type { ListContext, ListSearch } from "./card-query";
import { isRuleCapturable, toSerializedQuery } from "./serialized-query";

const baseSearch = (): ListSearch => ({
	q: "",
	types: [],
	rarity: [],
	supertype: [],
	subtypes: [],
	view: "grid",
	owned: "all",
	yearMin: null,
	yearMax: null,
});

const baseCtx = (): ListContext => ({});

describe("toSerializedQuery", () => {
	it("maps field names: rarity→rarities, supertype→supertypes", () => {
		const s = baseSearch();
		s.rarity = ["Rare Holo"];
		s.supertype = ["Trainer"];
		const q = toSerializedQuery(s, baseCtx());
		expect(q.rarities).toEqual(["Rare Holo"]);
		expect(q.supertypes).toEqual(["Trainer"]);
		// original ListSearch fields should NOT appear on SerializedQuery
		expect((q as unknown as Record<string, unknown>).rarity).toBeUndefined();
		expect((q as unknown as Record<string, unknown>).supertype).toBeUndefined();
	});

	it("trims q and maps blank to null", () => {
		const s = baseSearch();
		s.q = "   ";
		expect(toSerializedQuery(s, baseCtx()).text).toBeNull();

		s.q = "  pikachu  ";
		expect(toSerializedQuery(s, baseCtx()).text).toBe("pikachu");
	});

	it("maps ctx.setId and ctx.dexNumber", () => {
		const q = toSerializedQuery(baseSearch(), {
			setId: "base1",
			dexNumber: 151,
		});
		expect(q.setId).toBe("base1");
		expect(q.dexNumber).toBe(151);
	});

	it("uses null for absent ctx fields", () => {
		const q = toSerializedQuery(baseSearch(), {});
		expect(q.setId).toBeNull();
		expect(q.dexNumber).toBeNull();
	});

	it("clones arrays (mutations to source do not affect result)", () => {
		const s = baseSearch();
		s.types = ["Fire"];
		const q = toSerializedQuery(s, baseCtx());
		s.types.push("Water");
		expect(q.types).toEqual(["Fire"]);
	});

	it("passes yearMin/yearMax through", () => {
		const s = baseSearch();
		s.yearMin = 1999;
		s.yearMax = 2002;
		const q = toSerializedQuery(s, baseCtx());
		expect(q.yearMin).toBe(1999);
		expect(q.yearMax).toBe(2002);
	});

	it("ignores owned and view", () => {
		const s = baseSearch();
		s.owned = "owned";
		s.view = "timeline";
		const q = toSerializedQuery(s, baseCtx()) as unknown as Record<
			string,
			unknown
		>;
		expect(q.owned).toBeUndefined();
		expect(q.view).toBeUndefined();
	});
});

describe("isRuleCapturable", () => {
	const empty = () => ({
		text: null,
		setId: null,
		dexNumber: null,
		types: [] as string[],
		rarities: [] as string[],
		supertypes: [] as string[],
		subtypes: [] as string[],
		yearMin: null,
		yearMax: null,
	});

	it("returns false for all-empty query", () => {
		expect(isRuleCapturable(empty())).toBe(false);
	});

	it("returns true when text present", () => {
		expect(isRuleCapturable({ ...empty(), text: "pikachu" })).toBe(true);
	});

	it("returns true when setId present", () => {
		expect(isRuleCapturable({ ...empty(), setId: "base1" })).toBe(true);
	});

	it("returns true when dexNumber present", () => {
		expect(isRuleCapturable({ ...empty(), dexNumber: 25 })).toBe(true);
	});

	it("returns true when types non-empty", () => {
		expect(isRuleCapturable({ ...empty(), types: ["Fire"] })).toBe(true);
	});

	it("returns true when rarities non-empty", () => {
		expect(isRuleCapturable({ ...empty(), rarities: ["Rare Holo"] })).toBe(
			true,
		);
	});

	it("returns true when supertypes non-empty", () => {
		expect(isRuleCapturable({ ...empty(), supertypes: ["Trainer"] })).toBe(
			true,
		);
	});

	it("returns true when subtypes non-empty", () => {
		expect(isRuleCapturable({ ...empty(), subtypes: ["Full Art"] })).toBe(true);
	});

	it("returns true when yearMin present", () => {
		expect(isRuleCapturable({ ...empty(), yearMin: 1999 })).toBe(true);
	});

	it("returns true when yearMax present", () => {
		expect(isRuleCapturable({ ...empty(), yearMax: 2005 })).toBe(true);
	});
});
