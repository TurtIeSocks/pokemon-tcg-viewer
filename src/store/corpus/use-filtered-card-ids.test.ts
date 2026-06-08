import { expect, test } from "bun:test";
import { LIST_SEARCH_DEFAULTS } from "../../lib/list-search";
import type { PokemonSet } from "../../server/card-mappers";
import { makeCorpusCard } from "../../test-utils";
import { buildIndex } from "./corpus-engine";
import { filterCardIds } from "./use-filtered-card-ids";

const sets: PokemonSet[] = [
	{
		id: "base1",
		name: "Base",
		series: "Base",
		releaseDate: "1999/01/09",
		total: 102,
		images: { symbol: "", logo: "" },
	},
];

const index = buildIndex([
	makeCorpusCard({ id: "base1-3", name: "Chansey", setId: "base1" }),
	makeCorpusCard({ id: "base1-4", name: "Charizard", setId: "base1" }),
	makeCorpusCard({ id: "base1-5", name: "Clefairy", setId: "base1" }),
	makeCorpusCard({ id: "swsh1-1", name: "Chansey", setId: "swsh1" }),
]);

const setCtx = { setId: "base1" };
const seed = ["base1-3", "base1-4", "base1-5"];

test("returns the seed unchanged until the corpus is in memory", () => {
	expect(
		filterCardIds(null, sets, LIST_SEARCH_DEFAULTS, setCtx, new Set(), seed),
	).toEqual(seed);
	expect(
		filterCardIds(index, null, LIST_SEARCH_DEFAULTS, setCtx, new Set(), seed),
	).toEqual(seed);
});

test("a text query narrows the target to matching cards within the set", () => {
	const ids = filterCardIds(
		index,
		sets,
		{ ...LIST_SEARCH_DEFAULTS, q: "Chansey" },
		setCtx,
		new Set(),
		seed,
	);
	// Only Base-set Chansey — not Charizard, and not the swsh1 Chansey (set scope).
	expect(ids).toEqual(["base1-3"]);
});

test("with no query the target is the full set (corpus order)", () => {
	const ids = filterCardIds(
		index,
		sets,
		LIST_SEARCH_DEFAULTS,
		setCtx,
		new Set(),
		seed,
	);
	expect(new Set(ids)).toEqual(new Set(["base1-3", "base1-4", "base1-5"]));
});

test("the owned/missing view filter is applied to the target", () => {
	const owned = new Set(["base1-3"]);
	const missing = filterCardIds(
		index,
		sets,
		{ ...LIST_SEARCH_DEFAULTS, owned: "missing" },
		setCtx,
		owned,
		seed,
	);
	expect(missing).not.toContain("base1-3");
	expect(new Set(missing)).toEqual(new Set(["base1-4", "base1-5"]));

	const ownedOnly = filterCardIds(
		index,
		sets,
		{ ...LIST_SEARCH_DEFAULTS, owned: "owned" },
		setCtx,
		owned,
		seed,
	);
	expect(ownedOnly).toEqual(["base1-3"]);
});
