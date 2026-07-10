import type { HoloCardData } from "../../components/holo-card";
import { cardImage } from "../../lib/card-image";
import {
	faceLanguageFor,
	type Region,
	toSupportedLanguage,
} from "../../lib/languages";
import { rarityRank } from "../../lib/rarity-order";
import { slugify } from "../../lib/slug";
import type { SortDir } from "../../lib/sort";
import type { PokemonSet } from "../../server/card-mappers";
import type { FilterClauses } from "../../utils/build-filter-clauses";
import type { CorpusCard } from "./corpus-types";
import {
	matchNameExpr,
	type NameMatch,
	normalize,
	type SearchMode,
} from "./fuzzy";
import { compareCardNumber } from "./natural-compare";
import { type FieldFilters, parseSearchQuery } from "./search-grammar";

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
	/** National dex numbers (species multi-select). A card matches when ANY of these is in its `nationalPokedexNumbers`. Empty/undefined → no species filter. */
	dexNumbers?: number[];
	/**
	 * Card "name" filter (multi-select). Mixed keys: a dex number (as a string)
	 * for Pokémon, or a card name for Trainers/Energy (which have no dex). A card
	 * matches when ANY selected id is one of its keys — its `nationalPokedexNumbers`
	 * (stringified) if it has them, else its `name`. Empty/undefined → no filter.
	 */
	ids?: string[];
	/**
	 * Drop cards carrying a national dex number. A real Trainer/Energy never has
	 * one, so this filters out Pokémon that the upstream data mislabeled as
	 * Trainer/Energy (they'd otherwise pass a `supertype: Trainer` filter). Set on
	 * the Trainer/Energy browse views only.
	 */
	excludeDexCards?: boolean;
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
	sort?: "default" | "dex" | "number" | "name" | "rarity" | "released";
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

/**
 * Build the in-memory search index from a flat card list (normalised names +
 * token arrays), stamping every card with its catalog `region`. Defaults to
 * `west` so existing callers/fixtures that don't pass a region behave exactly
 * as before.
 */
export function buildIndex(
	cards: CorpusCard[],
	region: Region = "west",
): CorpusIndex {
	// Single pass over the (large) card list builds all three structures at once.
	const nameNorm: string[] = [];
	const nameTokens: string[][] = [];
	const byId = new Map<string, CorpusCard>();
	const stamped: CorpusCard[] = [];
	for (const c of cards) {
		const card = { ...c, region };
		stamped.push(card);
		nameNorm.push(normalize(card.name));
		nameTokens.push(
			card.name.split(/[\s-]+/).flatMap((t) => {
				const n = normalize(t);
				return n ? [n] : [];
			}),
		);
		byId.set(card.id, card);
	}
	return { cards: stamped, byId, nameNorm, nameTokens };
}

/**
 * Resolve a card id across every currently-loaded region index. Card ids are
 * globally unique across the west/asia id universes, so the first index that
 * has it wins — check order doesn't matter. Returns `undefined` if the id is
 * in none of the loaded indices (e.g. its region hasn't been loaded yet).
 */
export function resolveCardAcrossRegions(
	cardId: string,
	indices: Partial<Record<Region, CorpusIndex>>,
): CorpusCard | undefined {
	for (const index of Object.values(indices)) {
		const hit = index?.byId.get(cardId);
		if (hit) return hit;
	}
	return undefined;
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
	// A card's language "face" is chosen by its region, not blindly by the active
	// display language -- there is no English face for a Japanese-lineage card
	// and no Japanese face for a Western card (see faceLanguageFor).
	const activeLang = toSupportedLanguage(i18n?.lang);
	const faceLang = faceLanguageFor(card, activeLang);
	// Only apply the i18n overlay when the active overlay's language actually IS
	// the resolved face language -- an overlay for a language that doesn't match
	// the card's region (e.g. a `ja` overlay over a west card) must never leak
	// its name onto that card. An overlay miss (or no overlay) keeps the base name.
	const name =
		i18n && i18n.lang === faceLang
			? (i18n.namesById?.get(card.id) ?? card.name)
			: card.name;
	// Image url is derived per resolved face language; en (or no imageBase)
	// returns the baked urls.
	const { imageUrl, imageUrlSmall } = cardImage(card, faceLang);
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
		region: card.region,
	};
}

interface Hit {
	card: CorpusCard;
	i: number;
	match: NameMatch | null;
}

/** The array-valued facet dimensions a `field:` op can feed. */
const ARRAY_DIMS = ["types", "rarities", "supertypes", "subtypes"] as const;

/**
 * Case-insensitive corpus vocabulary per array dimension: lowercased value →
 * the canonical value(s) that share it (usually one; e.g. "ex"/"EX" would both
 * map from "ex"). Lets a field op like `type:fire` resolve to the corpus's
 * exact "Fire" so passesFilters keeps matching case-sensitively.
 */
interface CorpusVocab {
	types: Map<string, string[]>;
	rarities: Map<string, string[]>;
	supertypes: Map<string, string[]>;
	subtypes: Map<string, string[]>;
}

// Immutable index → its vocab. Built lazily and only when a query actually
// carries `field:` array ops, so the common (no-field-op) path pays nothing.
const vocabCache = new WeakMap<CorpusIndex, CorpusVocab>();

function addVocab(map: Map<string, string[]>, value: string | undefined): void {
	if (!value) return;
	const key = value.toLowerCase();
	let arr = map.get(key);
	if (!arr) {
		arr = [];
		map.set(key, arr);
	}
	if (!arr.includes(value)) arr.push(value);
}

function getVocab(index: CorpusIndex): CorpusVocab {
	const cached = vocabCache.get(index);
	if (cached) return cached;
	const v: CorpusVocab = {
		types: new Map(),
		rarities: new Map(),
		supertypes: new Map(),
		subtypes: new Map(),
	};
	for (const c of index.cards) {
		for (const t of c.types ?? []) addVocab(v.types, t);
		addVocab(v.rarities, c.rarity);
		addVocab(v.supertypes, c.supertype);
		for (const s of c.subtypes ?? []) addVocab(v.subtypes, s);
	}
	vocabCache.set(index, v);
	return v;
}

/**
 * Merge `field:` op array filters into the dropdown-derived facets, resolving
 * each field value case-insensitively to the corpus's canonical value(s) and
 * unioning within each dimension (OR-within, matching the engine's semantics).
 * Fast-paths to `base` untouched when the query has no array field ops.
 */
function mergeEffectiveFilters(
	base: FilterClauses,
	fields: FieldFilters,
	index: CorpusIndex,
): FilterClauses {
	if (!ARRAY_DIMS.some((d) => fields[d]?.length)) return base;
	const vocab = getVocab(index);
	const out: FilterClauses = { ...base };
	for (const dim of ARRAY_DIMS) {
		const fieldVals = fields[dim];
		if (!fieldVals?.length) continue;
		const merged = [...(out[dim] ?? [])];
		for (const raw of fieldVals) {
			// Unknown value keeps its raw form → it simply matches no card.
			const canon = vocab[dim].get(raw.toLowerCase()) ?? [raw];
			for (const c of canon) if (!merged.includes(c)) merged.push(c);
		}
		out[dim] = merged;
	}
	return out;
}

export function queryCorpus(
	index: CorpusIndex,
	q: CorpusQuery,
	setsById: Map<string, PokemonSet>,
	i18n?: I18nOverlay | null,
): HoloCardData[] {
	// Parse the free-text grammar ONCE (not per card): OR/AND/NOT/quoted name
	// terms plus any global `field:` ops. Fields AND-merge into the effective
	// facets; every caller (client grid, server SSR, binder smart-rules) inherits
	// the grammar because they all route through queryCorpus.
	const parsed = parseSearchQuery(q.query ?? "");
	const hasName = parsed.name.arms.length > 0;
	const filters = mergeEffectiveFilters(q.filters ?? {}, parsed.fields, index);
	const effectiveSetId = q.setId ?? parsed.fields.setId ?? null;
	const yearMins = [q.yearMin, parsed.fields.yearMin].filter(
		(x): x is number => x != null,
	);
	const yearMaxs = [q.yearMax, parsed.fields.yearMax].filter(
		(x): x is number => x != null,
	);
	const effYearMin = yearMins.length ? Math.max(...yearMins) : null;
	const effYearMax = yearMaxs.length ? Math.min(...yearMaxs) : null;
	const mode = q.mode ?? "fuzzy";
	const hits: Hit[] = [];

	for (let i = 0; i < index.cards.length; i++) {
		const card = index.cards[i];
		if (effectiveSetId && card.setId !== effectiveSetId) continue;
		// Guard against upstream mislabels: a card with a national dex is a Pokémon,
		// so it can never be a real Trainer/Energy — drop it on those browse views.
		if (q.excludeDexCards && card.nationalPokedexNumbers?.length) continue;
		if (
			q.dexNumbers?.length &&
			!q.dexNumbers.some((d) => card.nationalPokedexNumbers?.includes(d))
		)
			continue;
		// Card "name" filter: match on the card's identity keys — its dex numbers
		// (Pokémon) or its name (Trainer/Energy). Mirrors deriveIds's keying.
		if (q.ids?.length) {
			const keys = card.nationalPokedexNumbers?.length
				? card.nationalPokedexNumbers.map(String)
				: card.name
					? [card.name]
					: [];
			if (!keys.some((k) => q.ids?.includes(k))) continue;
		}
		// Name-anchored views (Trainer/Energy per-name pages) group by slugified
		// name across sets — no dex exists for non-Pokémon cards. Slugify on the fly
		// (only when nameSlug is set) to avoid bloating the index for every query.
		// ponytail: two distinct names that slugify identically would merge onto one
		// page (near-zero in the real card set); split by exact name if it ever bites.
		if (q.nameSlug != null && slugify(card.name) !== q.nameSlug) continue;
		if (!passesFilters(card, filters)) continue;
		if (effYearMin != null || effYearMax != null) {
			const year = Number(setsById.get(card.setId)?.releaseDate?.slice(0, 4));
			if (effYearMin != null && (Number.isNaN(year) || year < effYearMin))
				continue;
			if (effYearMax != null && (Number.isNaN(year) || year > effYearMax))
				continue;
		}
		let match: NameMatch | null = null;
		if (hasName) {
			const r = matchNameExpr(
				parsed.name,
				index.nameNorm[i],
				index.nameTokens[i],
				mode,
			);
			if (!r.matched) continue;
			match = { tier: r.tier, distance: r.distance };
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
			else if (q.sort === "rarity")
				c = rarityRank(a.card.rarity) - rarityRank(b.card.rarity);
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
		if (q.dexNumbers?.length || q.relevance || q.chronological) {
			if (ra !== rb) return ra.localeCompare(rb);
		}
		return compareCardNumber(a.card.number, b.card.number);
	});

	return hits.map((h) => hydrateCard(h.card, setsById, i18n));
}
