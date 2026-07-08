import { useCorpusRuntime } from "../store/corpus/corpus-runtime-store";
import {
	isSupportedLanguage,
	REGION_BASE_LANGUAGE,
	type Region,
	regionForLanguage,
} from "./languages";

/**
 * Cookie the client persists the chosen display language to, so a cold SSR load
 * can pick the catalog region BEFORE the client IndexedDB store hydrates. The
 * chosen locale otherwise lives only in `profile.displayLanguage` (client IDB),
 * unreadable by the server — which is exactly why an SSR cold-load of an Asian
 * set page used to hard-default `west` and 404. Read server-side by
 * `getPreferredRegionFn` (src/server/nav-tree.ts); written client-side by
 * `writeLangCookie`. Client-safe (a plain string + a `document`-guarded write),
 * so the server fn can import the name from here without dragging server-only
 * code into the client bundle — mirroring the sidebar-cookie split.
 */
export const LANG_COOKIE = "ptcg-lang";
/** ~1 year, matching a durable display-language preference. */
const LANG_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Persist the display language to the locale cookie (client-only; a no-op on the
 * server, where there is no `document`). Called on every language change (and
 * once from the loaded profile for pre-cookie users) so a subsequent cold SSR
 * load resolves the right catalog region without the client store. Only supported
 * languages are written; anything else is ignored (the cookie keeps its last good
 * value rather than being cleared to an ambiguous state).
 */
export function writeLangCookie(lang: string | null | undefined): void {
	if (typeof document === "undefined") return;
	if (lang && isSupportedLanguage(lang)) {
		// Mirrors the sidebar-cookie write; the Cookie Store API isn't broadly available.
		// biome-ignore lint/suspicious/noDocumentCookie: necessary
		document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=${LANG_COOKIE_MAX_AGE}; SameSite=Lax`;
	}
}

/** Cookie carrying the chosen SITE-UI language for SSR first-paint (separate from ptcg-lang, which is card content). */
export const UI_LANG_COOKIE = "ui-lang";

/**
 * Persist the site-UI language to its cookie (client-only; no-op on the server).
 * Read server-side by Paraglide's cookie strategy so a cold SSR load renders chrome
 * in the right locale before the client store hydrates.
 */
export function writeUiLangCookie(lang: string | null | undefined): void {
	if (typeof document === "undefined") return;
	if (lang && isSupportedLanguage(lang)) {
		// biome-ignore lint/suspicious/noDocumentCookie: necessary
		document.cookie = `${UI_LANG_COOKIE}=${lang}; path=/; max-age=${LANG_COOKIE_MAX_AGE}; SameSite=Lax`;
	}
}

/**
 * The catalog region a route loader should resolve against.
 *
 * A shared/cold-loaded link carries the region in `?lang` (a shared JP link is
 * `?lang=ja`). But an in-app navigation from the sidebar / browse tiles / home
 * has NO `?lang` — the global language picker switches region via the profile,
 * not the URL. On a client navigation the loader runs in the browser, so we can
 * read the active client region and stay in the current catalog. On SSR
 * cold-load there is no client store, so default `west` (a JP deep link must
 * carry `?lang`, which the card/detail links already do).
 */
export function loaderRegion(lang?: string | null): Region {
	if (lang) return regionForLanguage(lang);
	if (typeof window === "undefined") return "west";
	return useCorpusRuntime.getState().activeRegion;
}

/**
 * The language to hand a corpus server fn so it resolves the right region + face.
 * Uses the explicit `?lang` when present, else the region's base language (so a
 * client-side region derived from `activeRegion` still reaches the server fn,
 * which infers region from the language).
 */
export function loaderLang(lang?: string | null): string {
	if (lang) return lang;
	return REGION_BASE_LANGUAGE[loaderRegion()];
}
