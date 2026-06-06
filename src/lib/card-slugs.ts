import type { HoloCardData } from "../components/holo-card";
import { slugify } from "./slug";

export interface SetCardSlugs {
	idBySlug: Map<string, string>;
	slugById: Map<string, string>;
}

/**
 * Build a card-slug map for one set's cards (name + number, collision-safe).
 *
 * Pure + client-safe: NO server-only imports. Route files import this directly
 * (they're in the client graph because they render islands). The server-only
 * resolvers that need the corpus live in src/server/card-resolve.ts — keep them
 * separate so the corpus loader (node:zlib, process.env) never rides into the
 * client bundle via a shared module.
 */
export function buildSetCardSlugs(cards: HoloCardData[]): SetCardSlugs {
	const idBySlug = new Map<string, string>();
	const slugById = new Map<string, string>();
	for (const card of cards.toSorted((a, b) => a.id.localeCompare(b.id))) {
		const base = slugify(card.name);
		const num = slugify(card.cardNumber);
		let slug = num ? `${base}-${num}` : base;
		if (idBySlug.has(slug)) slug = `${slug}-${card.id}`;
		idBySlug.set(slug, card.id);
		slugById.set(card.id, slug);
	}
	return { idBySlug, slugById };
}
