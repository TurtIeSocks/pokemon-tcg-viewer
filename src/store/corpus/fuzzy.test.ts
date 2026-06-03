import { expect, test } from "bun:test";
import { editDistance, matchName, normalize } from "./fuzzy";

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

function matchExact(q: string, name: string) {
	const n = normalize(name);
	return matchName(normalize(q), n, n.length ? [n] : [], true);
}

test("exact mode keeps exact/prefix/substring but drops fuzzy (tier 3)", () => {
	expect(matchExact("charizard", "Charizard")?.tier).toBe(0); // exact
	expect(matchExact("char", "Charizard")?.tier).toBe(1); // prefix
	expect(matchExact("izard", "Charizard")?.tier).toBe(2); // substring
	expect(matchExact("charizrd", "Charizard")).toBeNull(); // typo: was tier 3, now rejected
});

test("exact mode rejects the Brock's Rhydon → Rhyhorn near-miss", () => {
	expect(matchExact("brocksrhydon", "Brock's Rhyhorn")).toBeNull();
	expect(matchExact("brocksrhydon", "Brock's Rhydon")?.tier).toBe(0); // real card survives
});
