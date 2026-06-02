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

interface SearchControlsProps {
	value: ListSearch;
	options: SetFacets;
	onChange: (patch: Partial<ListSearch>) => void;
	placeholder?: string;
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

export function SearchControls({
	value,
	options,
	onChange,
	placeholder = "Search cards by name",
}: SearchControlsProps) {
	return (
		<div className="space-y-3">
			<Input
				type="search"
				defaultValue={value.q}
				placeholder={`${placeholder}...`}
				aria-label={placeholder}
				onChange={(e) => onChange({ q: e.target.value })}
			/>
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
			<fieldset className="flex items-center gap-2">
				<legend className="text-sm text-muted-foreground shrink-0">
					Release year
				</legend>
				<Input
					type="number"
					aria-label="Release year from"
					placeholder="From"
					min={1996}
					max={new Date().getFullYear()}
					className="text-sm w-24"
					value={value.yearMin ?? ""}
					onChange={(e) => {
						const n = Number(e.target.value);
						onChange({
							yearMin: e.target.value === "" || Number.isNaN(n) ? null : n,
						});
					}}
				/>
				<span className="text-sm text-muted-foreground" aria-hidden="true">
					–
				</span>
				<Input
					type="number"
					aria-label="Release year to"
					placeholder="To"
					min={1996}
					max={new Date().getFullYear()}
					className="text-sm w-24"
					value={value.yearMax ?? ""}
					onChange={(e) => {
						const n = Number(e.target.value);
						onChange({
							yearMax: e.target.value === "" || Number.isNaN(n) ? null : n,
						});
					}}
				/>
			</fieldset>
		</div>
	);
}
