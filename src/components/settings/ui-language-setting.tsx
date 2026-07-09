import { ChevronDown, Globe } from "lucide-react";
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
import { getLocale } from "@/paraglide/runtime";
import { useUserland } from "@/store/userland/userland-store";

/**
 * SITE-UI language control (app chrome: nav labels, buttons, settings copy).
 * A different axis from the CATALOG display-language control above it on this
 * page (card names/details) -- deliberately labeled "Interface language" so the
 * two don't read as the same setting. Matches the catalog control's dropdown
 * style, but with a FLAT language list: UI language has no region/coverage axis
 * (all locales are fully translated), so no Western/Asian grouping.
 *
 * Displays the ACTUAL active locale via `getLocale()` (not just the stored
 * `profile.uiLanguage`) so the trigger can never disagree with the chrome the
 * page is rendering -- e.g. a first-time visitor whose locale came from the
 * `ui-lang` cookie or an Accept-Language match, before any preference is saved.
 * Still subscribes to `profile.uiLanguage` with a narrow primitive selector (S3)
 * so the control re-renders the instant the user switches; `setUiLanguage`
 * updates Paraglide's active locale live (no reload) and `<LocaleBoundary>`
 * re-renders the tree so every `m.*()` call picks up the new locale.
 */
export function UiLanguageSetting() {
	// Subscribe for re-render on preference change; value comes from getLocale().
	useUserland((s) => s.profile?.uiLanguage);
	const current = toUiLanguage(getLocale());

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
							<Globe className="size-4 opacity-70" />
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
