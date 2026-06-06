import { describe, expect, it } from "bun:test";
import type { SerializedQuery } from "../store/userland/types";
import { binderRuleLabel } from "./binder-rule-label";

const empty = (): SerializedQuery => ({
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
});

describe("binderRuleLabel — user-story shapes", () => {
	it("dexNumber with dexName lookup → 'Mew'", () => {
		const q: SerializedQuery = { ...empty(), dexNumber: 151 };
		expect(binderRuleLabel(q, { dexName: () => "Mew" })).toBe("Mew");
	});

	it("subtypes + supertypes → label contains both", () => {
		const q: SerializedQuery = {
			...empty(),
			subtypes: ["Full Art"],
			supertypes: ["Trainer"],
		};
		const label = binderRuleLabel(q);
		expect(label).toContain("Trainer");
		expect(label).toContain("Full Art");
	});

	it("subtypes + supertypes ordered: supertype · subtype", () => {
		const q: SerializedQuery = {
			...empty(),
			subtypes: ["Full Art"],
			supertypes: ["Trainer"],
		};
		expect(binderRuleLabel(q)).toBe("Trainer · Full Art");
	});

	it("rarities + yearMax → contains rarity and year sentinel", () => {
		const q: SerializedQuery = {
			...empty(),
			rarities: ["Rare Holo"],
			yearMax: 1999,
		};
		const label = binderRuleLabel(q);
		expect(label).toContain("Rare Holo");
		expect(label).toContain("before 2000");
	});

	it("setId with setName lookup → 'Base'", () => {
		const q: SerializedQuery = { ...empty(), setId: "base1" };
		expect(binderRuleLabel(q, { setName: () => "Base" })).toBe("Base");
	});
});

describe("binderRuleLabel — basics", () => {
	it("returns 'All cards' when query is all-empty", () => {
		expect(binderRuleLabel(empty())).toBe("All cards");
	});

	it("uses setId as fallback when setName returns null", () => {
		const q: SerializedQuery = { ...empty(), setId: "base1" };
		expect(binderRuleLabel(q, { setName: () => null })).toBe("base1");
	});

	it("uses #N as fallback when dexName returns undefined", () => {
		const q: SerializedQuery = { ...empty(), dexNumber: 25 };
		expect(binderRuleLabel(q, { dexName: () => undefined })).toBe("#25");
	});

	it("uses #N fallback when no lookups provided", () => {
		const q: SerializedQuery = { ...empty(), dexNumber: 25 };
		expect(binderRuleLabel(q)).toBe("#25");
	});

	it("text is quoted", () => {
		const q: SerializedQuery = { ...empty(), text: "pikachu" };
		expect(binderRuleLabel(q)).toBe('"pikachu"');
	});

	it("mode=exact + text → '(exact)' suffix on the quoted text", () => {
		const q: SerializedQuery = { ...empty(), text: "pikachu", mode: "exact" };
		expect(binderRuleLabel(q)).toBe('"pikachu" (exact)');
	});

	it("mode=contains + text → '(contains)' suffix on the quoted text", () => {
		const q: SerializedQuery = {
			...empty(),
			text: "pikachu",
			mode: "contains",
		};
		expect(binderRuleLabel(q)).toBe('"pikachu" (contains)');
	});

	it("mode=fuzzy + text → no suffix (default, no annotation)", () => {
		const q: SerializedQuery = { ...empty(), text: "pikachu", mode: "fuzzy" };
		expect(binderRuleLabel(q)).toBe('"pikachu"');
	});

	it("mode=exact without text → no suffix (flag has no visible effect)", () => {
		const q: SerializedQuery = {
			...empty(),
			supertypes: ["Trainer"],
			mode: "exact",
		};
		expect(binderRuleLabel(q)).toBe("Trainer");
	});

	it("both yearMin and yearMax → range with en-dash", () => {
		const q: SerializedQuery = { ...empty(), yearMin: 1999, yearMax: 2002 };
		expect(binderRuleLabel(q)).toBe("1999–2002");
	});

	it("only yearMin → 'from YYYY'", () => {
		const q: SerializedQuery = { ...empty(), yearMin: 2010 };
		expect(binderRuleLabel(q)).toBe("from 2010");
	});

	it("only yearMax → 'before YYYY+1'", () => {
		const q: SerializedQuery = { ...empty(), yearMax: 1999 };
		expect(binderRuleLabel(q)).toBe("before 2000");
	});

	it("multiple types joined with /", () => {
		const q: SerializedQuery = { ...empty(), types: ["Fire", "Water"] };
		expect(binderRuleLabel(q)).toBe("Fire/Water");
	});

	it("full kitchen-sink label", () => {
		const q: SerializedQuery = {
			setId: "base1",
			dexNumber: null,
			supertypes: ["Pokémon"],
			subtypes: ["Basic"],
			rarities: ["Rare Holo"],
			types: ["Fire"],
			text: "charizard",
			yearMin: 1999,
			yearMax: 2000,
			mode: "fuzzy",
		};
		const label = binderRuleLabel(q, { setName: () => "Base" });
		expect(label).toBe(
			'Base · Pokémon · Basic · Rare Holo · Fire · "charizard" · 1999–2000',
		);
	});
});
