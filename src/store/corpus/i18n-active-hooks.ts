import { useSearch } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import {
	isSupportedLanguage,
	regionForLanguage,
	type SupportedLanguage,
	toSupportedLanguage,
} from "../../lib/languages";
import { writeLangCookie } from "../../lib/loader-region";
import { useStore } from "../index";
import { loadUserland, useUserland } from "../userland/userland-store";
import type { I18nOverlay } from "./corpus-engine";
import { loadCorpus } from "./corpus-runtime";
import { useCorpusRuntime } from "./corpus-runtime-store";
import { loadI18n, useI18nRuntime } from "./i18n-runtime";

/**
 * True when a non-English overlay is active but this card has no localized name,
 * so it renders the English fallback. Pure (no React) -- shared by the grid badge
 * and the modal notice. A null overlay is the English steady state -- never a fallback.
 */
export function isI18nFallback(
	overlay: I18nOverlay | null,
	cardId: string,
): boolean {
	return !!overlay && !overlay.namesById?.has(cardId);
}

/**
 * Reactive active overlay for React render paths. Subscribes to the narrowest
 * values (the lang primitive + the map reference) in the consuming hook, per
 * the S3 subscription pattern. Returns null for English.
 *
 * Memoized on `(lang, namesById)` so it returns a STABLE object reference across
 * renders when neither changed — a fresh `{lang, namesById}` every render would
 * defeat downstream `useMemo`s that take the overlay as a dependency (e.g. the
 * owned-card-tile route-params memo) for non-English viewers.
 */
export function useActiveI18n(): I18nOverlay | null {
	const lang = useI18nRuntime((s) => s.lang);
	const namesById = useI18nRuntime((s) => s.namesById);
	return useMemo(
		() => (lang === "en" ? null : { lang, namesById }),
		[lang, namesById],
	);
}

/** The user's chosen catalog render language (normalized to the supported set). */
export function useDisplayLanguage(): SupportedLanguage {
	const raw = useUserland((s) => s.profile?.displayLanguage);
	return toSupportedLanguage(raw);
}

/**
 * A render-cache key fragment for the active overlay: the language plus its
 * loaded content version. Changes both on a language switch AND when the overlay
 * finishes downloading, so a grid keyed on it re-derives once localized names
 * land (avoiding a stuck-on-EN flash after the switch but before the fetch).
 */
export function useActiveI18nKey(): string {
	const lang = useI18nRuntime((s) => s.lang);
	const version = useI18nRuntime((s) => s.version);
	return `${lang}:${version ?? ""}`;
}

/**
 * Keep the active overlay AND the active base-corpus region in sync with the
 * effective display language: the current page's `lang` URL param if set, else
 * the viewer's profile default (else "en"). Lazily loads (and downloads once)
 * the overlay when it changes; en-only users trigger zero overlay network —
 * loadI18n("en") clears the overlay synchronously.
 *
 * REGION ACTIVATION (asian-catalog): the display language also picks the base
 * corpus. Language is the region axis — Western languages read the `west`
 * catalog, Asian languages (ja/ko/zh-tw/zh-cn/th/id) read the `asia` catalog. Server
 * SSR loaders already seed the right region from `?lang`, but the CLIENT must
 * mirror it: without this, `activeRegion` is stuck on "west" forever, so on
 * hydration a grid re-queries the (west) index and blanks the correctly-seeded
 * asia SSR page. So here we ALSO derive the region and activate it (load its
 * corpus + sets + point `activeRegion` at it). West always loads via
 * useEnsureCorpus; this switches the active region to match the language.
 * Loading the region's SETS alongside its corpus (not just the index) is
 * required so `makeCorpusFetcher`/`getSlugIndex` (which read
 * `setsForRegion(activeRegion)`) can hydrate real set names/dates and resolve
 * slugs for an asia browse grid — without it, asia cards render with
 * `setName` = the raw set code and drop out of any year filter.
 *
 * Called from every card-rendering context (grid, overlay, cockpit, palette);
 * they share the single runtime, and reading the URL here keeps them all
 * consistent with the active page without prop-threading.
 */
export function useEnsureI18n(): void {
	// strict:false so this works on any route; a route without a `lang` param
	// (binders/vault) yields undefined → the profile default takes over.
	const urlLang = useSearch({
		strict: false,
		select: (s) => (s as { lang?: unknown }).lang,
	});
	const profileLang = useDisplayLanguage();
	const lang =
		typeof urlLang === "string" && isSupportedLanguage(urlLang)
			? urlLang
			: profileLang;
	// Narrow primitive subscription (S3): the RAW saved language, undefined until
	// the profile hydrates, so we can distinguish "not loaded yet" from a real
	// value and avoid clobbering the cookie with a premature "en".
	const savedLang = useUserland((s) => s.profile?.displayLanguage);
	// Hydrate the profile so the persisted displayLanguage drives this hook on
	// boot. On a non-vault catalog page nothing else triggers loadUserland, so
	// without this the profile stays null → useDisplayLanguage falls back to "en"
	// and the saved language is lost on every refresh. loadUserland is idempotent
	// (hydrated-guard + in-flight dedupe), so calling it from every card-rendering
	// mount is safe.
	useEffect(() => {
		void loadUserland();
	}, []);
	// Mirror the persisted display language into the locale cookie once the profile
	// loads, so existing users (who chose their language before the cookie existed)
	// get one, and a cold SSR load can pick the catalog region before this client
	// store hydrates. Synced from the PROFILE language, not the URL `?lang` (which
	// is a shareable per-link override, not the saved preference).
	useEffect(() => {
		if (savedLang) writeLangCookie(savedLang);
	}, [savedLang]);
	useEffect(() => {
		void loadI18n(lang);
		// Activate the base corpus region the language belongs to. loadCorpus and
		// loadSetsForRegion are both idempotent per region (no-op if already
		// loaded/loading); switching to a Western language sets the region back to
		// "west". Guard setActiveRegion against a redundant write (getState, not a
		// subscription) so this effect can't churn the store into a re-render loop
		// when the region is unchanged.
		const region = regionForLanguage(lang);
		void loadCorpus(region);
		void useStore.getState().loadSetsForRegion(region);
		if (useCorpusRuntime.getState().activeRegion !== region) {
			useCorpusRuntime.getState().setActiveRegion(region);
		}
	}, [lang]);
}
