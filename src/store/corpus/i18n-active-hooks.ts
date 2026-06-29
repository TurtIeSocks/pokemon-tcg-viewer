import { useEffect } from "react";
import { toSupportedLanguage } from "../../lib/languages";
import { useUserland } from "../userland/userland-store";
import type { I18nOverlay } from "./corpus-engine";
import { loadI18n, useI18nRuntime } from "./i18n-runtime";

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
export function useDisplayLanguage(): string {
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
 * Keep the active overlay in sync with the profile's displayLanguage: lazily
 * load (and download once) the overlay when the language changes. en-only users
 * trigger zero network — loadI18n("en") just clears the overlay synchronously.
 * Mount this once high in the tree (the app shell).
 */
export function useEnsureI18n(): void {
	const lang = useDisplayLanguage();
	useEffect(() => {
		void loadI18n(lang);
	}, [lang]);
}
