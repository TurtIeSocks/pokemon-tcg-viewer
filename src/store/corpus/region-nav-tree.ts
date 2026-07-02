import { useEffect, useState } from "react";
import type { Region } from "../../lib/languages";
import type { NavTree } from "../../lib/nav-tree";
import { getNavTreeFn } from "../../server/nav-tree";
import { useCorpusRuntime } from "./corpus-runtime-store";

// Per-region client cache for nav trees fetched after a language switch. The
// west tree is the SSR root-loader tree (passed in); only non-west regions are
// fetched here. In-flight promises are deduped so the several consumers (sidebar,
// header, command palette, home) that call this concurrently issue one request.
const cache = new Map<Region, NavTree>();
const inflight = new Map<Region, Promise<NavTree>>();

function fetchRegionTree(region: Region): Promise<NavTree> {
	const cached = cache.get(region);
	if (cached) return Promise.resolve(cached);
	let p = inflight.get(region);
	if (!p) {
		p = getNavTreeFn({ data: { region } }).then((t) => {
			cache.set(region, t);
			inflight.delete(region);
			return t;
		});
		inflight.set(region, p);
	}
	return p;
}

/**
 * The browse nav tree for the ACTIVE region.
 *
 * The root route loader fetches the tree region-blind (west), and the display-
 * language picker switches region on the CLIENT without navigating — so the
 * root loader never re-runs and the sidebar/header/browse tree would stay on
 * the Western catalog even though the active corpus flipped. This hook closes
 * that gap: for west it returns the SSR `westTree`; for another region it
 * fetches that region's tree once (cached), so the visible browse structure
 * follows the language switch. Falls back to the west tree while the fetch is
 * in flight.
 */
export function useActiveRegionNavTree(westTree: NavTree): NavTree {
	const region = useCorpusRuntime((s) => s.activeRegion);
	const [, force] = useState(0);

	useEffect(() => {
		if (region === "west" || cache.has(region)) return;
		let cancelled = false;
		void fetchRegionTree(region).then(() => {
			if (!cancelled) force((n) => n + 1);
		});
		return () => {
			cancelled = true;
		};
	}, [region]);

	if (region === "west") return westTree;
	return cache.get(region) ?? westTree;
}
