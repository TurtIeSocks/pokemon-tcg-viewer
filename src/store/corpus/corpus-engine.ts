import type { HoloCardData } from "../../components/holo-card";
import type { PokemonSet } from "../../server/card-mappers";
import type { FilterClauses } from "../../utils/build-filter-clauses";
import type { CorpusCard } from "./corpus-types";
import { matchName, type NameMatch, normalize } from "./fuzzy";
import { compareCardNumber } from "./natural-compare";

export interface CorpusQuery {
	/** Free-text name search. Empty/undefined → no name filter. */
	query?: string;
	setId?: string | null;
	dexNumber?: number | null;
	filters?: FilterClauses;
	/** True for global name search (relevance order); false for set/dex (natural order). */
	relevance: boolean;
}

/** In-memory corpus + parallel precomputed name indices. */
export interface CorpusIndex {
	cards: CorpusCard[];
	nameNorm: string[];
	nameTokens: string[][];
}

export function buildIndex(cards: CorpusCard[]): CorpusIndex {
	const nameNorm = cards.map((c) => normalize(c.name));
	const nameTokens = cards.map((c) =>
		c.name
			.split(/[\s-]+/)
			.map(normalize)
			.filter(Boolean),
	);
	return { cards, nameNorm, nameTokens };
}

function intersects(a: string[] | undefined, sel: string[]): boolean {
	return !!a && a.some((v) => sel.includes(v));
}

function passesFilters(card: CorpusCard, f: FilterClauses): boolean {
	if (f.types?.length && !intersects(card.types, f.types)) return false;
	if (f.rarity?.length && !(card.rarity && f.rarity.includes(card.rarity)))
		return false;
	if (
		f.supertype?.length &&
		!(card.supertype && f.supertype.includes(card.supertype))
	)
		return false;
	if (f.subtypes?.length && !intersects(card.subtypes, f.subtypes))
		return false;
	return true;
}

function hydrate(
	card: CorpusCard,
	setsById: Map<string, PokemonSet>,
): HoloCardData {
	const set = setsById.get(card.setId);
	return {
		id: card.id,
		imageUrl: card.imageUrl,
		imageUrlSmall: card.imageUrlSmall,
		name: card.name,
		rarity: card.rarity,
		subtypes: card.subtypes,
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
		if (!passesFilters(card, filters)) continue;
		let match: NameMatch | null = null;
		if (hasName) {
			match = matchName(queryNorm, index.nameNorm[i], index.nameTokens[i]);
			if (!match) continue;
		}
		hits.push({ card, i, match });
	}

	const relAt = (id: string) => setsById.get(id)?.releaseDate ?? "";

	hits.sort((a, b) => {
		if (q.relevance && a.match && b.match) {
			if (a.match.tier !== b.match.tier) return a.match.tier - b.match.tier;
			if (a.match.tier === 3 && a.match.distance !== b.match.distance)
				return a.match.distance - b.match.distance;
			if (a.card.name.length !== b.card.name.length)
				return a.card.name.length - b.card.name.length;
		}
		const ra = relAt(a.card.setId);
		const rb = relAt(b.card.setId);
		if (q.dexNumber != null || q.relevance) {
			if (ra !== rb) return ra.localeCompare(rb);
		}
		return compareCardNumber(a.card.number, b.card.number);
	});

	return hits.map((h) => hydrate(h.card, setsById));
}
