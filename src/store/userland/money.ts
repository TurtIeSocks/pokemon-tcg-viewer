// src/store/userland/money.ts

/**
 * Money helpers for the single dollars↔cents boundary. Stacks store `pricePaid`
 * in integer MINOR UNITS (cents); humans type and read MAJOR UNITS (dollars).
 * Every form field, CSV cell, and price label converts through here so the
 * scaling factor lives in exactly one place.
 *
 * Minor-unit exponent is assumed 2 (USD/EUR-class). True multi-currency entry
 * (e.g. JPY, exponent 0) is deferred with the currency picker; until then every
 * stored value is USD cents and `currency` is a reserved slot.
 */

const SYMBOLS: Record<string, string> = {
	USD: "$",
	EUR: "€",
	GBP: "£",
	JPY: "¥",
	CAD: "$",
	AUD: "$",
};

/**
 * Parse a user-entered major-unit amount ("3.50") into integer minor units
 * (350). Empty/blank → null (unknown, ≠ 0). Non-numeric → null. Rounds to guard
 * against binary-float drift (19.99 → 1999, never 1998).
 */
export function inputToMinorUnits(value: string): number | null {
	const trimmed = value.trim();
	if (trimmed === "") return null;
	const n = Number(trimmed);
	if (!Number.isFinite(n)) return null;
	return Math.round(n * 100);
}

/**
 * Render integer minor units (350) as a bare major-unit string ("3.5") for a
 * controlled form field or CSV cell. null → "". No currency symbol, no forced
 * trailing zeros (matches the pre-cents form behaviour).
 */
export function minorUnitsToInput(minor: number | null): string {
	if (minor == null) return "";
	return String(minor / 100);
}

/**
 * Format minor units + ISO-4217 code for display: 350,"USD" → "$3.50". Unknown
 * codes fall back to "3.50 XYZ". null → "". Deterministic (no Intl/locale
 * dependence) so snapshot tests don't vary by host locale.
 */
export function formatPrice(minor: number | null, currency: string): string {
	if (minor == null) return "";
	const amount = (minor / 100).toFixed(2);
	const symbol = SYMBOLS[currency];
	return symbol ? `${symbol}${amount}` : `${amount} ${currency}`;
}
