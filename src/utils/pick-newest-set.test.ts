import { describe, expect, it } from "bun:test";
import type { PokemonSet } from "../api";
import { pickNewestSetId } from "./pick-newest-set";

const make = (id: string, releaseDate: string): PokemonSet => ({
	id,
	name: id,
	series: "S",
	releaseDate,
	total: 1,
	images: { symbol: "", logo: "" },
});

describe("pickNewestSetId", () => {
	it("returns the id of the set with the latest releaseDate", () => {
		const sets = [
			make("base1", "1999/01/09"),
			make("sv8", "2024/11/08"),
			make("swsh1", "2020/02/07"),
		];
		expect(pickNewestSetId(sets)).toBe("sv8");
	});

	it("returns null for an empty list", () => {
		expect(pickNewestSetId([])).toBeNull();
	});

	it("breaks ties deterministically by id", () => {
		const sets = [make("b", "2024/01/01"), make("a", "2024/01/01")];
		expect(pickNewestSetId(sets)).toBe("a");
	});
});
