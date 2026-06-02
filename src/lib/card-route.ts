import type { LinkProps } from "@tanstack/react-router";
import type { SlugIndex } from "./slug";

/**
 * Build card-detail LinkProps (`/$series/$set/$card`) for a card, using a slug
 * index. Returns null when the set or card can't be resolved — callers fall back
 * to a no-op so a not-yet-hydrated grid never links somewhere wrong.
 */
export function cardRouteProps(
	idx: SlugIndex,
	card: { id: string; setId: string },
): LinkProps | null {
	const loc = idx.setSlugById.get(card.setId);
	const cardSlug = idx.cardSlugById.get(card.id);
	if (!loc || !cardSlug) return null;
	return {
		to: "/$series/$set/$card",
		params: { series: loc.seriesSlug, set: loc.setSlug, card: cardSlug },
	};
}
