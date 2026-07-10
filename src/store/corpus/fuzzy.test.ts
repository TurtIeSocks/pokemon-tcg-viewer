import { expect, test } from "bun:test";
import { editDistance, matchName, matchNameExpr, normalize } from "./fuzzy";
import { parseSearchQuery } from "./search-grammar";

test("normalize lowercases and strips accents/punctuation/spaces", () => {
	expect(normalize("Mr. Mime")).toBe("mrmime");
	expect(normalize("Farfetch'd")).toBe("farfetchd");
	expect(normalize("Flabébé")).toBe("flabebe");
	expect(normalize("Porygon-Z")).toBe("porygonz");
});

test("editDistance handles substitutions, insertions, transpositions", () => {
	expect(editDistance("charizard", "charizard")).toBe(0);
	expect(editDistance("charizrd", "charizard")).toBe(1); // deletion
	expect(editDistance("charizadr", "charizard")).toBe(1); // transposition
});

function match(q: string, name: string) {
	const n = normalize(name);
	return matchName(normalize(q), n, n.length ? [n] : []);
}

function matchMode(
	q: string,
	name: string,
	mode: Parameters<typeof matchName>[3],
) {
	const n = normalize(name);
	return matchName(normalize(q), n, n.length ? [n] : [], mode);
}

test("tiers: exact < prefix < substring < fuzzy", () => {
	expect(match("charizard", "Charizard")?.tier).toBe(0);
	expect(match("char", "Charizard")?.tier).toBe(1);
	expect(match("izard", "Charizard")?.tier).toBe(2);
	expect(match("charizrd", "Charizard")?.tier).toBe(3); // typo
});

test("rejects non-matches beyond the edit-distance budget", () => {
	expect(match("pikachu", "Charizard")).toBeNull();
});

test("short queries get a tighter fuzzy budget", () => {
	expect(match("pikc", "Pika")?.tier).toBe(3); // distance 1 ok
	expect(match("xyzw", "Pika")).toBeNull(); // distance > 1
});

// --- Exact mode ---

test("exact mode: whole-name query matches (tier 0)", () => {
	expect(matchMode("charizard", "Charizard", "exact")?.tier).toBe(0);
});

test("exact mode: substring query rejects (no prefix/substring/fuzzy)", () => {
	expect(matchMode("char", "Charizard", "exact")).toBeNull();
	expect(matchMode("izard", "Charizard", "exact")).toBeNull();
});

test("exact mode: 1-edit typo rejects", () => {
	expect(matchMode("charizrd", "Charizard", "exact")).toBeNull();
});

test("exact mode: normalized-exact — 'mr. mime' matches 'Mr Mime'", () => {
	// normalize("mr. mime") = "mrmime", normalize("Mr Mime") = "mrmime"
	expect(matchMode("mr. mime", "Mr Mime", "exact")?.tier).toBe(0);
});

test("exact mode: rejects the Brock's Rhydon → Rhyhorn near-miss", () => {
	expect(matchMode("brocksrhydon", "Brock's Rhyhorn", "exact")).toBeNull();
	expect(matchMode("brocksrhydon", "Brock's Rhydon", "exact")?.tier).toBe(0);
});

// --- Contains mode ---

test("contains mode: exact + prefix + substring all match", () => {
	expect(matchMode("charizard", "Charizard", "contains")?.tier).toBe(0);
	expect(matchMode("char", "Charizard", "contains")?.tier).toBe(1);
	expect(matchMode("izard", "Charizard", "contains")?.tier).toBe(2);
});

test("contains mode: typo rejects (no edit-distance pass)", () => {
	expect(matchMode("charizrd", "Charizard", "contains")).toBeNull();
});

// --- Fuzzy mode (default) ---

test("fuzzy mode: accepts a 1-edit typo (tier 3)", () => {
	expect(matchMode("charizrd", "Charizard", "fuzzy")?.tier).toBe(3);
});

test("contains mode keeps exact/prefix/substring but drops fuzzy (tier 3) — old 'exact=true' behavior", () => {
	expect(matchMode("charizard", "Charizard", "contains")?.tier).toBe(0); // exact
	expect(matchMode("char", "Charizard", "contains")?.tier).toBe(1); // prefix
	expect(matchMode("izard", "Charizard", "contains")?.tier).toBe(2); // substring
	expect(matchMode("charizrd", "Charizard", "contains")).toBeNull(); // typo rejected
});

// --- matchNameExpr (grammar evaluator) ---

function evalExpr(
	raw: string,
	name: string,
	mode: Parameters<typeof matchName>[3] = "fuzzy",
) {
	const expr = parseSearchQuery(raw).name;
	const n = normalize(name);
	const tokens = name.split(/[\s-]+/).flatMap((t) => {
		const x = normalize(t);
		return x ? [x] : [];
	});
	return matchNameExpr(expr, n, tokens, mode);
}

test("empty expr matches every name (tier 2, like an empty query)", () => {
	const r = evalExpr("", "Charizard");
	expect(r.matched).toBe(true);
	expect(r.tier).toBe(2);
});

test("single positive term keeps matchName's tier (exact/prefix/substring)", () => {
	expect(evalExpr("charizard", "Charizard").tier).toBe(0);
	expect(evalExpr("char", "Charizard").tier).toBe(1);
	expect(evalExpr("izard", "Charizard").tier).toBe(2);
});

test("single positive fuzzy term keeps the typo tier + distance", () => {
	const r = evalExpr("charizrd", "Charizard");
	expect(r.matched).toBe(true);
	expect(r.tier).toBe(3);
	expect(r.distance).toBe(1);
});

test("AND: all terms must match; tier is the WORST term's tier", () => {
	const r = evalExpr("char + izard", "Charizard");
	expect(r.matched).toBe(true);
	expect(r.tier).toBe(2); // prefix(1) AND substring(2) → worst = 2
});

test("AND: one missing term → not matched", () => {
	expect(evalExpr("char + xyzzy", "Charizard").matched).toBe(false);
});

test("NOT: excludes a name that contains the negated term", () => {
	expect(evalExpr("!v", "Charizard V").matched).toBe(false);
	expect(evalExpr("!v", "Charizard").matched).toBe(true);
});

test("AND + NOT combined", () => {
	expect(evalExpr("char + !v", "Charizard").matched).toBe(true);
	expect(evalExpr("char + !v", "Charizard V").matched).toBe(false);
});

test("pure-negation arm matches (and reports the neutral tier 2)", () => {
	const r = evalExpr("!ex", "Charizard");
	expect(r.matched).toBe(true);
	expect(r.tier).toBe(2);
});

test("OR: matched if ANY arm matches, tier is the BEST arm's tier", () => {
	const r = evalExpr("izard, char", "Charizard");
	expect(r.matched).toBe(true);
	expect(r.tier).toBe(1); // substring(2) vs prefix(1) → best = 1
});

test("OR: no arm matches → not matched", () => {
	expect(evalExpr("pikachu, blastoise", "Charizard").matched).toBe(false);
});

test("mode threads through leaves (exact rejects a prefix)", () => {
	expect(evalExpr("char", "Charizard", "exact").matched).toBe(false);
	expect(evalExpr("charizard", "Charizard", "exact").tier).toBe(0);
});
