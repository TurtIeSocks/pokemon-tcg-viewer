import { expect, test } from "bun:test";
import { parseSearchQuery } from "./search-grammar";

// Convenience: the single positive normal term of a one-arm/one-term parse.
const soleTerm = (raw: string) => {
	const p = parseSearchQuery(raw);
	expect(p.name.arms.length).toBe(1);
	expect(p.name.arms[0].terms.length).toBe(1);
	return p.name.arms[0].terms[0];
};

// --- empty / whitespace ---

test("empty string → no arms, no fields", () => {
	const p = parseSearchQuery("");
	expect(p.name.arms).toEqual([]);
	expect(p.fields).toEqual({});
});

test("whitespace-only → no arms, no fields", () => {
	const p = parseSearchQuery("   ");
	expect(p.name.arms).toEqual([]);
	expect(p.fields).toEqual({});
});

// --- plain terms (REGRESSION contract: no operators) ---

test("single word → one positive normal term", () => {
	const t = soleTerm("charizard");
	expect(t).toEqual({ text: "charizard", negated: false, literal: false });
});

test("multi-word no-operator → ONE contiguous term (spaces preserved)", () => {
	const t = soleTerm("pikachu ex");
	expect(t).toEqual({ text: "pikachu ex", negated: false, literal: false });
});

test("surrounding whitespace is trimmed off the term", () => {
	const t = soleTerm("  charizard  ");
	expect(t.text).toBe("charizard");
});

// --- comma = OR arms ---

test("comma splits into OR arms", () => {
	const p = parseSearchQuery("charizard, blastoise");
	expect(p.name.arms.length).toBe(2);
	expect(p.name.arms[0].terms[0].text).toBe("charizard");
	expect(p.name.arms[1].terms[0].text).toBe("blastoise");
});

// --- plus = AND terms ---

test("plus splits an arm into AND terms", () => {
	const p = parseSearchQuery("charizard + ex");
	expect(p.name.arms.length).toBe(1);
	expect(p.name.arms[0].terms.map((t) => t.text)).toEqual(["charizard", "ex"]);
	expect(p.name.arms[0].terms.every((t) => !t.negated)).toBe(true);
});

// --- ! = NOT ---

test("leading ! negates a term", () => {
	const t = soleTerm("!ex");
	expect(t).toEqual({ text: "ex", negated: true, literal: false });
});

test("AND with a negated term", () => {
	const p = parseSearchQuery("charizard + !ex");
	expect(p.name.arms[0].terms).toEqual([
		{ text: "charizard", negated: false, literal: false },
		{ text: "ex", negated: true, literal: false },
	]);
});

test("hyphen is NOT negation (ho-oh stays one positive term)", () => {
	const t = soleTerm("ho-oh");
	expect(t).toEqual({ text: "ho-oh", negated: false, literal: false });
});

// --- "..." = quoted literal ---

test("quoted term is literal and preserves spaces", () => {
	const t = soleTerm('"pikachu ex"');
	expect(t).toEqual({ text: "pikachu ex", negated: false, literal: true });
});

test("comma inside quotes is literal, not an OR separator", () => {
	const p = parseSearchQuery('"charizard, blastoise"');
	expect(p.name.arms.length).toBe(1);
	expect(p.name.arms[0].terms[0]).toEqual({
		text: "charizard, blastoise",
		negated: false,
		literal: true,
	});
});

test("operator chars inside quotes are literal (+ and !)", () => {
	const t = soleTerm('"a+b !c"');
	expect(t).toEqual({ text: "a+b !c", negated: false, literal: true });
});

test("negated quoted literal", () => {
	const t = soleTerm('!"pikachu ex"');
	expect(t).toEqual({ text: "pikachu ex", negated: true, literal: true });
});

test("colon inside quotes is literal (not a field op)", () => {
	const p = parseSearchQuery('"type:fire"');
	expect(p.fields).toEqual({});
	expect(p.name.arms[0].terms[0]).toEqual({
		text: "type:fire",
		negated: false,
		literal: true,
	});
});

// --- field operators ---

test("type: extracts a type filter, no name arm", () => {
	const p = parseSearchQuery("type:fire");
	expect(p.fields.types).toEqual(["fire"]);
	expect(p.name.arms).toEqual([]);
});

test("field op anywhere + a name term", () => {
	const p = parseSearchQuery("type:fire charizard");
	expect(p.fields.types).toEqual(["fire"]);
	expect(p.name.arms.length).toBe(1);
	expect(p.name.arms[0].terms[0].text).toBe("charizard");
});

test("field op is GLOBAL — applies across arms, name unaffected", () => {
	const p = parseSearchQuery("charizard + type:fire");
	expect(p.fields.types).toEqual(["fire"]);
	expect(p.name.arms[0].terms.map((t) => t.text)).toEqual(["charizard"]);
});

test("rarity / supertype / subtype ops", () => {
	const p = parseSearchQuery("rarity:common supertype:pokemon subtype:basic");
	expect(p.fields.rarities).toEqual(["common"]);
	expect(p.fields.supertypes).toEqual(["pokemon"]);
	expect(p.fields.subtypes).toEqual(["basic"]);
});

test("set: op maps to setId", () => {
	const p = parseSearchQuery("set:base1");
	expect(p.fields.setId).toBe("base1");
});

test("year:1999 → min=max=1999", () => {
	const p = parseSearchQuery("year:1999");
	expect(p.fields.yearMin).toBe(1999);
	expect(p.fields.yearMax).toBe(1999);
});

test("year:1999-2001 → range", () => {
	const p = parseSearchQuery("year:1999-2001");
	expect(p.fields.yearMin).toBe(1999);
	expect(p.fields.yearMax).toBe(2001);
});

test("comma-in-value → OR within a field dimension", () => {
	const p = parseSearchQuery("type:fire,water");
	expect(p.fields.types).toEqual(["fire", "water"]);
});

test("repeated same field → OR within that dimension", () => {
	const p = parseSearchQuery("type:fire type:water");
	expect(p.fields.types).toEqual(["fire", "water"]);
});

test("quoted field value preserves internal spaces", () => {
	const p = parseSearchQuery('rarity:"rare holo"');
	expect(p.fields.rarities).toEqual(["rare holo"]);
});

test("unknown field prefix is NOT extracted (stays name text)", () => {
	const p = parseSearchQuery("foo:bar");
	expect(p.fields).toEqual({});
	expect(p.name.arms.length).toBe(1);
	expect(p.name.arms[0].terms[0].text).toContain("foo:bar");
});

test("plural field aliases are accepted", () => {
	const p = parseSearchQuery("types:fire rarities:common");
	expect(p.fields.types).toEqual(["fire"]);
	expect(p.fields.rarities).toEqual(["common"]);
});

// --- fail-open / degenerate (reduce to today's behavior, never throw) ---

test("lone ! → no name filter (matches all, like empty)", () => {
	const p = parseSearchQuery("!");
	expect(p.name.arms).toEqual([]);
});

test("trailing + drops the empty term", () => {
	const p = parseSearchQuery("charizard +");
	expect(p.name.arms.length).toBe(1);
	expect(p.name.arms[0].terms.map((t) => t.text)).toEqual(["charizard"]);
});

test("trailing comma drops the empty arm (keeps the valid one)", () => {
	const p = parseSearchQuery("charizard,");
	expect(p.name.arms.length).toBe(1);
	expect(p.name.arms[0].terms[0].text).toBe("charizard");
});

test("bare comma → no arms", () => {
	expect(parseSearchQuery(",").name.arms).toEqual([]);
});

test("bare plus → no arms", () => {
	expect(parseSearchQuery("+").name.arms).toEqual([]);
});

test("unbalanced quote runs to end-of-string as a literal", () => {
	const p = parseSearchQuery('"charizard');
	expect(p.name.arms.length).toBe(1);
	expect(p.name.arms[0].terms[0]).toEqual({
		text: "charizard",
		negated: false,
		literal: true,
	});
});

test("never throws on adversarial punctuation soup", () => {
	for (const raw of ["!!!", '"""', "+,+,", ":::", "a:b:c", '""', "! + ,"]) {
		expect(() => parseSearchQuery(raw)).not.toThrow();
	}
});

// --- combined kitchen-sink ---

test("kitchen sink: fields + OR + AND + NOT + quotes", () => {
	const p = parseSearchQuery(
		'type:fire charizard, blastoise + !ex rarity:"rare holo"',
	);
	expect(p.fields.types).toEqual(["fire"]);
	expect(p.fields.rarities).toEqual(["rare holo"]);
	expect(p.name.arms.length).toBe(2);
	expect(p.name.arms[0].terms.map((t) => t.text)).toEqual(["charizard"]);
	expect(p.name.arms[1].terms).toEqual([
		{ text: "blastoise", negated: false, literal: false },
		{ text: "ex", negated: true, literal: false },
	]);
});
