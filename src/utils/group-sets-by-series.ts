import type { PokemonSet } from "../server/card-mappers";

export interface SeriesGroup {
	series: string;
	sets: PokemonSet[];
	/** Earliest release year among the series' sets (YYYY from releaseDate). */
	year: number;
}

/**
 * Group sets by their `series`, preserving first-seen series order and the
 * original set order within each series. Drives the series menu: one entry per
 * series, each holding the sets revealed in that series' hover popover.
 */
export function groupSetsBySeries(sets: PokemonSet[]): SeriesGroup[] {
	const groups: SeriesGroup[] = [];
	const index = new Map<string, SeriesGroup>();
	for (const set of sets) {
		const year = Number(set.releaseDate.slice(0, 4));
		let group = index.get(set.series);
		if (!group) {
			group = { series: set.series, sets: [], year };
			index.set(set.series, group);
			groups.push(group);
		}
		group.sets.push(set);
		if (Number.isFinite(year) && year < group.year) group.year = year;
	}
	return groups;
}
