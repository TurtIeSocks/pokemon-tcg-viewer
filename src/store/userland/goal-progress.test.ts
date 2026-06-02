import { expect, test } from "bun:test";
import type { PokemonSet } from "../../server/card-mappers";
import { buildIndex } from "../corpus/corpus-engine";
import type { CorpusCard } from "../corpus/corpus-types";
import { computeGoalProgress } from "./goal-progress";
import type { Goal } from "./types";

function cc(id: string, setId: string): CorpusCard {
	return {
		id,
		name: id,
		imageUrl: "",
		imageUrlSmall: "",
		supertype: "P",
		setId,
		number: "1",
	};
}
const index = buildIndex([
	cc("base1-1", "base1"),
	cc("base1-2", "base1"),
	cc("base2-1", "base2"),
	cc("xy1-1", "xy1"),
]);
const setsById = new Map<string, PokemonSet>([
	[
		"base1",
		{
			id: "base1",
			name: "Base",
			series: "Base",
			releaseDate: "1999",
			total: 2,
			images: { symbol: "", logo: "" },
		},
	],
	[
		"base2",
		{
			id: "base2",
			name: "Jungle",
			series: "Base",
			releaseDate: "1999",
			total: 1,
			images: { symbol: "", logo: "" },
		},
	],
	[
		"xy1",
		{
			id: "xy1",
			name: "XY",
			series: "XY",
			releaseDate: "2014",
			total: 1,
			images: { symbol: "", logo: "" },
		},
	],
]);
function goal(targets: Goal["targets"]): Goal {
	return {
		id: "g",
		name: "G",
		description: null,
		targets,
		createdAt: 0,
		updatedAt: 0,
	};
}

test("set/series/card target progress", () => {
	const owned = new Set(["base1-1", "base2-1"]);
	const p = computeGoalProgress(
		goal([
			{ kind: "set", setId: "base1" },
			{ kind: "series", series: "Base" },
			{ kind: "card", cardId: "xy1-1" },
		]),
		owned,
		index,
		setsById,
	);
	expect(p.targets[0]).toMatchObject({ label: "Base", owned: 1, total: 2 }); // base1: own base1-1 of 2
	expect(p.targets[1]).toMatchObject({ label: "Base", owned: 2, total: 3 }); // series Base = base1(2)+base2(1)=3 total, own 2
	expect(p.targets[2]).toMatchObject({ label: "xy1-1", owned: 0, total: 1 });
});

test("overall dedups overlapping targets (set ⊂ series)", () => {
	const owned = new Set(["base1-1"]);
	// series Base covers base1-1,base1-2,base2-1 (3); set base1 ⊂ it → no double count
	const p = computeGoalProgress(
		goal([
			{ kind: "series", series: "Base" },
			{ kind: "set", setId: "base1" },
		]),
		owned,
		index,
		setsById,
	);
	expect(p.overall).toEqual({ owned: 1, total: 3 });
});

test("overall adds an explicit card target outside covered sets", () => {
	const p = computeGoalProgress(
		goal([
			{ kind: "set", setId: "base1" },
			{ kind: "card", cardId: "xy1-1" },
		]),
		new Set(["xy1-1"]),
		index,
		setsById,
	);
	expect(p.overall).toEqual({ owned: 1, total: 3 }); // base1(2) + xy1-1(1)
});
