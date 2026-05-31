import type { HoloCardData } from "../components/holo-card";
import { slugify } from "../lib/slug";
import { fetchCards } from "./card-data";

export interface SetCardSlugs {
	idBySlug: Map<string, string>;
	slugById: Map<string, string>;
}

/** Build a card-slug map for one set's cards (name + number, collision-safe). */
export function buildSetCardSlugs(cards: HoloCardData[]): SetCardSlugs {
	const idBySlug = new Map<string, string>();
	const slugById = new Map<string, string>();
	for (const card of [...cards].sort((a, b) => a.id.localeCompare(b.id))) {
		const base = slugify(card.name);
		const num = slugify(card.cardNumber);
		let slug = num ? `${base}-${num}` : base;
		if (idBySlug.has(slug)) slug = `${slug}-${card.id}`;
		idBySlug.set(slug, card.id);
		slugById.set(card.id, slug);
	}
	return { idBySlug, slugById };
}

// Fetch + slug a whole set, memoized per set id for the process lifetime.
const setCache = new Map<
	string,
	Promise<{ cards: HoloCardData[]; slugs: SetCardSlugs }>
>();

async function loadSet(setId: string) {
	const all: HoloCardData[] = [];
	let page = 1;
	let total = Number.POSITIVE_INFINITY;
	while (all.length < total && page <= 10) {
		const res = await fetchCards(`set.id:${setId}`, page, 250, "number");
		all.push(...res.cards);
		total = res.totalCount;
		if (res.cards.length === 0) break;
		page++;
	}
	return { cards: all, slugs: buildSetCardSlugs(all) };
}

function getSet(setId: string) {
	let p = setCache.get(setId);
	if (!p) {
		p = loadSet(setId);
		setCache.set(setId, p);
	}
	return p;
}

/** Resolve a card slug within a set to its card id (or undefined). */
export async function resolveCardInSet(
	setId: string,
	cardSlug: string,
): Promise<string | undefined> {
	return (await getSet(setId)).slugs.idBySlug.get(cardSlug);
}

/** Canonical card slug for a card id within its set (or undefined). */
export async function cardSlugForId(
	setId: string,
	cardId: string,
): Promise<string | undefined> {
	return (await getSet(setId)).slugs.slugById.get(cardId);
}
