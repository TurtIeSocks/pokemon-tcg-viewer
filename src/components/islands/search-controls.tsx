import { ChevronDown, FilterX, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuLabel,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { groupSubtypes } from "./subtype-groups";

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

// A real MULTI-select over a string[] param: a DropdownMenu of checkbox items,
// each toggling its value in/out of the array (the full updated array is emitted).
// The trigger reads "All <label>" when empty, the single value when one is picked,
// and an "N selected" summary beyond that. Grouped rendering (Subtypes) is kept.
function FilterMultiSelect({
	label,
	value,
	options,
	onChange,
	grouped = false,
}: {
	label: string;
	value: string[];
	options: string[];
	onChange: (v: string[]) => void;
	grouped?: boolean;
}) {
	const selected = new Set(value);
	// Toggle keeps the caller's option order stable (append on add, filter on remove).
	const toggle = (o: string) =>
		onChange(selected.has(o) ? value.filter((v) => v !== o) : [...value, o]);

	const summary =
		value.length === 0
			? `All ${label}`
			: value.length === 1
				? value[0]
				: `${value.length} selected`;
	// Accessible name always carries the dimension label so it's queryable/announced
	// regardless of the current selection state (empty summary already includes it).
	const ariaLabel = value.length === 0 ? summary : `${label}: ${summary}`;

	const groups = grouped ? groupSubtypes(options) : null;
	const renderItem = (o: string) => (
		<DropdownMenuCheckboxItem
			key={o}
			checked={selected.has(o)}
			// Keep the menu open across toggles so several values can be picked at once.
			onSelect={(e) => e.preventDefault()}
			onCheckedChange={() => toggle(o)}
		>
			{o}
		</DropdownMenuCheckboxItem>
	);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					type="button"
					variant="outline"
					aria-label={ariaLabel}
					className="w-full justify-between rounded-[var(--r-control)] border-[var(--border)] bg-white/[0.04] px-3 font-normal text-[var(--ink)] hover:bg-white/[0.07]"
				>
					<span className="truncate">{summary}</span>
					<ChevronDown className="size-4 shrink-0 opacity-50" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="start"
				className="max-h-72 w-(--radix-dropdown-menu-trigger-width) min-w-40"
			>
				{groups
					? groups.map((g) => (
							<DropdownMenuGroup key={g.label}>
								<DropdownMenuLabel className="text-xs text-[var(--ink-muted)]">
									{g.label}
								</DropdownMenuLabel>
								{g.items.map(renderItem)}
							</DropdownMenuGroup>
						))
					: options.map(renderItem)}
			</DropdownMenuContent>
		</DropdownMenu>
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

// A MULTI-select over the species facet, mirroring FilterMultiSelect but keyed by
// national dex number over a number[] value: a DropdownMenu of checkbox items,
// each toggling its dex in/out of the array. The trigger reads "All Pokémon"
// (none), the single species name (one), or an "N selected" summary (more); the
// accessible name always carries the "Pokémon" dimension label.
function PokemonMultiSelect({
	value,
	options,
	onChange,
}: {
	value: number[];
	options: PokemonFacet[];
	onChange: (v: number[]) => void;
}) {
	const selected = new Set(value);
	// Toggle keeps the caller's selection order stable (append on add, filter on remove).
	const toggle = (dex: number) =>
		onChange(
			selected.has(dex) ? value.filter((d) => d !== dex) : [...value, dex],
		);

	const nameByDex = new Map(options.map((p) => [p.dex, p.name]));
	const summary =
		value.length === 0
			? "All Pokémon"
			: value.length === 1
				? (nameByDex.get(value[0]) ?? `#${value[0]}`)
				: `${value.length} selected`;
	// Accessible name always carries the dimension label (the empty summary already
	// includes it), so the control is queryable/announced regardless of selection.
	const ariaLabel = value.length === 0 ? summary : `Pokémon: ${summary}`;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					type="button"
					variant="outline"
					aria-label={ariaLabel}
					className="w-full justify-between rounded-[var(--r-control)] border-[var(--border)] bg-white/[0.04] px-3 font-normal text-[var(--ink)] hover:bg-white/[0.07]"
				>
					<span className="truncate">{summary}</span>
					<ChevronDown className="size-4 shrink-0 opacity-50" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="start"
				className="max-h-72 w-(--radix-dropdown-menu-trigger-width) min-w-40"
			>
				{options.map((p) => (
					<DropdownMenuCheckboxItem
						key={p.dex}
						checked={selected.has(p.dex)}
						// Keep the menu open across toggles so several species can be picked at once.
						onSelect={(e) => e.preventDefault()}
						onCheckedChange={() => toggle(p.dex)}
					>
						{p.name}
					</DropdownMenuCheckboxItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
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
		(showPokemonFilter ? value.pokemon.length : 0) +
		(showYearFilter && value.yearMin != null ? 1 : 0) +
		(showYearFilter && value.yearMax != null ? 1 : 0);

	// Reset every filter dimension to its default in ONE patch (applied immediately,
	// not debounced — the search route only debounces a lone `q` change). Leaves the
	// search text, search mode, and sort untouched.
	const clearFilters = () =>
		onChange({
			supertype: [],
			subtypes: [],
			rarity: [],
			types: [],
			owned: "all",
			pokemon: [],
			yearMin: null,
			yearMax: null,
		});

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
				{/* Reset all filters. Shown only when something is filtered so the bar
				    stays clean otherwise; sits before the toggle so the toggle keeps the
				    group's right rounding (rounded-r). */}
				{activeFilters > 0 && (
					<button
						type="button"
						aria-label="Clear filters"
						title="Clear filters"
						onClick={clearFilters}
						className="flex items-center border border-[var(--border)] bg-[var(--glass)] px-3 text-sm text-[var(--ink-muted)] cursor-pointer transition-colors hover:text-[var(--ink)] outline-none focus-visible:relative focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-[var(--primary)] [&_svg]:pointer-events-none"
					>
						<FilterX className="size-4" />
					</button>
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
							<FilterMultiSelect
								label="Card Types"
								value={value.supertype}
								options={options.supertypes}
								onChange={(v) => onChange({ supertype: v })}
							/>
						)}
						<FilterMultiSelect
							label="Subtypes"
							grouped
							value={value.subtypes}
							options={options.subtypes}
							onChange={(v) => onChange({ subtypes: v })}
						/>
						<FilterMultiSelect
							label="Rarities"
							value={value.rarity}
							options={options.rarities}
							onChange={(v) => onChange({ rarity: v })}
						/>
						{showEnergyType && (
							<FilterMultiSelect
								label="Energy Types"
								value={value.types}
								options={options.types}
								onChange={(v) => onChange({ types: v })}
							/>
						)}
						{showPokemonFilter && (
							<PokemonMultiSelect
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
