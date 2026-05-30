import { describe, expect, it } from "bun:test";
import type { PokemonSet } from "../api";
import { groupSetsBySeries } from "./group-sets-by-series";

function makeSet(id: string, series: string): PokemonSet {
	return {
		id,
		name: id,
		series,
		releaseDate: "2020/01/01",
		total: 100,
		images: { symbol: `${id}.png`, logo: `${id}-logo.png` },
	};
}

describe("groupSetsBySeries", () => {
	it("returns an empty array for no sets", () => {
		expect(groupSetsBySeries([])).toEqual([]);
	});

	it("groups sets under their series", () => {
		const groups = groupSetsBySeries([
			makeSet("swsh1", "Sword & Shield"),
			makeSet("swsh45", "Sword & Shield"),
			makeSet("sv1", "Scarlet & Violet"),
		]);
		expect(groups).toHaveLength(2);
		expect(groups[0].series).toBe("Sword & Shield");
		expect(groups[0].sets.map((s) => s.id)).toEqual(["swsh1", "swsh45"]);
		expect(groups[1].series).toBe("Scarlet & Violet");
		expect(groups[1].sets.map((s) => s.id)).toEqual(["sv1"]);
	});

	it("preserves first-seen series order even when sets interleave", () => {
		const groups = groupSetsBySeries([
			makeSet("a", "A"),
			makeSet("b", "B"),
			makeSet("a2", "A"),
		]);
		expect(groups.map((g) => g.series)).toEqual(["A", "B"]);
		expect(groups[0].sets.map((s) => s.id)).toEqual(["a", "a2"]);
		expect(groups[1].sets.map((s) => s.id)).toEqual(["b"]);
	});
});
