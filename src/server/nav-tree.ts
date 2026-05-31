import { createServerFn } from "@tanstack/react-start";
import { buildSlugIndex, slugify } from "../lib/slug";
import { getSetsFn } from "./card-data";
import type { PokemonSet } from "./card-mappers";

export interface NavSet {
	id: string;
	name: string;
	slug: string;
	logo: string;
	symbol: string;
	total: number;
}
export interface NavSeries {
	name: string;
	slug: string;
	year: number;
	sets: NavSet[];
}
export type NavTree = NavSeries[];

/**
 * Build a plain, JSON-serializable nav tree from the sets list. Set slugs are
 * taken from the collision-safe slug index (Plan 02) so they match the router's
 * resolution. Series ordered first-seen; sets ordered as given. No Maps in the
 * output — safe to return from a server function and render on the client.
 */
export function deriveNavTree(sets: PokemonSet[]): NavTree {
	const idx = buildSlugIndex(
		sets.map((s) => ({ id: s.id, name: s.name, series: s.series })),
		[],
	);
	const bySlug = new Map<string, NavSeries>();
	const order: NavSeries[] = [];
	for (const set of sets) {
		const seriesSlug = slugify(set.series);
		let series = bySlug.get(seriesSlug);
		if (!series) {
			series = { name: set.series, slug: seriesSlug, year: Number(set.releaseDate.slice(0, 4)) || 9999, sets: [] };
			bySlug.set(seriesSlug, series);
			order.push(series);
		}
		const loc = idx.setSlugById.get(set.id);
		if (!loc) continue;
		series.sets.push({
			id: set.id,
			name: set.name,
			slug: loc.setSlug,
			logo: set.images.logo,
			symbol: set.images.symbol,
			total: set.total,
		});
		const yr = Number(set.releaseDate.slice(0, 4));
		if (Number.isFinite(yr) && yr < series.year) series.year = yr;
	}
	return order;
}

export function findSeries(tree: NavTree, seriesSlug: string): NavSeries | undefined {
	return tree.find((s) => s.slug === seriesSlug);
}
export function findSet(
	tree: NavTree,
	seriesSlug: string,
	setSlug: string,
): NavSet | undefined {
	return findSeries(tree, seriesSlug)?.sets.find((s) => s.slug === setSlug);
}

// Memoize across requests in one server process. The sets list changes monthly;
// a process restart (deploy) picks up new sets. Avoids rebuilding the index per request.
let cached: NavTree | null = null;
export const getNavTreeFn = createServerFn({ method: "GET" }).handler(
	async (): Promise<NavTree> => {
		if (cached) return cached;
		const sets = await getSetsFn();
		cached = deriveNavTree(sets);
		return cached;
	},
);
