import type { CorpusCard } from "../store/corpus/corpus-types";

/** Normalize a display string to a URL-safe slug: lowercase, ASCII, hyphenated. */
export function slugify(input: string): string {
	return input
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "") // strip diacritics
		.toLowerCase()
		.replace(/['']/g, "") // drop apostrophes so "rocket's" -> "rockets"
		.replace(/[^a-z0-9]+/g, "-") // any run of non-alphanumerics -> single hyphen
		.replace(/^-+|-+$/g, ""); // trim leading/trailing hyphens
}

/** Title-case a hyphenated slug for display ("mr-mime" → "Mr Mime"). */
export function titleCaseSlug(slug: string): string {
	return slug
		.split("-")
		.map((s) => s.charAt(0).toUpperCase() + s.slice(1))
		.join(" ");
}

/** Minimal set shape needed for slugging (subset of api.ts PokemonSet). */
export interface SluggableSet {
	id: string;
	name: string;
	series: string;
	/** TCGdex serie id (see PokemonSet.seriesId). Optional; used to slug a
	 * non-sluggable (Japanese) series consistently across its sets. */
	seriesId?: string;
}

export interface SlugIndex {
	/** series slug -> canonical series name */
	seriesBySlug: Map<string, string>;
	/** set slug (within series) -> set id */
	setIdBySlug: Map<string, string>;
	/** card slug (within set) -> card id */
	cardIdBySlug: Map<string, string>;
	/** reverse: set id -> { seriesSlug, setSlug } */
	setSlugById: Map<string, { seriesSlug: string; setSlug: string }>;
	/** reverse: card id -> card slug */
	cardSlugById: Map<string, string>;
}

/**
 * A slug for a name that may not be sluggable at all. Latin names slugify
 * normally; a fully non-Latin name (e.g. a Japanese set/series) slugifies to ""
 * — fall back to the id so the URL stays stable + unique instead of collapsing
 * to an empty segment. Western names never hit the fallback, so their slugs are
 * byte-identical to before.
 */
function slugOrId(name: string, id: string): string {
	return slugify(name) || slugify(id);
}

/**
 * Slug for a series. A sluggable (Latin) name wins, so Western series are
 * byte-identical. A non-sluggable (Japanese) name falls back to the TCGdex
 * `serie.id` — the ONLY key that's consistent across a serie's sets: their set-id
 * prefixes vary within one serie (serie "SM" holds SM1, SMP2, smD), so keying off
 * the set-id prefix splits one serie into several same-named nav nodes. When no
 * serie.id is supplied (older fixtures), fall back to the set-id letter run.
 */
function serieSlug(
	seriesName: string,
	seriesId: string | undefined,
	memberSetId: string,
): string {
	const named = slugify(seriesName);
	if (named) return named;
	if (seriesId) {
		const byId = slugify(seriesId);
		if (byId) return byId;
	}
	const code = memberSetId.match(/^[A-Za-z]+/)?.[0] ?? memberSetId;
	return slugify(code) || slugify(memberSetId);
}

/** Append the number to a card slug so two same-named cards stay distinct. */
function cardSlugFor(card: CorpusCard): string {
	const parts = [slugify(card.name), slugify(card.number)].filter(Boolean);
	// A non-Latin (Japanese) card name yields no parts — fall back to the id so
	// the slug is never empty. Latin cards are unaffected.
	return parts.join("-") || slugify(card.id);
}

/**
 * Build a bidirectional slug index from the sets list and the card corpus.
 * Series slug = slugify(series). Set slug = slugify(set name), made unique
 * within its series by appending the set id on collision. Card slug =
 * name + number, made unique within its set by appending the card id on
 * collision. Deterministic: independent of input order (sorted by id).
 */
export function buildSlugIndex(
	sets: SluggableSet[],
	cards: CorpusCard[],
): SlugIndex {
	const idx: SlugIndex = {
		seriesBySlug: new Map(),
		setIdBySlug: new Map(),
		cardIdBySlug: new Map(),
		setSlugById: new Map(),
		cardSlugById: new Map(),
	};

	// Series + sets (sorted by id for deterministic collision suffixes).
	const setsSorted = sets.toSorted((a, b) => a.id.localeCompare(b.id));
	for (const set of setsSorted) {
		const seriesSlug = serieSlug(set.series, set.seriesId, set.id);
		idx.seriesBySlug.set(seriesSlug, set.series);

		let setSlug = slugOrId(set.name, set.id);
		const key = (s: string) => `${seriesSlug}/${s}`;
		if (idx.setIdBySlug.has(key(setSlug))) setSlug = `${setSlug}-${set.id}`;
		idx.setIdBySlug.set(key(setSlug), set.id);
		idx.setSlugById.set(set.id, { seriesSlug, setSlug });
	}

	// Cards (sorted by id for deterministic collision suffixes).
	const cardsSorted = cards.toSorted((a, b) => a.id.localeCompare(b.id));
	for (const card of cardsSorted) {
		const loc = idx.setSlugById.get(card.setId);
		if (!loc) continue; // card whose set isn't in the sets list — skip
		let cardSlug = cardSlugFor(card);
		const key = (s: string) => `${loc.seriesSlug}/${loc.setSlug}/${s}`;
		if (idx.cardIdBySlug.has(key(cardSlug)))
			cardSlug = `${cardSlug}-${card.id}`;
		idx.cardIdBySlug.set(key(cardSlug), card.id);
		idx.cardSlugById.set(card.id, cardSlug);
	}

	return idx;
}

/** Resolve a set id from its series + set slug pair; undefined if unknown. */
export function resolveSet(
	idx: SlugIndex,
	seriesSlug: string,
	setSlug: string,
): string | undefined {
	return idx.setIdBySlug.get(`${seriesSlug}/${setSlug}`);
}

/** Resolve a card id from its series/set/card slug triple; undefined if unknown. */
export function resolveCard(
	idx: SlugIndex,
	seriesSlug: string,
	setSlug: string,
	cardSlug: string,
): string | undefined {
	return idx.cardIdBySlug.get(`${seriesSlug}/${setSlug}/${cardSlug}`);
}

/** Resolve the canonical series name from its slug; undefined if unknown. */
export function resolveSeries(
	idx: SlugIndex,
	seriesSlug: string,
): string | undefined {
	return idx.seriesBySlug.get(seriesSlug);
}

/** URL path for a set (`/series/set`); undefined if the set isn't in the index. */
export function setPath(idx: SlugIndex, setId: string): string | undefined {
	const loc = idx.setSlugById.get(setId);
	return loc ? `/${loc.seriesSlug}/${loc.setSlug}` : undefined;
}

/** URL path for a card (`/series/set/card`); undefined if unknown. */
export function cardPath(idx: SlugIndex, cardId: string): string | undefined {
	const cardSlug = idx.cardSlugById.get(cardId);
	if (!cardSlug) return undefined;
	// cardId is "<setId>-<number>"; derive the set from the reverse set map.
	const setId = cardId.slice(0, cardId.lastIndexOf("-"));
	const base = setPath(idx, setId);
	return base ? `${base}/${cardSlug}` : undefined;
}
