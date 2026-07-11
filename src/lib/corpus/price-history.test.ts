import { expect, test } from "bun:test";
import {
	appendDailyPoint,
	downsample,
	epochDayUtc,
	representativeMarketUsdCents,
} from "./price-history";
import type { FxTable } from "./price-types";

const fx: FxTable = { base: "EUR", date: "x", rates: { USD: 1.09 } };

test("epochDayUtc counts UTC days since epoch", () => {
	expect(epochDayUtc("1970-01-01")).toBe(0);
	expect(epochDayUtc("1970-01-02")).toBe(1);
	expect(epochDayUtc("2026-07-03")).toBe(
		Math.floor(Date.UTC(2026, 6, 3) / 86400000),
	);
});

test("representativeMarketUsdCents prefers tcgplayer Normal→Holo (matches valuation), else cardmarket→USD", () => {
	// Normal-first, shared with valuation.ts via MARKET_FINISH_ORDER: a card with
	// both a $7 Normal and a $720 Holo resolves to Normal, so the sparkline and
	// the portfolio value agree (they used to disagree ~100x, H-first vs N-first).
	expect(
		representativeMarketUsdCents({ tp: { H: [72034, 1], N: [700, 1] } }, fx),
	).toBe(700);
	// Holo-only vintage (no Normal entry) still falls through to Holo.
	expect(representativeMarketUsdCents({ tp: { H: [72034, 1] } }, fx)).toBe(
		72034,
	);
	expect(representativeMarketUsdCents({ tp: { N: [700, 1] } }, fx)).toBe(700);
	// cardmarket trend €10.00 → $10.90
	expect(
		representativeMarketUsdCents({ cm: [1000, null, null, null] }, fx),
	).toBe(1090);
	expect(representativeMarketUsdCents(null, fx)).toBeNull();
	expect(representativeMarketUsdCents({}, fx)).toBeNull();
});

test("appendDailyPoint appends a new day, replaces the same day (idempotent)", () => {
	const a = appendDailyPoint([], 100, 500);
	expect(a).toEqual([[100, 500]]);
	const b = appendDailyPoint(a, 101, 510);
	expect(b).toEqual([
		[100, 500],
		[101, 510],
	]);
	// same day again → replace, not duplicate
	const c = appendDailyPoint(b, 101, 520);
	expect(c).toEqual([
		[100, 500],
		[101, 520],
	]);
});

test("downsample keeps daily within 90d, weekly beyond", () => {
	const today = 1000;
	// points every day for 200 days ending today
	const points: [number, number | null][] = [];
	for (let d = today - 199; d <= today; d++) points.push([d, d]);
	const out = downsample(points, today);
	// all points within [today-90, today] preserved (91 daily points)
	const recent = out.filter(([d]) => d > today - 90);
	expect(recent.length).toBe(90);
	// older points collapsed to ≤ 1 per 7-day bucket → far fewer than the ~110 raw
	const older = out.filter(([d]) => d <= today - 90);
	expect(older.length).toBeLessThan(20);
	// output stays ascending
	expect(out.map(([d]) => d)).toEqual(
		[...out.map(([d]) => d)].sort((x, y) => x - y),
	);
});
