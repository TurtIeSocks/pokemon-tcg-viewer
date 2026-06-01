import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { ListSearch } from "../../lib/card-query";

export interface FacetOptions {
	supertypes: string[];
	subtypes: string[];
	rarities: string[];
	types: string[];
}

interface SearchControlsProps {
	value: ListSearch;
	options: FacetOptions;
	/** Whether to show the this-set / all-sets scope toggle. */
	showScope: boolean;
	onChange: (patch: Partial<ListSearch>) => void;
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
	// showScope,
	onChange,
}: SearchControlsProps) {
	return (
		<div className="space-y-3">
			<Input
				type="search"
				defaultValue={value.q}
				placeholder="Search cards by name…"
				aria-label="Search cards by name"
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
				{/* {showScope && (
					<div className="flex gap-1 text-xs">
						{SCOPES.map((s) => (
							<button
								key={s}
								type="button"
								onClick={() => onChange({ scope: s })}
								aria-pressed={value.scope === s}
								className={
									value.scope === s
										? "rounded bg-primary px-2 py-1 text-primary-foreground"
										: "rounded bg-secondary px-2 py-1 text-muted-foreground"
								}
							>
								{s === "set" ? "This set" : "All sets"}
							</button>
						))}
					</div>
				)} */}
			</div>
		</div>
	);
}
