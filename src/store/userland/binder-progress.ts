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
		dexNumber: q.dexNumber ?? undefined,
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
 * Compute the full membership set for a binder:
 * 1. Union all cards matched by each rule.
 * 2. Add explicit includeCardIds.
 * 3. Remove explicit excludeCardIds.
 */
export function binderMembers(
	binder: Binder,
	index: CorpusIndex,
	setsMap: Map<string, PokemonSet>,
): Set<string> {
	const members = new Set<string>();

	for (const rule of binder.rules) {
		const cards = queryCorpus(index, toCorpusQuery(rule.query), setsMap);
		for (const card of cards) members.add(card.id);
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
 * Compute owned/total progress for a binder given the user's owned card id set.
 */
export function computeBinderProgress(
	binder: Binder,
	index: CorpusIndex,
	setsMap: Map<string, PokemonSet>,
	ownedCardIds: Set<string>,
): BinderProgress {
	const members = binderMembers(binder, index, setsMap);
	const total = members.size;
	let owned = 0;
	for (const id of members) {
		if (ownedCardIds.has(id)) owned++;
	}
	return { members, total, owned };
}
