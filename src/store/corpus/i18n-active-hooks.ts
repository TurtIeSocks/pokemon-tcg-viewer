import { useSearch } from "@tanstack/react-router";
import { useEffect } from "react";
import {
	isSupportedLanguage,
	regionForLanguage,
	type SupportedLanguage,
	toSupportedLanguage,
} from "../../lib/languages";
import { useUserland } from "../userland/userland-store";
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
 */
export function useActiveI18n(): I18nOverlay | null {
	const lang = useI18nRuntime((s) => s.lang);
	const namesById = useI18nRuntime((s) => s.namesById);
	if (lang === "en") return null;
	return { lang, namesById };
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
 * corpus + point `activeRegion` at it). West always loads via useEnsureCorpus;
 * this switches the active region to match the language.
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
	useEffect(() => {
		void loadI18n(lang);
		// Activate the base corpus region the language belongs to. loadCorpus is
		// idempotent per region (no-ops if already loaded); switching to a Western
		// language sets the region back to "west". Guard setActiveRegion against a
		// redundant write (getState, not a subscription) so this effect can't churn
		// the store into a re-render loop when the region is unchanged.
		const region = regionForLanguage(lang);
		void loadCorpus(region);
		if (useCorpusRuntime.getState().activeRegion !== region) {
			useCorpusRuntime.getState().setActiveRegion(region);
		}
	}, [lang]);
}
