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

/**
 * Approximate fraction of the catalog each overlay covers (overlay card count /
 * total corpus), for a partial-coverage hint in the language picker. TCGdex's
 * Western data is uneven — es/pt lack most vintage cards, so those fall back to
 * English. en is the full baseline (1). Regenerate from the build-i18n coverage
 * logs (scripts/build-i18n.ts) when the corpus is rebuilt.
 */
export const LANGUAGE_COVERAGE: Record<SupportedLanguage, number> = {
	en: 1,
	fr: 0.92,
	de: 0.84,
	es: 0.65,
	it: 0.65,
	pt: 0.59,
};

/**
 * Languages that translate Pokémon *names* (Charizard → Glurak/Dracaufeu).
 * Spanish/Italian/Portuguese print the English name on the real cards, so for
 * those only the card *art* and (future) detail text differ, not the name.
 */
export const NAME_TRANSLATING_LANGUAGES: ReadonlySet<SupportedLanguage> =
	new Set(["fr", "de"]);

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
