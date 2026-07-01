import { useSearch } from "@tanstack/react-router";
import { useEffect } from "react";
import {
	isSupportedLanguage,
	type SupportedLanguage,
	toSupportedLanguage,
} from "../../lib/languages";
import { useUserland } from "../userland/userland-store";
import type { I18nOverlay } from "./corpus-engine";
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
 * Keep the active overlay in sync with the effective display language: the
 * current page's `lang` URL param if set, else the viewer's profile default
 * (else "en"). Lazily loads (and downloads once) the overlay when it changes.
 * en-only users trigger zero network — loadI18n("en") clears the overlay
 * synchronously. Called from every card-rendering context (grid, overlay,
 * binders, vault, palette); they share the single runtime, and reading the URL
 * here keeps them all consistent with the active page without prop-threading.
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
	}, [lang]);
}
