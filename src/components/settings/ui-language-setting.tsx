import { GlassPanel } from "@/components/ui/glass";
import {
	LANGUAGE_LABELS,
	SUPPORTED_LANGUAGES,
	toSupportedLanguage,
} from "@/lib/languages";
import { setUiLanguage } from "@/lib/ui-locale";
import { m } from "@/paraglide/messages";
import { useUserland } from "@/store/userland/userland-store";

/**
 * SITE-UI language control (app chrome: nav labels, buttons, settings copy).
 * This is a different axis from the CATALOG display-language control above it
 * on this page (card names/details) -- deliberately labeled "Interface
 * language" so the two don't read as the same setting.
 *
 * Reads `profile.uiLanguage` with a narrow primitive selector (S3 pattern) so
 * this panel only re-renders when the UI language itself changes, not on
 * unrelated profile/store updates. Switching updates Paraglide's active
 * locale live, no reload (`setUiLanguage`); `<LocaleBoundary>` at the app root
 * re-renders the tree so every `m.*()` call picks up the new locale.
 */
export function UiLanguageSetting() {
	const uiLanguage = useUserland((s) => s.profile?.uiLanguage);
	const current = toSupportedLanguage(uiLanguage);

	return (
		<GlassPanel className="flex flex-col gap-3 p-5">
			<div className="flex flex-col gap-1">
				<label htmlFor="ui-language-select" className="font-display text-lg">
					{m.settings_interface_language()}
				</label>
				<p className="font-mono text-[12px] text-(--ink-muted)">
					Menus, buttons, and settings text render in this language. Card names
					and details are controlled separately by Catalog language, above.
				</p>
			</div>
			<select
				id="ui-language-select"
				value={current}
				onChange={(e) =>
					void setUiLanguage(toSupportedLanguage(e.target.value))
				}
				className="rounded-(--r-control) border border-(--border) bg-(--glass) px-3 py-2 text-(--ink)"
			>
				{SUPPORTED_LANGUAGES.map((lang) => (
					<option key={lang} value={lang}>
						{LANGUAGE_LABELS[lang]}
					</option>
				))}
			</select>
		</GlassPanel>
	);
}
