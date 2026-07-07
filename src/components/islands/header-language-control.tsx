import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LANGUAGE_LABELS } from "@/lib/languages";
import { useDisplayLanguage } from "@/store/corpus/i18n-active-hooks";
import { updateProfile } from "@/store/userland/userland-store";
import { LanguageRadioMenu } from "./card-language-control";

/**
 * Compact catalog-language control for the mobile app header. The sidebar's
 * {@link import("./global-language-control").GlobalLanguageControl} is off-canvas
 * on phones, so this surfaces the same picker — the shared {@link LanguageRadioMenu}
 * body plus the persistent `profile.displayLanguage` wiring — as a header icon
 * button. Mounted `md:hidden`; the sidebar footer control takes over at `md:`+.
 */
export function HeaderLanguageControl() {
	const lang = useDisplayLanguage();
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					aria-label={`Catalog language: ${LANGUAGE_LABELS[lang]}`}
					title={`Catalog language: ${LANGUAGE_LABELS[lang]}`}
				>
					<Languages />
				</Button>
			</DropdownMenuTrigger>
			<LanguageRadioMenu
				value={lang}
				align="end"
				onValueChange={(next) => {
					void updateProfile({ displayLanguage: next });
				}}
			/>
		</DropdownMenu>
	);
}
