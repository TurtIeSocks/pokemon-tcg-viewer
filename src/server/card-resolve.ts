import type { HoloCardData } from "../components/holo-card";
import { buildSetCardSlugs, type SetCardSlugs } from "../lib/card-slugs";
import type { Region } from "../lib/languages";
import { queryCorpusServer } from "./corpus-loader";

// Re-export the pure slug builder for server-side callers' convenience. Client
// code (route files) imports buildSetCardSlugs from ../lib/card-slugs DIRECTLY,
// never from here — this module imports corpus-loader (node:zlib + process.env),
// so anything client-reachable that imports it leaks Node builtins into the
// browser bundle. (Guarded by scripts/check-client-bundle.ts.)
export { buildSetCardSlugs, type SetCardSlugs };

// Fetch + slug a whole set, memoized per (region, set id) for the process
// lifetime — keying by region too keeps an Asian-region set (queried via the
// asia corpus) from colliding with a west-cache entry of the same set id.
const setCache = new Map<
	string,
	Promise<{ cards: HoloCardData[]; slugs: SetCardSlugs }>
>();

async function loadSet(setId: string, region: Region) {
	const all = await queryCorpusServer({ setId, relevance: false }, region);
	return { cards: all, slugs: buildSetCardSlugs(all) };
}

function getSet(setId: string, region: Region) {
	const key = `${region}:${setId}`;
	let p = setCache.get(key);
	if (!p) {
		p = loadSet(setId, region);
		setCache.set(key, p);
	}
	return p;
}

/** Resolve a card slug within a set to its card id (or undefined). */
export async function resolveCardInSet(
	setId: string,
	cardSlug: string,
	region: Region = "west",
): Promise<string | undefined> {
	return (await getSet(setId, region)).slugs.idBySlug.get(cardSlug);
}

/** Canonical card slug for a card id within its set (or undefined). */
export async function cardSlugForId(
	setId: string,
	cardId: string,
	region: Region = "west",
): Promise<string | undefined> {
	return (await getSet(setId, region)).slugs.slugById.get(cardId);
}
