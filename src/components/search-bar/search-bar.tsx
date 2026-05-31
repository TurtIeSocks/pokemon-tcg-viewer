import { useFilterValues } from "../../hooks/use-filter-values";
import { useSetIdParam } from "../../hooks/use-url-selection";
import { FilterSelect } from "./filter-select";
import { ScopeToggle } from "./scope-toggle";
import { SearchInput } from "./search-input";

export function SearchBar() {
	const [setId] = useSetIdParam();
	const values = useFilterValues();

	return (
		<div className="space-y-3">
			<SearchInput />
			<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
				<FilterSelect
					label="Card Type"
					paramName="supertype"
					options={values.supertypes}
				/>
				<FilterSelect
					label="Subtype"
					paramName="subtypes"
					options={values.subtypes}
				/>
				<FilterSelect
					label="Rarity"
					paramName="rarity"
					options={values.rarities}
				/>
				<FilterSelect
					label="Energy Type"
					paramName="types"
					options={values.types}
				/>
			</div>
			{setId && (
				<div className="flex justify-end">
					<ScopeToggle />
				</div>
			)}
		</div>
	);
}
