import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { ButtonGroup } from "@/components/ui/button-group";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";
import { useUiPrefs } from "@/store/ui-prefs";
import {
	GENERATIONS,
	type PokedexFilter,
	type PokedexSort,
} from "../../lib/pokedex";

const SORTS: { value: PokedexSort; label: string }[] = [
	{ value: "dex", label: "Dex number" },
	{ value: "name", label: "Name" },
	{ value: "count", label: "Most cards" },
];

interface PokedexControlsProps {
	value: PokedexFilter;
	/** Species types present in the corpus, for the Type dropdown. */
	typeOptions: string[];
	onChange: (patch: Partial<PokedexFilter>) => void;
}

/**
 * The Pokédex directory's search bar + expandable filters, matching the card
 * pages' SearchControls chrome (glass Collapsible, sliders toggle, active-filter
 * badge). Filters are species-scoped: Type, Generation, and Sort.
 */
export function PokedexControls({
	value,
	typeOptions,
	onChange,
}: PokedexControlsProps) {
	// Query lives in the always-visible search box, so it's excluded; sort is an
	// ordering, not a filter. Only Type + Generation count toward the badge.
	const activeFilters = (value.type ? 1 : 0) + (value.generation ? 1 : 0);

	// Collapsed by default on mobile, expanded on desktop; the user's toggle
	// persists app-wide via the shared UI-prefs store (same as the card pages).
	const isMobile = useIsMobile();
	const filtersOpen = useUiPrefs((s) => s.filtersOpen);
	const setFiltersOpen = useUiPrefs((s) => s.setFiltersOpen);
	const open = filtersOpen ?? !isMobile;

	return (
		<Collapsible
			open={open}
			onOpenChange={setFiltersOpen}
			className="rounded-[var(--r-panel)] border border-[var(--border)] bg-[var(--glass)] p-3 backdrop-blur-xl"
		>
			<ButtonGroup className="w-full">
				<Input
					type="search"
					defaultValue={value.query}
					placeholder="Search species by name or dex number..."
					aria-label="Search species by name or dex number"
					onChange={(e) => onChange({ query: e.target.value })}
					className="min-w-0 border-[var(--border)] bg-[var(--glass)]"
				/>
				<CollapsibleTrigger
					aria-label="Toggle filters"
					className="group flex cursor-pointer items-center gap-1.5 rounded-r-[var(--r-control)] border border-[var(--border)] bg-[var(--glass)] px-3 text-sm text-[var(--ink-muted)] outline-none transition-colors hover:text-[var(--ink)] focus-visible:relative focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-[var(--primary)] [&_svg]:pointer-events-none"
				>
					<SlidersHorizontal className="size-4" />
					{activeFilters > 0 && (
						<span className="inline-flex min-w-4 items-center justify-center rounded-full bg-[var(--primary)] px-1 font-mono text-xs text-[var(--primary-ink)] tabular-nums">
							{activeFilters}
						</span>
					)}
					<ChevronDown className="size-4 transition-transform duration-200 group-data-[state=open]:rotate-180 motion-reduce:transition-none" />
				</CollapsibleTrigger>
			</ButtonGroup>
			<CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down motion-reduce:animate-none">
				<div className="grid grid-cols-2 gap-2 pt-3 sm:grid-cols-3">
					<NullableSelect
						label="Type"
						allLabel="All types"
						value={value.type}
						options={typeOptions}
						onChange={(type) => onChange({ type })}
					/>
					<NullableSelect
						label="Generation"
						allLabel="All generations"
						value={value.generation}
						options={GENERATIONS.map((g) => g.label)}
						onChange={(generation) => onChange({ generation })}
					/>
					<Select
						value={value.sort}
						onValueChange={(v) => onChange({ sort: v as PokedexSort })}
					>
						<SelectTrigger className="w-full text-sm" aria-label="Sort">
							<SelectValue placeholder="Sort" />
						</SelectTrigger>
						<SelectContent>
							{SORTS.map((s) => (
								<SelectItem key={s.value} value={s.value}>
									{s.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</CollapsibleContent>
		</Collapsible>
	);
}

// Single-select mapping to `string | null` (null = no filter on this dimension).
// Radix Select forbids an empty-string item value, so a sentinel clears it.
function NullableSelect({
	label,
	allLabel,
	value,
	options,
	onChange,
}: {
	label: string;
	allLabel: string;
	value: string | null;
	options: string[];
	onChange: (v: string | null) => void;
}) {
	const ALL = "__all__";
	return (
		<Select
			value={value ?? ALL}
			onValueChange={(v) => onChange(v === ALL ? null : v)}
		>
			<SelectTrigger className="w-full text-sm" aria-label={label}>
				<SelectValue placeholder={label} />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value={ALL}>{allLabel}</SelectItem>
				{options.map((o) => (
					<SelectItem key={o} value={o}>
						{o}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
