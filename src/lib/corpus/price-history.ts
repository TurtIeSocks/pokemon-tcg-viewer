// Price-history types + pure helpers. Shared by scripts/build-history.ts (the
// daily rollup builder) and the client history runtime/chart. A history point
// is [UTC epoch-day, representative USD-cents market], null value = a gap.
import { convertMinorUnits } from "./fx";
import type { CardPriceEntry, FxTable } from "./price-types";
import { MARKET_FINISH_ORDER } from "./price-types";

export type HistoryPoint = [epochDay: number, marketCentsUsd: number | null];
/** cardId → points, ascending by day. */
export type SetHistory = Record<string, HistoryPoint[]>;

const MS_PER_DAY = 86_400_000;
/** Daily points are kept within this many days of "today"; older collapse to weekly. */
const DAILY_WINDOW = 90;

/** UTC days since epoch for a YYYY-MM-DD date. */
export function epochDayUtc(dateYmd: string): number {
	const [y, m, d] = dateYmd.split("-").map(Number);
	return Math.floor(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

/**
 * One representative USD-cents market for a card on a given day: tcgplayer
 * market via the shared MARKET_FINISH_ORDER (Normal-first, Reverse Holofoil as
 * the last resort), else cardmarket trend (EUR) converted to USD. null when
 * unpriced or FX can't reach USD.
 * MUST use the same finish order as valuation.ts — sharing MARKET_FINISH_ORDER
 * is what keeps the sparkline and the portfolio value from disagreeing (they
 * were Holo-first vs Normal-first and read ~10x apart).
 */
export function representativeMarketUsdCents(
	entry: CardPriceEntry | null,
	fx: FxTable | null,
): number | null {
	if (!entry) return null;
	if (entry.tp) {
		for (const f of MARKET_FINISH_ORDER) {
			const pair = entry.tp[f];
			if (pair && pair[0] !== null) return pair[0];
		}
	}
	if (entry.cm && entry.cm[0] !== null && fx) {
		return convertMinorUnits(entry.cm[0], "EUR", "USD", fx);
	}
	return null;
}

/**
 * Append today's point, or replace the last point when it is the same day
 * (so re-running the builder on the same UTC day is idempotent, never doubles).
 */
export function appendDailyPoint(
	points: HistoryPoint[],
	day: number,
	value: number | null,
): HistoryPoint[] {
	const last = points[points.length - 1];
	if (last && last[0] === day) {
		return [...points.slice(0, -1), [day, value]];
	}
	return [...points, [day, value]];
}

/**
 * Keep one point per day within DAILY_WINDOW of `todayDay`; collapse older
 * points to one per 7-day bucket (the last point in each bucket wins). Input
 * and output are ascending by day.
 */
export function downsample(
	points: HistoryPoint[],
	todayDay: number,
): HistoryPoint[] {
	const cutoff = todayDay - DAILY_WINDOW;
	const recent: HistoryPoint[] = [];
	const weekly = new Map<number, HistoryPoint>();
	for (const p of points) {
		if (p[0] > cutoff) recent.push(p);
		else weekly.set(Math.floor(p[0] / 7), p); // last write per bucket wins
	}
	const older = [...weekly.values()].sort((a, b) => a[0] - b[0]);
	return [...older, ...recent];
}
