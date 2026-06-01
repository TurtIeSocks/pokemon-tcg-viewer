import type { HoloCardData } from "../components/holo-card";
import { buildSetCardSlugs, type SetCardSlugs } from "../lib/card-slugs";
import { queryCorpusServer } from "./corpus-loader";

// Re-export the pure slug builder for server-side callers' convenience. Client
// code (route files) imports buildSetCardSlugs from ../lib/card-slugs DIRECTLY,
// never from here — this module imports corpus-loader (node:zlib + process.env),
// so anything client-reachable that imports it leaks Node builtins into the
// browser bundle. (Guarded by scripts/check-client-bundle.ts.)
export { buildSetCardSlugs, type SetCardSlugs };

// Fetch + slug a whole set, memoized per set id for the process lifetime.
const setCache = new Map<
	string,
	Promise<{ cards: HoloCardData[]; slugs: SetCardSlugs }>
>();

async function loadSet(setId: string) {
	const all = await queryCorpusServer({ setId, relevance: false });
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
