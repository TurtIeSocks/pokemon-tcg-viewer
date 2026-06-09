import type { HoloCardData } from "../holo-card";

export interface CardEraGroup {
	series: string;
	yearLabel: string; // "" if no dates available
	count: number;
	cards: HoloCardData[];
}

/**
 * Group an array of cards by their `setSeries`, sort the groups by the
 * earliest `setReleaseDate` in each group (oldest first), and compute a
 * year-range label per group.
 *
 * Cards with missing/empty `setSeries` are bucketed into "Other".
 * Cards within each group preserve their input order — the caller is
 * expected to pass cards already sorted chronologically (the
 * pokemontcg.io API does this via `orderBy=set.releaseDate,number`).
 *
 * Groups with no release dates at all (all undefined) sort to the end
 * and get `yearLabel: ""`.
 */
export function groupCardsByEra(cards: HoloCardData[]): CardEraGroup[] {
	const groups = new Map<string, HoloCardData[]>();
	for (const card of cards) {
		const series = card.setSeries || "Other";
		const list = groups.get(series);
		if (list) list.push(card);
		else groups.set(series, [card]);
	}

	const result: (CardEraGroup & { earliest: number | null })[] = [];
	for (const [series, cardsInEra] of groups) {
		let minDate: number | null = null;
		let maxDate: number | null = null;
		for (const card of cardsInEra) {
			if (!card.setReleaseDate) continue;
			const t = Date.parse(card.setReleaseDate);
			if (Number.isNaN(t)) continue;
			if (minDate === null || t < minDate) minDate = t;
			if (maxDate === null || t > maxDate) maxDate = t;
		}
		let yearLabel = "";
		if (minDate !== null && maxDate !== null) {
			const minYear = new Date(minDate).getUTCFullYear();
			const maxYear = new Date(maxDate).getUTCFullYear();
			yearLabel = minYear === maxYear ? `${minYear}` : `${minYear}-${maxYear}`;
		}
		result.push({
			series,
			yearLabel,
			count: cardsInEra.length,
			cards: cardsInEra,
			earliest: minDate,
		});
	}

	// Sort: groups with a date by earliest ascending; groups without dates last.
	result.sort((a, b) => {
		if (a.earliest === null && b.earliest === null) return 0;
		if (a.earliest === null) return 1;
		if (b.earliest === null) return -1;
		return a.earliest - b.earliest;
	});

	// Strip the internal `earliest` field from the public shape.
	return result.map(({ earliest: _e, ...rest }) => rest);
}
