/** Sort direction shared by every sortable list. */
export type SortDir = "asc" | "desc";

/** One selectable sort mode in a SortControl. */
export interface SortOption<T extends string> {
	value: T;
	label: string;
}

export interface SortControlProps<T extends string> {
	mode: T;
	dir: SortDir;
	options: SortOption<T>[];
	onModeChange: (mode: T) => void;
	onDirChange: (dir: SortDir) => void;
	/** Disable the direction toggle (e.g. a "Default" mode with no direction). */
	dirDisabled?: boolean;
}
