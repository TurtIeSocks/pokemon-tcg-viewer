// src/store/userland/money.ts

import { exponentFor, symbolFor } from "@/lib/currencies";

/**
 * Money helpers for the minor-units↔major-units boundary. Stacks store
 * `pricePaid` in integer MINOR UNITS; humans type and read MAJOR UNITS. Every
 * form field, CSV cell, and price label converts through here so the scaling
 * factor — the currency's ISO-4217 minor-unit exponent — lives in one place.
 *
 * The exponent comes from `src/lib/currencies.ts` (USD/EUR = 2, JPY/KRW = 0),
 * so ¥350 round-trips as the integer 350, not 35000. The currency param
 * defaults to "USD" (exponent 2) for back-compat with USD-only call sites.
 */

/**
 * Parse a user-entered major-unit amount into integer minor units for `currency`.
 * "3.50" USD → 350; "350" JPY → 350. Empty/blank → null (unknown, ≠ 0).
 * Non-numeric → null. Rounds to guard binary-float drift (19.99 USD → 1999).
 */
export function inputToMinorUnits(
	value: string,
	currency = "USD",
): number | null {
	const trimmed = value.trim();
	if (trimmed === "") return null;
	const n = Number(trimmed);
	if (!Number.isFinite(n)) return null;
	return Math.round(n * 10 ** exponentFor(currency));
}

/**
 * Render integer minor units as a bare major-unit string for a controlled form
 * field or CSV cell, scaled by `currency`'s exponent. 350 USD → "3.5"; 350 JPY
 * → "350". null → "". No symbol, no forced trailing zeros.
 */
export function minorUnitsToInput(
	minor: number | null,
	currency = "USD",
): string {
	if (minor == null) return "";
	return String(minor / 10 ** exponentFor(currency));
}

/**
 * Format minor units + ISO-4217 code for display: 350,"USD" → "$3.50";
 * 350,"JPY" → "¥350". Unknown symbol → "10.00 XYZ". null → "". Deterministic
 * (no Intl/locale dependence) so snapshot tests don't vary by host locale.
 */
export function formatPrice(minor: number | null, currency: string): string {
	if (minor == null) return "";
	const exp = exponentFor(currency);
	const amount = (minor / 10 ** exp).toFixed(exp);
	const symbol = symbolFor(currency);
	return symbol ? `${symbol}${amount}` : `${amount} ${currency}`;
}
