import { expect, test } from "bun:test";
import { groupSubtypes } from "./subtype-groups";

test("buckets values into ordered groups, Stage in evolution order", () => {
	const groups = groupSubtypes([
		"Supporter",
		"Stage 2",
		"ex",
		"Basic",
		"Item",
		"Stage 1",
		"Special",
	]);
	expect(groups.map((g) => g.label)).toEqual([
		"Stage",
		"Pokémon Mechanic",
		"Trainer",
		"Energy",
	]);
	expect(groups[0].items).toEqual(["Basic", "Stage 1", "Stage 2"]); // evolution order
	expect(groups[1].items).toEqual(["ex"]);
	expect(groups[2].items).toEqual(["Item", "Supporter"]); // alpha
	expect(groups[3].items).toEqual(["Special"]);
});

test("unknown values fall into Other, listed last", () => {
	const groups = groupSubtypes(["Basic", "Frobnicate"]);
	expect(groups.at(-1)).toEqual({ label: "Other", items: ["Frobnicate"] });
});

test("omits empty groups", () => {
	const groups = groupSubtypes(["Item"]);
	expect(groups).toEqual([{ label: "Trainer", items: ["Item"] }]);
});

test("groups TCGdex unspaced Stage1/Stage2 under Stage", () => {
	const groups = groupSubtypes(["Stage1", "Stage2", "Basic"]);
	expect(groups).toEqual([
		{ label: "Stage", items: ["Basic", "Stage1", "Stage2"] },
	]);
});
