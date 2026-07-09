import languageCoverage from "./language-coverage.json";

/**
 * Catalog-supported display languages — the single source of truth for both the
 * display-language switcher and the per-stack `language` selector. The catalog
 * can render names + images in exactly these languages: the Phase 1b Western
 * Latin set plus the Phase 2 Asian region set. Picking one of these is
 * guaranteed never to silently fall back to English at the catalog level.
 */
export const SUPPORTED_LANGUAGES = [
	"en",
	"fr",
	"de",
	"es",
	"it",
	"pt",
	"ja",
	"ko",
	"zh-tw",
	"zh-cn",
	"th",
	"id",
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

/** Human-readable label for each supported language (endonym + ISO code). */
export const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
	en: "English",
	fr: "Français",
	de: "Deutsch",
	es: "Español",
	it: "Italiano",
	pt: "Português",
	ja: "日本語",
	ko: "한국어",
	"zh-tw": "繁體中文",
	"zh-cn": "简体中文",
	th: "ไทย",
	id: "Bahasa Indonesia",
};

/**
 * The two catalog regions. Western languages read the Phase 1b Latin catalog;
 * Asian languages read the Phase 2 region catalog. Each card's canonical data
 * comes from its region's base language (see `REGION_BASE_LANGUAGE`).
 */
export type Region = "west" | "asia";

/** Asian-region languages, grouped for UI (e.g. a region-grouped picker). */
export const ASIAN_LANGUAGES: readonly SupportedLanguage[] = [
	"ja",
	"ko",
	"zh-tw",
	"zh-cn",
	"th",
	"id",
] as const;

/** Which region each supported language belongs to. */
export const LANGUAGE_REGION: Record<SupportedLanguage, Region> = {
	en: "west",
	fr: "west",
	de: "west",
	es: "west",
	it: "west",
	pt: "west",
	ja: "asia",
	ko: "asia",
	"zh-tw": "asia",
	"zh-cn": "asia",
	th: "asia",
	id: "asia",
};

/** The canonical source language for each region's catalog data. */
export const REGION_BASE_LANGUAGE: Record<Region, SupportedLanguage> = {
	west: "en",
	asia: "ja",
};

/** Classify a language into its region; unknown languages default to `west`. */
export function regionForLanguage(lang: string): Region {
	return isSupportedLanguage(lang) ? LANGUAGE_REGION[lang] : "west";
}

/**
 * Approximate fraction of the catalog each overlay covers (overlay card count /
 * total corpus), for a partial-coverage hint in the language picker. en + ja are
 * the two region baselines (1); every other language covers only the subset
 * TCGdex localizes, with the rest falling back to the base name.
 *
 * GENERATED — do not hand-edit. `scripts/build-i18n.ts` (WRITE_COVERAGE=1) writes
 * language-coverage.json from a live crawl; the `refresh-catalog-data` workflow
 * regenerates it and opens a PR when TCGdex's coverage shifts.
 */
export const LANGUAGE_COVERAGE: Record<SupportedLanguage, number> =
	languageCoverage;

/**
 * Languages that translate Pokémon *names* (Charizard → Glurak/Dracaufeu).
 * Spanish/Italian/Portuguese print the English name on the real cards, so for
 * those only the card *art* and (future) detail text differ, not the name.
 * The Asian languages all translate names too (e.g. リザードン, 리자몽).
 */
export const NAME_TRANSLATING_LANGUAGES: ReadonlySet<SupportedLanguage> =
	new Set(["fr", "de", "ja", "ko", "zh-tw", "zh-cn", "th", "id"]);

export function isSupportedLanguage(lang: string): lang is SupportedLanguage {
	return (SUPPORTED_LANGUAGES as readonly string[]).includes(lang);
}

/**
 * Normalize an arbitrary recorded language to one the catalog can render.
 * Unsupported languages (e.g. an unrecognized ISO code) fall back to English,
 * which is what the catalog renders for them anyway.
 */
export function toSupportedLanguage(
	lang: string | null | undefined,
): SupportedLanguage {
	return lang && isSupportedLanguage(lang) ? lang : "en";
}

/**
 * UI-chrome-only languages: the app interface is fully translated into these,
 * but they are NOT card-catalog languages (TCGdex has no card data for them, and
 * there is no catalog region for them). Kept separate from SUPPORTED_LANGUAGES so
 * the card-language pickers stay on the catalog set while the interface-language
 * picker can offer a wider list.
 */
export const UI_ONLY_LANGUAGES = ["pl", "sl"] as const;

/** All site-UI (interface) languages: the catalog languages plus UI-only additions. */
export const UI_LANGUAGES = [
	...SUPPORTED_LANGUAGES,
	...UI_ONLY_LANGUAGES,
] as const;

export type UiLanguage = (typeof UI_LANGUAGES)[number];

/** Endonym label for each UI language (extends LANGUAGE_LABELS with the UI-only ones). */
export const UI_LANGUAGE_LABELS: Record<UiLanguage, string> = {
	...LANGUAGE_LABELS,
	pl: "Polski",
	sl: "Slovenščina",
};

export function isUiLanguage(lang: string): lang is UiLanguage {
	return (UI_LANGUAGES as readonly string[]).includes(lang);
}

/** Normalize an arbitrary recorded language to a supported UI language (fallback "en"). */
export function toUiLanguage(lang: string | null | undefined): UiLanguage {
	return lang && isUiLanguage(lang) ? lang : "en";
}

/**
 * Resolve which language "face" of a card to render: there is no English face
 * for a Japanese-lineage card and no Japanese face for a Western card, so the
 * face language is chosen by the card's region, not blindly by the active
 * display language. When the active language's region matches the card's
 * region, render in that active language (e.g. an asia card + active `ko` ->
 * `ko`). Otherwise fall back to the card's region base language (e.g. a west
 * card + active `ja` -> `en`; an asia card + active `en` -> `ja`).
 *
 * Lives here (not corpus-engine.ts) so non-corpus callers (card-route link
 * builders, Vault tiles) can compute a card's face language without importing
 * corpus types -- only `Region` is needed, and it already lives in this module.
 */
export function faceLanguageFor(
	card: { region?: Region },
	activeLang: SupportedLanguage,
): SupportedLanguage {
	const cardRegion = card.region ?? "west";
	return regionForLanguage(activeLang) === cardRegion
		? activeLang
		: REGION_BASE_LANGUAGE[cardRegion];
}
