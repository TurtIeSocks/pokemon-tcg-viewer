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
 * total corpus), for a partial-coverage hint in the language picker. TCGdex's
 * Western data is uneven — es/pt lack most vintage cards, so those fall back to
 * English. en is the full baseline (1).
 *
 * GENERATED: these values are computed mechanically by `scripts/build-i18n.ts`.
 * After each corpus rebuild, paste the `LANGUAGE_COVERAGE = {...}` line it logs
 * at the end of the run to refresh the numbers here.
 *
 * The six Asian overlays (ja/ko/zh-tw/zh-cn/th/id) are placeholders pending
 * the Phase 2 region-catalog crawl; `build-i18n` will regenerate real
 * coverage for them once that data lands. // asian-catalog: wired in Task A2+
 */
export const LANGUAGE_COVERAGE: Record<SupportedLanguage, number> = {
	en: 1,
	fr: 0.92,
	de: 0.84,
	es: 0.65,
	it: 0.65,
	pt: 0.59,
	ja: 1,
	ko: 0,
	"zh-tw": 0,
	"zh-cn": 0,
	th: 0,
	id: 0,
};

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
 * Unsupported languages (e.g. a legacy `ja` stack) fall back to English, which
 * is what the catalog renders for them anyway.
 */
export function toSupportedLanguage(
	lang: string | null | undefined,
): SupportedLanguage {
	return lang && isSupportedLanguage(lang) ? lang : "en";
}
