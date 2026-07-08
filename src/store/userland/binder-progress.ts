// src/store/userland/binder-progress.ts
import type { PokemonSet } from "../../server/card-mappers";
import {
	type CorpusIndex,
	type CorpusQuery,
	queryCorpus,
} from "../corpus/corpus-engine";
import type { Binder, SerializedQuery } from "./types";

/**
 * Map a SerializedQuery (stored form) to a CorpusQuery (engine form).
 * null fields become undefined (the engine treats undefined as "no filter").
 */
export function toCorpusQuery(q: SerializedQuery): CorpusQuery {
	return {
		query: q.text ?? undefined,
		setId: q.setId ?? undefined,
		// A rule stores a single dex; the engine takes a species array (OR-matched).
		dexNumbers: q.dexNumber != null ? [q.dexNumber] : undefined,
		filters: {
			types: q.types,
			rarities: q.rarities,
			supertypes: q.supertypes,
			subtypes: q.subtypes,
		},
		yearMin: q.yearMin ?? undefined,
		yearMax: q.yearMax ?? undefined,
		// Legacy rules predate this field; missing key (undefined) → "fuzzy".
		mode: q.mode ?? "fuzzy",
		relevance: false,
	};
}

/**
 * One region's corpus + its own set list, paired so a rule matches against the
 * right sets. Card ids are globally unique across regions, so unioning rule
 * matches over every loaded region is safe (a west-set rule only hits the west
 * corpus, an asia-set rule only asia, a name/dex rule hits both — owning the
 * card in EITHER region counts toward the goal).
 */
export interface RegionCorpus {
	index: CorpusIndex;
	setsMap: Map<string, PokemonSet>;
}

/**
 * Compute the full membership set for a binder, ACROSS every loaded region:
 * 1. Union all cards matched by each rule, evaluated against each region.
 * 2. Add explicit includeCardIds.
 * 3. Remove explicit excludeCardIds.
 */
export function binderMembers(
	binder: Binder,
	regions: RegionCorpus[],
): Set<string> {
	const members = new Set<string>();

	for (const rule of binder.rules) {
		const q = toCorpusQuery(rule.query);
		for (const { index, setsMap } of regions) {
			for (const card of queryCorpus(index, q, setsMap)) members.add(card.id);
		}
	}

	for (const id of binder.includeCardIds) members.add(id);
	for (const id of binder.excludeCardIds) members.delete(id);

	return members;
}

export interface BinderProgress {
	/** All card ids that belong to this binder (after rules + include/exclude). */
	members: Set<string>;
	/** Total distinct cards in the binder. */
	total: number;
	/** How many of those cards the user owns. */
	owned: number;
}

/**
 * Compute owned/total progress for a binder given the user's owned card id set,
 * across every loaded region (see {@link binderMembers}).
 */
export function computeBinderProgress(
	binder: Binder,
	regions: RegionCorpus[],
	ownedCardIds: Set<string>,
): BinderProgress {
	const members = binderMembers(binder, regions);
	const total = members.size;
	let owned = 0;
	for (const id of members) {
		if (ownedCardIds.has(id)) owned++;
	}
	return { members, total, owned };
}
