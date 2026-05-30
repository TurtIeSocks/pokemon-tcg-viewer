import { useSetIdParam } from "../../hooks/use-url-selection";
import { FilterMenu } from "./filter-menu";
import { ScopeToggle } from "./scope-toggle";
import { SearchInput } from "./search-input";

export function SearchBar() {
	const [setId] = useSetIdParam();
	return (
		<div className="space-y-3">
			<div className="flex items-center gap-2">
				<SearchInput className="flex-1" />
				<FilterMenu />
			</div>
			{setId && (
				<div className="flex justify-end">
					<ScopeToggle />
				</div>
			)}
		</div>
	);
}
