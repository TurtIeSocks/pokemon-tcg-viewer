import { ChevronDown, Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ListSearch } from "@/lib/card-query";
import { LANGUAGE_LABELS, SUPPORTED_LANGUAGES } from "@/lib/languages";
import { useDisplayLanguage } from "@/store/corpus/i18n-active-hooks";

const TRIGGER_CLASS =
	"border-[var(--border)] bg-[var(--glass)] text-[var(--ink-muted)] hover:bg-white/[0.07] hover:text-[var(--ink)]";

/**
 * Per-page catalog display-language picker for the ResultsBar, in the same
 * ButtonGroup/dropdown style as the sort control. The choice is URL-tracked
 * (`lang` search param) and local to the page. The effective language shown is
 * the URL override if set, else the viewer's default (`Profile.displayLanguage`,
 * else "en"); picking the default again clears the param so URLs stay clean.
 */
export function CardLanguageControl({
	value,
	onChange,
}: {
	value: ListSearch;
	onChange: (patch: Partial<ListSearch>) => void;
}) {
	const defaultLang = useDisplayLanguage();
	const effective = value.lang ?? defaultLang;
	return (
		<ButtonGroup>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						type="button"
						variant="outline"
						size="sm"
						aria-label="Catalog language"
						title={`Catalog language: ${LANGUAGE_LABELS[effective]}`}
						className={TRIGGER_CLASS}
					>
						<Languages className="size-4 opacity-70" />
						<span>{LANGUAGE_LABELS[effective]}</span>
						<ChevronDown className="size-4 opacity-70" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuRadioGroup
						value={effective}
						onValueChange={(v) =>
							onChange({
								lang: v === defaultLang ? null : (v as ListSearch["lang"]),
							})
						}
					>
						{SUPPORTED_LANGUAGES.map((lang) => (
							<DropdownMenuRadioItem key={lang} value={lang}>
								{LANGUAGE_LABELS[lang]}
							</DropdownMenuRadioItem>
						))}
					</DropdownMenuRadioGroup>
				</DropdownMenuContent>
			</DropdownMenu>
		</ButtonGroup>
	);
}
