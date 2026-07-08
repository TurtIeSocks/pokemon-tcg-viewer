import type { LinkProps } from "@tanstack/react-router";
import { useCallback, useRef } from "react";
import type { HoloCardData } from "../components/holo-card";
import { useSlugIndex } from "../store/corpus/corpus-runtime";
import {
	type CardRouteParams,
	cardModalLinkProps,
	cardModalLinkPropsForCard,
} from "./card-route";

/**
 * Resolve each card's canonical `/$series/$set/$card` modal link. Cards on a
 * cross-set list (one species, one named Trainer, a whole supertype) span many
 * sets, so the link can't be derived from route params — it's looked up per card.
 *
 * Priority: a server-resolved `routes` map (`{ cardId -> params }`, built in the
 * loader) wins — so the seed cards link correctly in the FIRST paint without
 * waiting on the client corpus. Cards not in `routes` (e.g. client-paginated
 * pages) fall back to the client slug index, then to `fallback` until it loads.
 * Passing no `routes` preserves the old client-only behavior byte-for-byte.
 *
 * Shared by every cross-set list page (pokemon / trainer / energy / search).
 */
export function useCorpusCardHref(
	fallback: LinkProps,
	routes?: Record<string, CardRouteParams>,
): (card: HoloCardData) => LinkProps {
	const slugIndex = useSlugIndex();
	// Callers pass fresh `fallback`/`routes` each render, so keep them in refs and
	// depend only on slugIndex — the resolver stays referentially stable (it
	// changes once, when the corpus loads) while still reading the latest values.
	// Depending on them directly would defeat the memo.
	const fallbackRef = useRef(fallback);
	fallbackRef.current = fallback;
	const routesRef = useRef(routes);
	routesRef.current = routes;
	return useCallback(
		(card: HoloCardData): LinkProps => {
			const pre = routesRef.current?.[card.id];
			if (pre) return cardModalLinkPropsForCard(pre, card);
			return (
				(slugIndex ? cardModalLinkProps(slugIndex, card) : null) ??
				fallbackRef.current
			);
		},
		[slugIndex],
	);
}
