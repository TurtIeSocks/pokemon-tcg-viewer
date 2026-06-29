/**
 * Catalog-supported display languages — the single source of truth for both the
 * display-language switcher and the per-stack `language` selector. The catalog
 * can render names + images in exactly these languages (Phase 1b: the Western
 * Latin set). Picking one of these is guaranteed never to silently fall back to
 * English at the catalog level.
 *
 * Japanese / Korean / Chinese rejoin in Phase 2 (a separate region catalog).
 * Until then they are intentionally absent so the selector can no longer no-op.
 */
export const SUPPORTED_LANGUAGES = [
	"en",
	"fr",
	"de",
	"es",
	"it",
	"pt",
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
};

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
