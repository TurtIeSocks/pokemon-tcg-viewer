import type { ReactNode } from "react";
import { setLocale } from "../paraglide/runtime";
import { updateProfile, useUserland } from "../store/userland/userland-store";
import { bcp47 } from "./bcp47";
import type { SupportedLanguage } from "./languages";

/**
 * Switch the site-UI language. Persists to profile (which mirrors the ui-lang
 * cookie via `updateProfile`), then updates Paraglide's active locale WITHOUT a
 * full reload (`{ reload: false }` — confirmed supported by the installed
 * runtime's `setLocale(newLocale, options?: { reload?: boolean })`).
 * `<LocaleBoundary>` re-renders the tree once the profile change lands.
 */
export async function setUiLanguage(lang: SupportedLanguage): Promise<void> {
	await updateProfile({ uiLanguage: lang });
	setLocale(lang, { reload: false });
	if (typeof document !== "undefined") {
		document.documentElement.lang = bcp47(lang);
	}
}

/**
 * Re-renders its subtree whenever `profile.uiLanguage` changes so every m.*()
 * call re-evaluates in the new locale. Subscribes to the narrowest primitive
 * selector (S3 pattern) so this boundary only re-renders on an actual
 * uiLanguage change, not on unrelated profile/store updates.
 */
export function LocaleBoundary({
	children,
}: {
	children: ReactNode;
}): ReactNode {
	useUserland((s) => s.profile?.uiLanguage);
	return children;
}
