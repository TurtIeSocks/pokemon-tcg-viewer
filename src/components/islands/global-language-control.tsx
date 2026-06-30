import { ChevronsUpDown, Languages } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar";
import { LANGUAGE_LABELS } from "@/lib/languages";
import { useDisplayLanguage } from "@/store/corpus/i18n-active-hooks";
import { updateProfile } from "@/store/userland/userland-store";
import { LanguageRadioMenu } from "./card-language-control";

/**
 * Global catalog display-language control, mounted once in the sidebar footer.
 * Unlike the per-page {@link import("./card-language-control").CardLanguageControl}
 * (URL-tracked, ResultsBar-local), this reads and writes the viewer's persistent
 * `profile.displayLanguage` directly -- it IS the default every page and the card
 * modal fall back to (see `useEnsureI18n`). Picking a language here re-localizes
 * every grid that isn't pinned to its own `?lang` override.
 *
 * Reuses the same dropdown body as the per-page control ({@link LanguageRadioMenu})
 * but swaps the trigger for a `SidebarMenuButton` so it collapses to an icon-only
 * glyph (no label/percent) when the sidebar is in icon rail mode, matching how
 * every other sidebar row hides its text via `group-data-[collapsible=icon]`.
 */
export function GlobalLanguageControl() {
	const lang = useDisplayLanguage();

	return (
		<SidebarMenu>
			<SidebarMenuItem>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<SidebarMenuButton
							tooltip={`Catalog language: ${LANGUAGE_LABELS[lang]}`}
							aria-label="Catalog language"
							className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
						>
							<Languages className="text-(--ink-muted)" />
							<span className="truncate">{LANGUAGE_LABELS[lang]}</span>
							<ChevronsUpDown className="ml-auto size-4 text-(--ink-muted)" />
						</SidebarMenuButton>
					</DropdownMenuTrigger>
					<LanguageRadioMenu
						value={lang}
						align="start"
						onValueChange={(next) => {
							void updateProfile({ displayLanguage: next });
						}}
					/>
				</DropdownMenu>
			</SidebarMenuItem>
		</SidebarMenu>
	);
}
