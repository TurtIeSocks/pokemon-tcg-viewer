import { exponentFor } from "@/lib/currencies";
import type { FxTable } from "./price-types";

/** X per 1 EUR from an EUR-based table; the base (EUR) is 1. null when unknown. */
function rateToEur(currency: string, fx: FxTable): number | null {
	if (currency === fx.base) return 1;
	const r = fx.rates[currency];
	return typeof r === "number" && r > 0 ? r : null;
}

/**
 * Convert an integer minor-unit amount from one currency to another using an
 * EUR-based reference table (the shape the price blob carries). Exponent-aware,
 * so USD cents → JPY yen drops the two decimals correctly. Returns null when
 * either currency's rate is unknown — the caller decides how to degrade (we
 * never guess a rate).
 */
export function convertMinorUnits(
	minor: number | null,
	from: string,
	to: string,
	fx: FxTable,
): number | null {
	if (minor == null) return null;
	if (from === to) return minor;
	const rFrom = rateToEur(from, fx);
	const rTo = rateToEur(to, fx);
	if (rFrom == null || rTo == null) return null;
	const major = minor / 10 ** exponentFor(from);
	const eur = major / rFrom;
	return Math.round(eur * rTo * 10 ** exponentFor(to));
}
