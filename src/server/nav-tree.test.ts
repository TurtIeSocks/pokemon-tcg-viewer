import { describe, expect, test } from "bun:test";
import { deriveNavTree, findSeries, findSet } from "./nav-tree";
import type { PokemonSet } from "./card-mappers";

const sets: PokemonSet[] = [
	{ id: "swsh9", name: "Brilliant Stars", series: "Sword & Shield", releaseDate: "2022/02/25", total: 172, images: { symbol: "sym1", logo: "logo1" } },
	{ id: "swsh1", name: "Sword & Shield", series: "Sword & Shield", releaseDate: "2020/02/07", total: 202, images: { symbol: "sym2", logo: "logo2" } },
	{ id: "base1", name: "Base", series: "Base", releaseDate: "1999/01/09", total: 102, images: { symbol: "sym3", logo: "logo3" } },
];

describe("deriveNavTree", () => {
	const tree = deriveNavTree(sets);

	test("groups sets under their series with slugs", () => {
		const ss = findSeries(tree, "sword-shield");
		expect(ss?.name).toBe("Sword & Shield");
		expect(ss?.sets.map((s) => s.slug).sort()).toEqual(
			["brilliant-stars", "sword-shield"].sort(),
		);
	});

	test("resolves a (seriesSlug, setSlug) pair to the set id", () => {
		expect(findSet(tree, "sword-shield", "brilliant-stars")?.id).toBe("swsh9");
		expect(findSet(tree, "base", "base")?.id).toBe("base1");
	});

	test("carries logo/symbol/total through for rendering", () => {
		const set = findSet(tree, "sword-shield", "brilliant-stars");
		expect(set?.logo).toBe("logo1");
		expect(set?.total).toBe(172);
	});

	test("series carry earliest release year", () => {
		expect(findSeries(tree, "sword-shield")?.year).toBe(2020);
	});

	test("unknown slugs resolve to undefined", () => {
		expect(findSeries(tree, "nope")).toBeUndefined();
		expect(findSet(tree, "sword-shield", "nope")).toBeUndefined();
	});

	test("tree is plain-JSON serializable (no Maps)", () => {
		expect(JSON.parse(JSON.stringify(tree))).toEqual(tree);
	});
});
