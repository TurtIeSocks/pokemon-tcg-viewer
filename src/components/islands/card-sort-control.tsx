// src/components/islands/card-sort-control.tsx
import { SortControl } from "@/components/sort-control";
import {
	CARD_SORT_OPTIONS,
	type ListSearch,
	naturalCardDir,
} from "../../lib/card-query";

/**
 * Binds the generic SortControl to a card page's ListSearch sort/dir. Lives in
 * the ResultsBar after the Timeline toggle; the direction toggle is disabled in
 * the "Default" mode (which has no meaningful direction).
 */
export function CardSortControl({
	value,
	onChange,
}: {
	value: ListSearch;
	onChange: (patch: Partial<ListSearch>) => void;
}) {
	return (
		<SortControl
			mode={value.sort}
			dir={value.dir}
			options={CARD_SORT_OPTIONS}
			dirDisabled={value.sort === "default"}
			onModeChange={(sort) => onChange({ sort, dir: naturalCardDir() })}
			onDirChange={(dir) => onChange({ dir })}
		/>
	);
}
