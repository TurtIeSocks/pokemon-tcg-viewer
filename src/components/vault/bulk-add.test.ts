import { expect, test } from "bun:test";
import { buildIndex } from "../../store/corpus/corpus-engine";
import type { CorpusCard } from "../../store/corpus/corpus-types";
import { cardIdsInSets, partitionUnowned } from "./bulk-add";

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
	cc("xy1-1", "xy1"),
]);

test("cardIdsInSets returns corpus cardIds whose set is in the given setIds", () => {
	expect(cardIdsInSets(index, ["base1"]).sort()).toEqual([
		"base1-1",
		"base1-2",
	]);
	expect(cardIdsInSets(index, ["base1", "xy1"]).length).toBe(3);
	expect(cardIdsInSets(index, ["nope"])).toEqual([]);
});

test("partitionUnowned splits by an owned set", () => {
	const { toAdd, skipped } = partitionUnowned(["a", "b", "c"], new Set(["b"]));
	expect(toAdd).toEqual(["a", "c"]);
	expect(skipped).toBe(1);
});
