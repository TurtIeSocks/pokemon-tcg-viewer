/**
 * Currency registry — the single source of truth for the display-currency
 * switcher and the per-stack currency picker, mirroring `languages.ts`.
 * Owns ISO-4217 metadata: which currencies the UI offers, their labels,
 * symbols, and minor-unit exponents (the scaling factor between stored integer
 * minor units and displayed major units — 2 for USD/EUR, 0 for JPY/KRW).
 */

export const SUPPORTED_CURRENCIES = [
	"USD",
	"EUR",
	"GBP",
	"JPY",
	"CAD",
	"AUD",
	"CHF",
	"CNY",
	"KRW",
	"HKD",
	"SGD",
	"MXN",
	"BRL",
	"INR",
	"SEK",
	"NZD",
	"PLN",
] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

/** Human-readable label for each supported currency (code + name). */
export const CURRENCY_LABELS: Record<SupportedCurrency, string> = {
	USD: "USD — US Dollar",
	EUR: "EUR — Euro",
	GBP: "GBP — British Pound",
	JPY: "JPY — Japanese Yen",
	CAD: "CAD — Canadian Dollar",
	AUD: "AUD — Australian Dollar",
	CHF: "CHF — Swiss Franc",
	CNY: "CNY — Chinese Yuan",
	KRW: "KRW — South Korean Won",
	HKD: "HKD — Hong Kong Dollar",
	SGD: "SGD — Singapore Dollar",
	MXN: "MXN — Mexican Peso",
	BRL: "BRL — Brazilian Real",
	INR: "INR — Indian Rupee",
	SEK: "SEK — Swedish Krona",
	NZD: "NZD — New Zealand Dollar",
	PLN: "PLN — Polish Złoty",
};

const SYMBOLS: Record<string, string> = {
	USD: "$",
	EUR: "€",
	GBP: "£",
	JPY: "¥",
	CAD: "$",
	AUD: "$",
	CHF: "CHF ",
	CNY: "¥",
	KRW: "₩",
	HKD: "$",
	SGD: "$",
	MXN: "$",
	BRL: "R$",
	INR: "₹",
	SEK: "kr ",
	NZD: "$",
	PLN: "zł ",
};

// ISO-4217 zero-decimal currencies (a superset of the supported list, so a
// future addition is already correct). Everything else is exponent 2.
const ZERO_DECIMAL: ReadonlySet<string> = new Set([
	"JPY",
	"KRW",
	"ISK",
	"CLP",
	"VND",
	"XOF",
	"XAF",
	"PYG",
	"UGX",
	"RWF",
]);

/** Minor-unit exponent (stored-integer → major-unit scale). Default 2. */
export function exponentFor(currency: string): number {
	return ZERO_DECIMAL.has(currency) ? 0 : 2;
}

/** Display symbol for a currency, or undefined to fall back to the bare code. */
export function symbolFor(currency: string): string | undefined {
	return SYMBOLS[currency];
}

export function isSupportedCurrency(c: string): c is SupportedCurrency {
	return (SUPPORTED_CURRENCIES as readonly string[]).includes(c);
}

/** Normalize an arbitrary code to a supported one; unknown → USD. */
export function toSupportedCurrency(
	c: string | null | undefined,
): SupportedCurrency {
	return c && isSupportedCurrency(c) ? c : "USD";
}

// Region → currency for the browser-locale default. Only regions whose currency
// is in SUPPORTED_CURRENCIES; anything else falls through to USD.
const REGION_CURRENCY: Record<string, SupportedCurrency> = {
	US: "USD",
	GB: "GBP",
	JP: "JPY",
	CA: "CAD",
	AU: "AUD",
	CH: "CHF",
	CN: "CNY",
	KR: "KRW",
	HK: "HKD",
	SG: "SGD",
	MX: "MXN",
	BR: "BRL",
	IN: "INR",
	SE: "SEK",
	NZ: "NZD",
	PL: "PLN",
	DE: "EUR",
	FR: "EUR",
	ES: "EUR",
	IT: "EUR",
	PT: "EUR",
	NL: "EUR",
	IE: "EUR",
	AT: "EUR",
	BE: "EUR",
	FI: "EUR",
};

/**
 * Best-effort default display currency from a BCP-47 locale ("en-GB" → GBP).
 * Falls back to USD when the locale has no region or an unmapped one. SSR-safe:
 * pass `locale`; otherwise reads `navigator.language` when available.
 */
export function defaultCurrencyForLocale(locale?: string): SupportedCurrency {
	const tag =
		locale ??
		(typeof navigator !== "undefined" ? navigator.language : undefined) ??
		"en-US";
	const region = tag.split("-")[1]?.toUpperCase();
	return (region && REGION_CURRENCY[region]) || "USD";
}
