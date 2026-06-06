import { Search } from "lucide-react";
import { ButtonGroup, ButtonGroupText } from "@/components/ui/button-group";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { SetFacets } from "@/server/set-facets";
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

export function SearchControls({
	value,
	options,
	onChange,
	placeholder = "Search cards by name",
	showYearFilter = false,
}: SearchControlsProps) {
	return (
		<div className="rounded-[var(--r-panel)] border border-[var(--border)] bg-[var(--glass)] backdrop-blur-xl p-3 space-y-3">
			<ButtonGroup className="w-full">
				<Input
					type="search"
					defaultValue={value.q}
					placeholder={`${placeholder}...`}
					aria-label={placeholder}
					onChange={(e) => onChange({ q: e.target.value })}
					className="min-w-0 bg-[var(--glass)] border-[var(--border)]"
				/>
				<SearchModeMenu
					value={value.mode}
					onChange={(mode) => onChange({ mode })}
				/>
				<ButtonGroupText
					aria-hidden="true"
					className="rounded-r-[var(--r-control)] bg-[var(--glass)] border-[var(--border)] text-[var(--ink-muted)]"
				>
					<Search className="size-4" />
				</ButtonGroupText>
			</ButtonGroup>
			<div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
				<FilterSelect
					label="Card Type"
					value={value.supertype}
					options={options.supertypes}
					onChange={(v) => onChange({ supertype: v })}
				/>
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
				<FilterSelect
					label="Energy Type"
					value={value.types}
					options={options.types}
					onChange={(v) => onChange({ types: v })}
				/>
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
					<span className="text-sm text-muted-foreground" aria-hidden="true">
						–
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
	);
}
