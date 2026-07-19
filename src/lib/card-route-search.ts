import { stripSearchParams } from "@tanstack/react-router";
import { isSupportedLanguage, type SupportedLanguage } from "./languages";

/**
 * The search schema shared by the card detail / manage / prices routes: a
 * single optional catalog-language override (`?lang=de`) that rides in from the
 * grid so a cold load / reload / shared link still localizes.
 */
export interface CardLangSearch {
	lang: SupportedLanguage | null;
}

/**
 * validateSearch for the three card routes: coerce `lang` to a supported
 * catalog language, or null (= viewer default). Shared verbatim so the routes
 * can't drift.
 */
export function validateCardLangSearch(
	search: Record<string, unknown>,
): CardLangSearch {
	return {
		lang:
			typeof search.lang === "string" && isSupportedLanguage(search.lang)
				? search.lang
				: null,
	};
}

/**
 * Strip the null-default `lang` from the URL. Without it, TanStack serializes
 * the validated `{ lang: null }` back into the canonical URL as the literal
 * `?lang=null` on every cold load / shared link of a card page (the list routes
 * avoid this via stripSearchParams(LIST_SEARCH_DEFAULTS), which also carries
 * `lang: null`). A concrete language is left in the URL untouched.
 */
export const cardLangSearchMiddlewares = [
	stripSearchParams<CardLangSearch>({ lang: null }),
];
