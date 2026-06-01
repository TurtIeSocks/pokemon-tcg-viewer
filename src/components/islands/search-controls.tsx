import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { SetFacets } from "@/server/set-facets";
import type { ListSearch } from "../../lib/card-query";

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
			<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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
			</div>
		</div>
	);
}
