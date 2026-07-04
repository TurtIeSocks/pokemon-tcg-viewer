import { expect, test } from "bun:test";
import type { SetHistory } from "../src/lib/corpus/price-history";
import type { PricesBlob } from "../src/lib/corpus/price-types";
import { buildSetHistories } from "./build-history";

const fx = { base: "EUR" as const, date: "x", rates: { USD: 1.09 } };
const blob: PricesBlob = {
	v: 1,
	date: "2026-07-03",
	fx,
	sources: { tp: "2026-07-03", cm: "2026-07-03" },
	cards: {
		"base1-4": { tp: { H: [72034, 1] } },
		"base1-2": { cm: [1000, null, null, null] }, // €10 → $10.90
		"sv1-5": { tp: { N: [500, 1] } },
	},
};
const cardToSet = new Map([
	["base1-4", "base1"],
	["base1-2", "base1"],
	["sv1-5", "sv1"],
]);

test("buildSetHistories groups by set and appends today's representative market", () => {
	const out = buildSetHistories({
		blob,
		cardToSet,
		priorBySet: new Map(),
		todayDay: 100,
	});
	expect(out.get("base1")).toEqual({
		"base1-4": [[100, 72034]],
		"base1-2": [[100, 1090]],
	});
	expect(out.get("sv1")).toEqual({ "sv1-5": [[100, 500]] });
});

test("buildSetHistories appends onto a prior rollup, idempotent on same day", () => {
	const prior = new Map<string, SetHistory>([
		[
			"base1",
			{
				"base1-4": [
					[98, 70000],
					[99, 71000],
				],
			},
		],
	]);
	const out = buildSetHistories({
		blob,
		cardToSet,
		priorBySet: prior,
		todayDay: 100,
	});
	expect(out.get("base1")?.["base1-4"]).toEqual([
		[98, 70000],
		[99, 71000],
		[100, 72034],
	]);
	// re-run same day → replaces, no duplicate
	const again = buildSetHistories({
		blob,
		cardToSet,
		priorBySet: out,
		todayDay: 100,
	});
	expect(again.get("base1")?.["base1-4"]).toEqual([
		[98, 70000],
		[99, 71000],
		[100, 72034],
	]);
});

test("buildSetHistories skips cards with no setId or no market", () => {
	const b2: PricesBlob = {
		...blob,
		cards: { "ghost-1": {}, "base1-4": { tp: { H: [72034, 1] } } },
	};
	const out = buildSetHistories({
		blob: b2,
		cardToSet,
		priorBySet: new Map(),
		todayDay: 100,
	});
	// ghost-1 not in cardToSet → skipped; base1-4 present
	expect(out.get("base1")).toEqual({ "base1-4": [[100, 72034]] });
	expect([...out.keys()]).toEqual(["base1"]);
});
