import "./filter-chip-row.css";
import { useSearchParams } from "react-router";
import { useFilterParam } from "../../hooks/use-url-selection";
import { FilterChip } from "./filter-chip";

interface FilterChipRowProps {
	types: string[];
	rarities: string[];
	supertypes: string[];
	subtypes: string[];
}

export function FilterChipRow({
	types,
	rarities,
	supertypes,
	subtypes,
}: FilterChipRowProps) {
	const [params, setParams] = useSearchParams();
	const [activeTypes] = useFilterParam("types");
	const [activeRarity] = useFilterParam("rarity");
	const [activeSupertype] = useFilterParam("supertype");
	const [activeSubtypes] = useFilterParam("subtypes");

	const anyActive =
		activeTypes.length > 0 ||
		activeRarity.length > 0 ||
		activeSupertype.length > 0 ||
		activeSubtypes.length > 0;

	function clearAll() {
		// Clear all params in a single update to avoid race conditions
		const next = new URLSearchParams(params);
		next.delete("types");
		next.delete("rarity");
		next.delete("supertype");
		next.delete("subtypes");
		setParams(next);
	}

	return (
		<div className="filter-chip-row" role="toolbar" aria-label="Filters">
			<FilterChip label="Type" paramName="types" options={types} />
			<FilterChip label="Rarity" paramName="rarity" options={rarities} />
			<FilterChip
				label="Supertype"
				paramName="supertype"
				options={supertypes}
			/>
			<FilterChip label="Subtype" paramName="subtypes" options={subtypes} />
			{anyActive && (
				<button
					type="button"
					className="filter-chip-row-clear-all"
					onClick={clearAll}
				>
					Clear filters
				</button>
			)}
		</div>
	);
}
