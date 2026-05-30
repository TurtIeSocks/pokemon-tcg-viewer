import type { PokemonSet } from "../api";

export interface SeriesGroup {
	series: string;
	sets: PokemonSet[];
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
		let group = index.get(set.series);
		if (!group) {
			group = { series: set.series, sets: [] };
			index.set(set.series, group);
			groups.push(group);
		}
		group.sets.push(set);
	}
	return groups;
}
