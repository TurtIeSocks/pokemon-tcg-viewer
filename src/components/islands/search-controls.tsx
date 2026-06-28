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
import type { PokemonFacet, SetFacets } from "@/server/set-facets";
import { useUiPrefs } from "@/store/ui-prefs";
import type { ListSearch, OwnedMode } from "../../lib/card-query";
import { SearchModeMenu } from "./search-mode-menu";

// Computed once at module load (client island) — avoids a `new Date()` on every
// render (impure under React Compiler) and a server/client hydration mismatch.
const CURRENT_YEAR = new Date().getFullYear();

// Earliest release year in the corpus (matches the old number-input `min`).
const FIRST_YEAR = 1996;

// Selectable release years, newest first. ~30 discrete values → a bounded Select
// beats free-typed number inputs (no typos, no out-of-range, mobile-friendly).
const YEARS = Array.from(
	{ length: CURRENT_YEAR - FIRST_YEAR + 1 },
	(_, i) => CURRENT_YEAR - i,
);

interface SearchControlsProps {
	value: ListSearch;
	options: SetFacets;
	onChange: (patch: Partial<ListSearch>) => void;
	placeholder?: string;
	/** When true, renders the Release-year From/To inputs. Defaults to false. */
	showYearFilter?: boolean;
	/** When true, renders the Pokémon (species) filter select. Defaults to false. */
	showPokemonFilter?: boolean;
	/** When true, hides the Card Type (supertype) dropdown — the page locks it. */
	lockSupertype?: boolean;
}

// A single-select that maps to a string[] param (one active value at a time —
// matches the main filter UX; multi was never exposed). "" clears the dimension.
function FilterSelect({
	label,
	value,
	options,
	onChange,
}: {
	label: string;
	value: string[];
	options: string[];
	onChange: (v: string[]) => void;
}) {
	// Radix Select forbids an empty-string item value, so use a sentinel for "clear".
	const ALL = "__all__";
	return (
		<Select
			value={value[0] ?? ALL}
			onValueChange={(v) => onChange(v === ALL ? [] : [v])}
		>
			<SelectTrigger className="text-sm w-full">
				<SelectValue placeholder={label} />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value={ALL}>{`All ${label}`}</SelectItem>
				{options.map((o) => (
					<SelectItem key={o} value={o}>
						{o}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

// One end of the release-year range. `null` = open-ended (the sentinel option).
function YearSelect({
	label,
	value,
	years,
	onChange,
}: {
	label: string;
	value: number | null;
	years: number[];
	onChange: (v: number | null) => void;
}) {
	// Radix Select forbids an empty-string item value, so use a sentinel for "any".
	const ANY = "__any__";
	return (
		<Select
			value={value != null ? String(value) : ANY}
			onValueChange={(v) => onChange(v === ANY ? null : Number(v))}
		>
			<SelectTrigger className="text-sm w-full" aria-label={label}>
				<SelectValue placeholder={label} />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value={ANY}>{label}</SelectItem>
				{years.map((y) => (
					<SelectItem key={y} value={String(y)}>
						{y}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

// Single-select species filter. Value is a national dex number; the "__all__"
// sentinel clears it (Radix Select forbids an empty-string item value). Options
// are the species present in the current cards, labeled + sorted upstream.
function PokemonFilterSelect({
	value,
	options,
	onChange,
}: {
	value: number | null;
	options: PokemonFacet[];
	onChange: (v: number | null) => void;
}) {
	const ALL = "__all__";
	return (
		<Select
			value={value != null ? String(value) : ALL}
			onValueChange={(v) => onChange(v === ALL ? null : Number(v))}
		>
			<SelectTrigger className="text-sm w-full" aria-label="Pokémon">
				<SelectValue placeholder="Pokémon" />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value={ALL}>All Pokémon</SelectItem>
				{options.map((p) => (
					<SelectItem key={p.dex} value={String(p.dex)}>
						{p.name}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

export function SearchControls({
	value,
	options,
	onChange,
	placeholder = "Search cards by name",
	showYearFilter = false,
	showPokemonFilter = false,
	lockSupertype = false,
}: SearchControlsProps) {
	// Count of active filter dimensions (q lives in the always-visible search box,
	// so it's excluded). Single-select dimensions hold 0 or 1 value, so `.length`
	// sums cleanly. Surfaced as a badge on the toggle so applied filters stay
	// visible even when the panel is collapsed.
	const activeFilters =
		(lockSupertype ? 0 : value.supertype.length) +
		value.subtypes.length +
		value.rarity.length +
		value.types.length +
		(value.owned !== "all" ? 1 : 0) +
		(showPokemonFilter && value.pokemon != null ? 1 : 0) +
		(showYearFilter && value.yearMin != null ? 1 : 0) +
		(showYearFilter && value.yearMax != null ? 1 : 0);

	// Collapsed by default on mobile (where the filter grid eats vertical space),
	// expanded on desktop. `useIsMobile` is SSR-safe (server snapshot = desktop).
	// `filtersOpen` is null until the user toggles, then their choice persists
	// across reloads (localStorage-backed UI-prefs store).
	const isMobile = useIsMobile();
	const filtersOpen = useUiPrefs((s) => s.filtersOpen);
	const setFiltersOpen = useUiPrefs((s) => s.setFiltersOpen);
	const open = filtersOpen ?? !isMobile;

	// The Energy Type filter only makes sense where cards actually carry energy
	// types — hide it on Trainer/Energy pages (whose cards have none), where the
	// facet is empty and the filter would be a dead control.
	const showEnergyType = options.types.length > 0;
	// Visible filter-grid controls: Subtype + Rarity + Collection are always on;
	// the rest are conditional. Drives the responsive column count.
	const filterCols =
		3 +
		(lockSupertype ? 0 : 1) +
		(showEnergyType ? 1 : 0) +
		(showPokemonFilter ? 1 : 0);
	const gridColsClass = {
		3: "sm:grid-cols-3",
		4: "sm:grid-cols-4",
		5: "sm:grid-cols-5",
		6: "sm:grid-cols-6",
	}[filterCols];

	return (
		<Collapsible
			open={open}
			onOpenChange={setFiltersOpen}
			className="rounded-[var(--r-panel)] border border-[var(--border)] bg-[var(--glass)] backdrop-blur-xl p-3"
		>
			<ButtonGroup className="w-full">
				<Input
					type="search"
					defaultValue={value.q}
					placeholder={`${placeholder}...`}
					aria-label={placeholder}
					onChange={(e) => onChange({ q: e.target.value })}
					className="min-w-0 bg-[var(--glass)] border-[var(--border)]"
				/>
				{/* On mobile the mode picker moves into the filter body to free up
				    the cramped search bar; on desktop it stays fused in the bar. */}
				{!isMobile && (
					<SearchModeMenu
						value={value.mode}
						onChange={(mode) => onChange({ mode })}
					/>
				)}
				<CollapsibleTrigger
					aria-label="Toggle filters"
					className="group flex items-center gap-1.5 rounded-r-[var(--r-control)] border border-[var(--border)] bg-[var(--glass)] px-3 text-sm text-[var(--ink-muted)] cursor-pointer transition-colors hover:text-[var(--ink)] outline-none focus-visible:relative focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-[var(--primary)] [&_svg]:pointer-events-none"
				>
					<SlidersHorizontal className="size-4" />
					{activeFilters > 0 && (
						<span className="inline-flex min-w-4 items-center justify-center rounded-full bg-[var(--primary)] px-1 font-mono text-xs tabular-nums text-[var(--primary-ink)]">
							{activeFilters}
						</span>
					)}
					<ChevronDown className="size-4 transition-transform duration-200 group-data-[state=open]:rotate-180 motion-reduce:transition-none" />
				</CollapsibleTrigger>
			</ButtonGroup>
			<CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down motion-reduce:animate-none">
				<div className="space-y-3 pt-3">
					{isMobile && (
						<div className="flex items-center gap-2">
							<span className="shrink-0 text-sm text-[var(--ink-muted)]">
								Search mode
							</span>
							<SearchModeMenu
								value={value.mode}
								onChange={(mode) => onChange({ mode })}
								className="flex-1 justify-between rounded-[var(--r-control)]"
							/>
						</div>
					)}
					<div className={`grid grid-cols-2 gap-2 ${gridColsClass}`}>
						{!lockSupertype && (
							<FilterSelect
								label="Card Type"
								value={value.supertype}
								options={options.supertypes}
								onChange={(v) => onChange({ supertype: v })}
							/>
						)}
						<FilterSelect
							label="Subtype"
							value={value.subtypes}
							options={options.subtypes}
							onChange={(v) => onChange({ subtypes: v })}
						/>
						<FilterSelect
							label="Rarity"
							value={value.rarity}
							options={options.rarities}
							onChange={(v) => onChange({ rarity: v })}
						/>
						{showEnergyType && (
							<FilterSelect
								label="Energy Type"
								value={value.types}
								options={options.types}
								onChange={(v) => onChange({ types: v })}
							/>
						)}
						{showPokemonFilter && (
							<PokemonFilterSelect
								value={value.pokemon}
								options={options.pokemon}
								onChange={(pokemon) => onChange({ pokemon })}
							/>
						)}
						<Select
							value={value.owned}
							onValueChange={(v) => onChange({ owned: v as OwnedMode })}
						>
							<SelectTrigger className="text-sm w-full">
								<SelectValue placeholder="Collection" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All cards</SelectItem>
								<SelectItem value="owned">Owned</SelectItem>
								<SelectItem value="missing">Missing</SelectItem>
							</SelectContent>
						</Select>
					</div>
					{showYearFilter && (
						<fieldset className="flex items-center gap-2">
							<legend className="text-sm text-muted-foreground shrink-0">
								Release year
							</legend>
							{/*
							 * Cross-field constraint: each end only offers years that keep the
							 * range valid — From ≤ the chosen To, To ≥ the chosen From — so an
							 * inverted From > To range can't be built in the UI.
							 */}
							<YearSelect
								label="From"
								value={value.yearMin}
								years={YEARS.filter(
									(y) => value.yearMax == null || y <= value.yearMax,
								)}
								onChange={(yearMin) => onChange({ yearMin })}
							/>
							<span
								className="text-sm text-muted-foreground"
								aria-hidden="true"
							>
								-
							</span>
							<YearSelect
								label="To"
								value={value.yearMax}
								years={YEARS.filter(
									(y) => value.yearMin == null || y >= value.yearMin,
								)}
								onChange={(yearMax) => onChange({ yearMax })}
							/>
						</fieldset>
					)}
				</div>
			</CollapsibleContent>
		</Collapsible>
	);
}
