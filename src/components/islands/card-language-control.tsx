import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { CardGlyph } from "@/components/ui/card-glyph";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ListSearch } from "@/lib/card-query";
import {
	ASIAN_LANGUAGES,
	LANGUAGE_COVERAGE,
	LANGUAGE_LABELS,
	SUPPORTED_LANGUAGES,
	type SupportedLanguage,
} from "@/lib/languages";
import { m } from "@/paraglide/messages";
import { useDisplayLanguage } from "@/store/corpus/i18n-active-hooks";

const TRIGGER_CLASS =
	"border-(--border) bg-(--glass) text-(--ink-muted) hover:bg-white/[0.07] hover:text-(--ink)";

/** Western-region languages, in display order (everything not in ASIAN_LANGUAGES). */
const WESTERN_LANGUAGES: readonly SupportedLanguage[] =
	SUPPORTED_LANGUAGES.filter((lang) => !ASIAN_LANGUAGES.includes(lang));

function LanguageRadioItem({ lang }: { lang: SupportedLanguage }) {
	const coverage = LANGUAGE_COVERAGE[lang];
	return (
		<DropdownMenuRadioItem value={lang} className="gap-3">
			{/* Dim partial-coverage languages so it's clear they fall back
			    to English on many cards (TCGdex's es/pt vintage is sparse). */}
			<span className={coverage < 0.7 ? "opacity-55" : undefined}>
				{LANGUAGE_LABELS[lang]}
			</span>
			{lang !== "en" ? (
				<span className="ml-auto font-mono text-[10px] tabular-nums text-(--faint)">
					{Math.round(coverage * 100)}%
				</span>
			) : null}
		</DropdownMenuRadioItem>
	);
}

/**
 * Shared radio-menu body for a language picker dropdown: every supported
 * language, dimmed below 70% coverage, with a coverage % badge on non-English
 * entries. Used by both the per-page {@link CardLanguageControl} (ResultsBar /
 * card override) and the global sidebar-footer language control -- only the
 * trigger button and the value/onChange wiring differ between them.
 *
 * Languages are grouped into two labeled sections, "Western catalog" and
 * "Asian catalog", because the two regions' sets are disjoint -- picking a
 * language here is also how the viewer switches catalog region.
 */
export function LanguageRadioMenu({
	value,
	onValueChange,
	align = "end",
}: {
	value: SupportedLanguage;
	onValueChange: (lang: SupportedLanguage) => void;
	align?: "start" | "end";
}) {
	return (
		<DropdownMenuContent align={align}>
			<DropdownMenuRadioGroup
				value={value}
				onValueChange={(v) => onValueChange(v as SupportedLanguage)}
			>
				<DropdownMenuLabel>{m.catalog_western_label()}</DropdownMenuLabel>
				{WESTERN_LANGUAGES.map((lang) => (
					<LanguageRadioItem key={lang} lang={lang} />
				))}
				<DropdownMenuSeparator />
				<DropdownMenuLabel>{m.catalog_asian_label()}</DropdownMenuLabel>
				<p className="px-2 pb-1.5 text-[11px] text-(--ink-muted)">
					{m.catalog_asian_switch_note()}
				</p>
				{ASIAN_LANGUAGES.map((lang) => (
					<LanguageRadioItem key={lang} lang={lang} />
				))}
			</DropdownMenuRadioGroup>
		</DropdownMenuContent>
	);
}

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
						aria-label={m.settings_catalog_language_title()}
						title={m.catalog_language_title_with_value({
							language: LANGUAGE_LABELS[effective],
						})}
						className={TRIGGER_CLASS}
					>
						<CardGlyph className="size-4 opacity-70" />
						<span>{LANGUAGE_LABELS[effective]}</span>
						<ChevronDown className="size-4 opacity-70" />
					</Button>
				</DropdownMenuTrigger>
				<LanguageRadioMenu
					value={effective}
					onValueChange={(lang) =>
						onChange({ lang: lang === defaultLang ? null : lang })
					}
				/>
			</DropdownMenu>
		</ButtonGroup>
	);
}
