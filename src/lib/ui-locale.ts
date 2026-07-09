import { createElement, Fragment, type ReactNode } from "react";
import { getLocale, setLocale } from "../paraglide/runtime";
import { updateProfile, useUserland } from "../store/userland/userland-store";
import { bcp47 } from "./bcp47";
import type { UiLanguage } from "./languages";

/**
 * Switch the site-UI language. Updates Paraglide's active locale FIRST (no full
 * reload, `{ reload: false }`), THEN persists to the profile (which mirrors the
 * ui-lang cookie via `updateProfile`).
 *
 * Order matters: `updateProfile` writes the store synchronously, which triggers
 * `<LocaleBoundary>`'s re-render on the same tick. That re-render reads
 * `getLocale()` for its key, so the locale MUST already be updated by then --
 * otherwise the boundary keys on the previous locale and the UI lags exactly one
 * selection behind (select FR -> still EN, select JA -> shows FR, ...).
 */
export async function setUiLanguage(lang: UiLanguage): Promise<void> {
	setLocale(lang, { reload: false });
	if (typeof document !== "undefined") {
		document.documentElement.lang = bcp47(lang);
	}
	await updateProfile({ uiLanguage: lang });
}

/**
 * Re-localizes the whole app UI in place when the language changes, without a
 * full page reload. Subscribes to `profile.uiLanguage` (narrow S3 selector) so a
 * switch re-renders this boundary, then KEYS the subtree on the active locale so
 * it remounts. The remount is what forces every `m.*()` call to re-evaluate:
 * plain React re-rendering bails out on the unchanged `children` element (and
 * React Compiler's auto-memoization bails on any subtree whose props are
 * unchanged), so without the key the text stays stale until a reload. Remount is
 * lighter than Paraglide's default full-page reload and preserves the
 * module-level Zustand stores + TanStack Router state, which live above this
 * boundary.
 */
export function LocaleBoundary({
	children,
}: {
	children: ReactNode;
}): ReactNode {
	useUserland((s) => s.profile?.uiLanguage);
	return createElement(Fragment, { key: getLocale() }, children);
}
