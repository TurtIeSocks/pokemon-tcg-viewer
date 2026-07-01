import type { I18nOverlay } from "./corpus-engine";
import { useI18nRuntime } from "./i18n-runtime";

/**
 * Imperative active-overlay accessors. Deliberately depend ONLY on the i18n
 * runtime (no userland import) so the corpus fetcher can read them without
 * dragging the userland store into the corpus module graph (which dynamically
 * imports corpus-runtime — a static cycle here would risk a chunk-split TDZ).
 * The React hooks that read the profile live in i18n-active-hooks.ts.
 */

/**
 * Active display-language overlay, read imperatively (no React subscription).
 * Used by the corpus fetcher + query-cache keying. Returns null for English
 * (the steady state) so hydrateCard takes its EN path with zero overhead.
 */
export function getActiveI18n(): I18nOverlay | null {
	const { lang, namesById } = useI18nRuntime.getState();
	if (lang === "en") return null;
	return { lang, namesById };
}
