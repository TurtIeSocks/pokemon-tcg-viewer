import type { PokemonSet } from "../server/card-mappers";
import { buildSlugIndex } from "./slug";

export interface NavSet {
	id: string;
	name: string;
	slug: string;
	logo?: string;
	symbol?: string;
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
 *
 * Pure + client-safe: this module must NOT import a server function (createServerFn).
 * Client islands (sidebar, set tiles, toolbar) import the types + findSet/findSeries
 * from here; the `getNavTreeFn` server fn lives in src/server/nav-tree.ts so the
 * serverfn-split bundler never duplicates this module across the client/server
 * boundary (the "Server function info not found" class of bug).
 */
export function deriveNavTree(sets: PokemonSet[]): NavTree {
	const idx = buildSlugIndex(
		sets.map((s) => ({ id: s.id, name: s.name, series: s.series })),
		[],
	);
	const bySlug = new Map<string, NavSeries>();
	const order: NavSeries[] = [];
	for (const set of sets) {
		// Reuse the slug index's series slug instead of re-running slugify() so the
		// nav-tree can't drift from the router's slug resolution.
		const loc = idx.setSlugById.get(set.id);
		if (!loc) continue;
		const seriesSlug = loc.seriesSlug;
		let series = bySlug.get(seriesSlug);
		if (!series) {
			series = {
				name: set.series,
				slug: seriesSlug,
				year: Number(set.releaseDate.slice(0, 4)) || 9999,
				sets: [],
			};
			bySlug.set(seriesSlug, series);
			order.push(series);
		}
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

export function findSeries(
	tree: NavTree,
	seriesSlug: string,
): NavSeries | undefined {
	return tree.find((s) => s.slug === seriesSlug);
}
export function findSet(
	tree: NavTree,
	seriesSlug: string,
	setSlug: string,
): NavSet | undefined {
	return findSeries(tree, seriesSlug)?.sets.find((s) => s.slug === setSlug);
}

/**
 * A short, uniform-width monogram for a series, for the collapsed sidebar badge.
 * Two-or-more-word names take the first letter of the first two significant words
 * ("Scarlet & Violet" → "SV"); single-word names take the first two letters
 * ("Platinum" → "PL"). Always uppercased, always ≤2 chars. Stop-words (and/of/the)
 * and punctuation (&, -) are dropped so "Call of Legends" → "CL", "e-Card" → "EC".
 */
export function seriesMonogram(name: string): string {
	const words = name
		.split(/[^A-Za-z0-9]+/)
		.filter((w) => w && !/^(and|of|the)$/i.test(w));
	return (
		words.length >= 2
			? words[0][0] + words[1][0]
			: (words[0] ?? name).slice(0, 2)
	).toUpperCase();
}
