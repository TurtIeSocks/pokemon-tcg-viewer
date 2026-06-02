import type { LinkProps } from "@tanstack/react-router";
import type { SlugIndex } from "./slug";

declare module "@tanstack/react-router" {
	interface HistoryState {
		/**
		 * In-app card-overlay target as "series/set/slug". Set on the masked
		 * navigation so the root CardOverlay knows which card to show; absent on a
		 * cold load of the canonical URL (which renders the full page instead).
		 */
		cardOverlay?: string;
	}
}

export interface CardRouteParams {
	series: string;
	set: string;
	card: string;
}

/**
 * Resolve a card to its canonical `/$series/$set/$card` route params via the
 * slug index, or null when the set/card can't be resolved (e.g. corpus not yet
 * loaded). The same slugs the detail route resolves on the server.
 */
export function cardRouteParams(
	idx: SlugIndex,
	card: { id: string; setId: string },
): CardRouteParams | null {
	const loc = idx.setSlugById.get(card.setId);
	const cardSlug = idx.cardSlugById.get(card.id);
	if (!loc || !cardSlug) return null;
	return { series: loc.seriesSlug, set: loc.setSlug, card: cardSlug };
}

/** Canonical card-detail LinkProps — the full, shareable page URL. */
export function cardRouteProps(
	idx: SlugIndex,
	card: { id: string; setId: string },
): LinkProps | null {
	const p = cardRouteParams(idx, card);
	return p ? { to: "/$series/$set/$card", params: p } : null;
}

/**
 * In-app overlay navigation for the given canonical params: stay on the current
 * route (so the grid behind stays mounted), set `cardOverlay` in history state,
 * and MASK the URL to the canonical `/$series/$set/$card`. The root overlay
 * reads that state (see card-overlay.tsx); a cold load of the masked URL has no
 * state and falls back to the full-page route.
 */
export function cardModalLinkPropsFor(p: CardRouteParams): LinkProps {
	return {
		to: ".",
		// Keep the current grid's query/filters — `to: "."` would otherwise reset
		// search to defaults, emptying the results that should stay behind the modal.
		search: (prev: Record<string, unknown>) => prev,
		state: (prev: Record<string, unknown>) => ({
			...prev,
			cardOverlay: `${p.series}/${p.set}/${p.card}`,
		}),
		mask: { to: "/$series/$set/$card", params: p },
	} as LinkProps;
}

/** {@link cardModalLinkPropsFor} resolved from a slug index, or null. */
export function cardModalLinkProps(
	idx: SlugIndex,
	card: { id: string; setId: string },
): LinkProps | null {
	const p = cardRouteParams(idx, card);
	return p ? cardModalLinkPropsFor(p) : null;
}
