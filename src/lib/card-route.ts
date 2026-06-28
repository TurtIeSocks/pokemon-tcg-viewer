import type { LinkProps } from "@tanstack/react-router";
import type { SlugIndex } from "./slug";

export type CardTab = "details" | "collection" | "pricing";

declare module "@tanstack/react-router" {
	interface HistoryState {
		/**
		 * In-app card-overlay target as "series/set/slug". Set on the masked
		 * navigation so the root CardOverlay knows which card to show; absent on a
		 * cold load of the canonical URL (which renders the full page instead).
		 */
		cardOverlay?: string;
		/** Active card-overlay tab. Masked to the tab's canonical route. */
		cardTab?: CardTab;
	}
}

export interface CardRouteParams {
	series: string;
	set: string;
	card: string;
}

export const TAB_MASK = {
	details: "/$series/$set/$card",
	collection: "/$series/$set/$card/manage",
	pricing: "/$series/$set/$card/prices",
} as const satisfies Record<CardTab, LinkProps["to"]>;

/**
 * Shared masked-overlay nav for a given tab: stay on the current route, set
 * `cardOverlay` + `cardTab` in history state, and mask the URL to the tab's
 * canonical route. The three named helpers below delegate here.
 */
export function cardTabLinkPropsFor(
	p: CardRouteParams,
	tab: CardTab,
): LinkProps {
	return {
		to: ".",
		search: (prev: Record<string, unknown>) => prev,
		state: (prev: Record<string, unknown>) => ({
			...prev,
			cardOverlay: `${p.series}/${p.set}/${p.card}`,
			cardTab: tab,
		}),
		mask: { to: TAB_MASK[tab], params: p },
	} as LinkProps;
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
	return cardTabLinkPropsFor(p, "details");
}

/** {@link cardModalLinkPropsFor} resolved from a slug index, or null. */
export function cardModalLinkProps(
	idx: SlugIndex,
	card: { id: string; setId: string },
): LinkProps | null {
	const p = cardRouteParams(idx, card);
	return p ? cardModalLinkPropsFor(p) : null;
}

/**
 * In-app overlay navigation that opens the collection (manage) face over the
 * current page. Delegates to {@link cardTabLinkPropsFor} with `"collection"`,
 * which sets `cardTab: "collection"` in history state and masks the URL to
 * `/$series/$set/$card/manage`. A cold load of the masked URL falls through
 * to the real `$card_/manage` route.
 */
export function cardManageLinkPropsFor(p: CardRouteParams): LinkProps {
	return cardTabLinkPropsFor(p, "collection");
}

/** {@link cardManageLinkPropsFor} resolved from a slug index, or null. */
export function cardManageLinkProps(
	idx: SlugIndex,
	card: { id: string; setId: string },
): LinkProps | null {
	const p = cardRouteParams(idx, card);
	return p ? cardManageLinkPropsFor(p) : null;
}

/** In-app overlay nav that opens the Pricing tab. Mirrors the other two. */
export function cardPricesLinkPropsFor(p: CardRouteParams): LinkProps {
	return cardTabLinkPropsFor(p, "pricing");
}
