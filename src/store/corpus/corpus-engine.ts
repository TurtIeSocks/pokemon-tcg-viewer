import type { HoloCardData } from "../../components/holo-card";
import { cardImage } from "../../lib/card-image";
import { slugify } from "../../lib/slug";
import type { SortDir } from "../../lib/sort";
import type { PokemonSet } from "../../server/card-mappers";
import type { FilterClauses } from "../../utils/build-filter-clauses";
import type { CorpusCard } from "./corpus-types";
import { matchName, type NameMatch, normalize, type SearchMode } from "./fuzzy";
import { compareCardNumber } from "./natural-compare";

/**
 * Active display-language overlay passed into hydration. `lang` drives the
 * localized image url; `namesById` (when present) overrides the EN name per id.
 * Pass `null`/undefined for English — every existing call site is unchanged.
 */
export interface I18nOverlay {
	lang: string;
	namesById: Map<string, string> | null;
}

export interface CorpusQuery {
	/** Free-text name search. Empty/undefined → no name filter. */
	query?: string;
	setId?: string | null;
	dexNumber?: number | null;
	/** Slug of a single card name (e.g. "rare-candy"). Keeps only printings whose slugified name matches. */
	nameSlug?: string | null;
	/** Order results by release date (then number) instead of plain number order — for cross-set views. */
	chronological?: boolean;
	filters?: FilterClauses;
	/** Inclusive lower bound on release year (YYYY). Null/undefined → no lower bound. */
	yearMin?: number | null;
	/** Inclusive upper bound on release year (YYYY). Null/undefined → no upper bound. */
	yearMax?: number | null;
	/** Search mode: "exact" (whole name only), "contains" (prefix+substring), or "fuzzy" (default, adds typo tolerance). */
	mode?: SearchMode;
	/**
	 * Explicit user sort. "default"/undefined keeps the context order (relevance /
	 * release-date / number). Union kept inline (must match CardSortMode in
	 * src/lib/card-query.ts) to avoid a type cycle with that module.
	 */
	sort?: "default" | "dex" | "number" | "name" | "released";
	dir?: SortDir;
	/** True for global name search (relevance order); false for set/dex (natural order). */
	relevance: boolean;
}

/** In-memory corpus + parallel precomputed name indices. */
export interface CorpusIndex {
	cards: CorpusCard[];
	byId: Map<string, CorpusCard>;
	nameNorm: string[];
	nameTokens: string[][];
}

/** Build an id→set lookup from the sets list (or empty when not loaded yet). */
export function setsById(
	sets: PokemonSet[] | null | undefined,
): Map<string, PokemonSet> {
	return new Map((sets ?? []).map((s) => [s.id, s]));
}

/** Build the in-memory search index from a flat card list (normalised names + token arrays). */
export function buildIndex(cards: CorpusCard[]): CorpusIndex {
	// Single pass over the (large) card list builds all three structures at once.
	const nameNorm: string[] = [];
	const nameTokens: string[][] = [];
	const byId = new Map<string, CorpusCard>();
	for (const c of cards) {
		nameNorm.push(normalize(c.name));
		nameTokens.push(
			c.name.split(/[\s-]+/).flatMap((t) => {
				const n = normalize(t);
				return n ? [n] : [];
			}),
		);
		byId.set(c.id, c);
	}
	return { cards, byId, nameNorm, nameTokens };
}

function intersects(a: string[] | undefined, sel: string[]): boolean {
	return !!a && a.some((v) => sel.includes(v));
}

function passesFilters(card: CorpusCard, f: FilterClauses): boolean {
	if (f.types?.length && !intersects(card.types, f.types)) return false;
	if (f.rarities?.length && !(card.rarity && f.rarities.includes(card.rarity)))
		return false;
	if (
		f.supertypes?.length &&
		!(card.supertype && f.supertypes.includes(card.supertype))
	)
		return false;
	if (f.subtypes?.length && !intersects(card.subtypes, f.subtypes))
		return false;

	return true;
}

/**
 * Merge a lean CorpusCard with set metadata to produce a fully-hydrated HoloCardData.
 * Set fields fall back to setId / empty string when the set is not in the map.
 */
export function hydrateCard(
	card: CorpusCard,
	setsById: Map<string, PokemonSet>,
	i18n?: I18nOverlay | null,
): HoloCardData {
	const set = setsById.get(card.setId);
	// EN fallback: an overlay miss (or no overlay) keeps the baked English name.
	const name = i18n?.namesById?.get(card.id) ?? card.name;
	// Image url is derived per language; en (or no imageBase) returns the baked urls.
	const { imageUrl, imageUrlSmall } = cardImage(card, i18n?.lang ?? "en");
	// When the localized url differs from the baked EN url, hand the renderer the
	// EN url so it can reconcile a localized 404 back to English (a language may
	// lack an image EN has). Only set it when there is actually a fallback target.
	// Two resolutions: the grid falls back to the EN thumbnail (low.webp), the
	// focus view to the hi-res — so a fallback tile never loads a full-res image.
	const isLocalized = imageUrl !== card.imageUrl;
	const imageUrlFallback = isLocalized ? card.imageUrl : undefined;
	const imageUrlSmallFallback = isLocalized ? card.imageUrlSmall : undefined;
	return {
		id: card.id,
		imageUrl,
		imageUrlSmall,
		imageUrlFallback,
		imageUrlSmallFallback,
		name,
		rarity: card.rarity,
		subtypes: card.subtypes,
		types: card.types,
		supertype: card.supertype,
		setId: card.setId,
		setName: set?.name ?? card.setId,
		setSeries: set?.series ?? "",
		setReleaseDate: set?.releaseDate,
		cardNumber: card.number,
		nationalPokedexNumbers: card.nationalPokedexNumbers,
		variants: card.variants,
	};
}

interface Hit {
	card: CorpusCard;
	i: number;
	match: NameMatch | null;
}

export function queryCorpus(
	index: CorpusIndex,
	q: CorpusQuery,
	setsById: Map<string, PokemonSet>,
	i18n?: I18nOverlay | null,
): HoloCardData[] {
	const queryNorm = q.query ? normalize(q.query) : "";
	const hasName = queryNorm.length > 0;
	const filters = q.filters ?? {};
	const hits: Hit[] = [];

	for (let i = 0; i < index.cards.length; i++) {
		const card = index.cards[i];
		if (q.setId && card.setId !== q.setId) continue;
		if (
			q.dexNumber != null &&
			!card.nationalPokedexNumbers?.includes(q.dexNumber)
		)
			continue;
		// Name-anchored views (Trainer/Energy per-name pages) group by slugified
		// name across sets — no dex exists for non-Pokémon cards. Slugify on the fly
		// (only when nameSlug is set) to avoid bloating the index for every query.
		// ponytail: two distinct names that slugify identically would merge onto one
		// page (near-zero in the real card set); split by exact name if it ever bites.
		if (q.nameSlug != null && slugify(card.name) !== q.nameSlug) continue;
		if (!passesFilters(card, filters)) continue;
		if (q.yearMin != null || q.yearMax != null) {
			const year = Number(setsById.get(card.setId)?.releaseDate?.slice(0, 4));
			if (q.yearMin != null && (Number.isNaN(year) || year < q.yearMin))
				continue;
			if (q.yearMax != null && (Number.isNaN(year) || year > q.yearMax))
				continue;
		}
		let match: NameMatch | null = null;
		if (hasName) {
			match = matchName(
				queryNorm,
				index.nameNorm[i],
				index.nameTokens[i],
				q.mode ?? "fuzzy",
			);
			if (!match) continue;
		}
		hits.push({ card, i, match });
	}

	const relAt = (id: string) => setsById.get(id)?.releaseDate ?? "";
	const DEX_LAST = Number.MAX_SAFE_INTEGER;

	hits.sort((a, b) => {
		// Explicit user sort (SortControl) overrides relevance/chronological order.
		if (q.sort && q.sort !== "default") {
			const sign = q.dir === "desc" ? -1 : 1;
			let c = 0;
			if (q.sort === "name") c = a.card.name.localeCompare(b.card.name);
			else if (q.sort === "number")
				c = compareCardNumber(a.card.number, b.card.number);
			else if (q.sort === "released")
				c = relAt(a.card.setId).localeCompare(relAt(b.card.setId));
			else if (q.sort === "dex")
				c =
					(a.card.nationalPokedexNumbers?.[0] ?? DEX_LAST) -
					(b.card.nationalPokedexNumbers?.[0] ?? DEX_LAST);
			if (c !== 0) return sign * c;
			// Stable, direction-independent tie-break.
			return compareCardNumber(a.card.number, b.card.number);
		}
		if (q.relevance && a.match && b.match) {
			if (a.match.tier !== b.match.tier) return a.match.tier - b.match.tier;
			if (a.match.tier === 3 && a.match.distance !== b.match.distance)
				return a.match.distance - b.match.distance;
			if (a.card.name.length !== b.card.name.length)
				return a.card.name.length - b.card.name.length;
		}
		const ra = relAt(a.card.setId);
		const rb = relAt(b.card.setId);
		if (q.dexNumber != null || q.relevance || q.chronological) {
			if (ra !== rb) return ra.localeCompare(rb);
		}
		return compareCardNumber(a.card.number, b.card.number);
	});

	return hits.map((h) => hydrateCard(h.card, setsById, i18n));
}
