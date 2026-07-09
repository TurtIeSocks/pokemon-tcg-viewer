import { ChevronDown, Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { GlassPanel } from "@/components/ui/glass";
import {
	toUiLanguage,
	UI_LANGUAGE_LABELS,
	UI_LANGUAGES,
} from "@/lib/languages";
import { setUiLanguage } from "@/lib/ui-locale";
import { m } from "@/paraglide/messages";
import { useUserland } from "@/store/userland/userland-store";

/**
 * SITE-UI language control (app chrome: nav labels, buttons, settings copy).
 * A different axis from the CATALOG display-language control above it on this
 * page (card names/details) -- deliberately labeled "Interface language" so the
 * two don't read as the same setting. Matches the catalog control's dropdown
 * style, but with a FLAT language list: UI language has no region/coverage axis
 * (all locales are fully translated), so no Western/Asian grouping.
 *
 * Reads `profile.uiLanguage` with a narrow primitive selector (S3 pattern) so
 * this panel only re-renders when the UI language itself changes. Switching
 * updates Paraglide's active locale live, no reload (`setUiLanguage`);
 * `<LocaleBoundary>` at the app root re-renders the tree so every `m.*()` call
 * picks up the new locale.
 */
export function UiLanguageSetting() {
	const uiLanguage = useUserland((s) => s.profile?.uiLanguage);
	const current = toUiLanguage(uiLanguage);

	return (
		<GlassPanel className="flex flex-col gap-3 p-5">
			<div className="flex flex-col gap-1">
				<h2 className="font-display text-lg">
					{m.settings_interface_language()}
				</h2>
				<p className="font-mono text-[12px] text-(--ink-muted)">
					{m.settings_interface_language_description()}
				</p>
			</div>
			<div className="flex flex-wrap gap-2">
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="outline"
							aria-label={m.settings_interface_language()}
						>
							<Languages className="size-4 opacity-70" />
							<span>{UI_LANGUAGE_LABELS[current]}</span>
							<ChevronDown className="size-4 opacity-70" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start">
						<DropdownMenuRadioGroup
							value={current}
							onValueChange={(v) => void setUiLanguage(toUiLanguage(v))}
						>
							{UI_LANGUAGES.map((lang) => (
								<DropdownMenuRadioItem key={lang} value={lang}>
									{UI_LANGUAGE_LABELS[lang]}
								</DropdownMenuRadioItem>
							))}
						</DropdownMenuRadioGroup>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</GlassPanel>
	);
}
