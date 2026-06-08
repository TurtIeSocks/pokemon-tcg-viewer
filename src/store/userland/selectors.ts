// src/store/userland/selectors.ts
import { useEffect, useMemo } from "react";
import type { HoloCardData } from "../../components/holo-card";
import type { PokemonSet } from "../../server/card-mappers";
import {
	type CorpusIndex,
	hydrateCard,
	setsById,
} from "../corpus/corpus-engine";
import { useCorpusRuntime } from "../corpus/corpus-runtime";
import { useStore } from "../index";
import {
	type BinderProgress,
	binderMembers,
	computeBinderProgress,
} from "./binder-progress";
import {
	buildCardRows,
	type CardRow,
	type SortDir,
	type SortKey,
	sortCardRows,
} from "./card-rows";
import { groupByCardId, sumQuantity } from "./group";
import type { Stack } from "./types";
import { loadUserland, useUserland } from "./userland-store";

// --- Pure helpers (unit-tested) ---

/** Distinct owned cardIds from the items map. */
export function ownedCardIdSet(items: Record<string, Stack>): Set<string> {
	return new Set(Object.values(items).map((i) => i.cardId));
}

/**
 * Reactive set of distinct owned cardIds — a fresh Set built from the memoized
 * owned-index keys on each render (cheap; consumers depend on contents, not identity).
 */
export function useOwnedCardIdSet(): Set<string> {
	return new Set(useOwnedIndex().keys());
}

// groupByCardId + sumQuantity moved to ./group to break the card-rows↔selectors
// import cycle; re-exported here so existing `from "./selectors"` importers keep working.
export { groupByCardId, sumQuantity };

/**
 * Join owned stacks with corpus card data; returns one HoloCardData per distinct cardId.
 * Cards not found in the corpus index are silently skipped.
 */
export function joinOwnedViews(
	items: Stack[],
	index: CorpusIndex,
	setsById: Map<string, PokemonSet>,
): HoloCardData[] {
	const seen = new Set<string>();
	const out: HoloCardData[] = [];
	for (const item of items) {
		if (seen.has(item.cardId)) continue;
		seen.add(item.cardId);
		const card = index.byId.get(item.cardId);
		if (card) out.push(hydrateCard(card, setsById));
	}
	return out;
}

// --- Hooks ---
/** Idempotently hydrate the userland cache. Safe to call from many components. */
function useEnsureUserland(): void {
	useEffect(() => {
		void loadUserland();
	}, []);
}

/**
 * Shared store reads for the corpus-join hooks: triggers userland hydration and
 * returns the corpus index + sets. Consumers read `items`/`binder` themselves and
 * apply their own `useMemo` join on top.
 */
function useCorpusJoinInputs() {
	useEnsureUserland();
	const index = useCorpusRuntime((s) => s.index);
	const sets = useStore((s) => s.sets);
	return { index, sets };
}

/** Hook: returns all stacks grouped by cardId; triggers hydration as a side-effect. */
export function useOwnedIndex(): Map<string, Stack[]> {
	useEnsureUserland();
	const items = useUserland((s) => s.items);
	return useMemo(() => groupByCardId(Object.values(items)), [items]);
}

/** Hook: true if the user owns at least one stack of the given card. */
export function useIsOwned(cardId: string): boolean {
	return useOwnedIndex().has(cardId);
}

/** Hook: total cards owned for the given card across its stacks (0 if none). */
export function useOwnedCount(cardId: string): number {
	const stacks = useOwnedIndex().get(cardId);
	return stacks ? sumQuantity(stacks) : 0;
}

/** Distinct owned cards joined with the corpus. [] until corpus + sets load. */
export function useOwnedCardViews(): HoloCardData[] {
	const items = useUserland((s) => s.items);
	const { index, sets } = useCorpusJoinInputs();
	return useMemo(() => {
		if (!index || !sets) return [];
		return joinOwnedViews(Object.values(items), index, setsById(sets));
	}, [items, index, sets]);
}

/** Tally distinct owned cardIds into per-set counts via the corpus byId map. */
export function tallyOwnedBySet(
	cardIds: Iterable<string>,
	index: CorpusIndex,
): Map<string, number> {
	const counts = new Map<string, number>();
	for (const id of cardIds) {
		const setId = index.byId.get(id)?.setId;
		if (!setId) continue;
		counts.set(setId, (counts.get(setId) ?? 0) + 1);
	}
	return counts;
}

/** Owned distinct-card count per setId. Empty until the corpus loads. */
export function useOwnedCountBySet(): Map<string, number> {
	useEnsureUserland();
	const items = useUserland((s) => s.items);
	const index = useCorpusRuntime((s) => s.index);
	return useMemo(() => {
		if (!index) return new Map<string, number>();
		return tallyOwnedBySet(ownedCardIdSet(items), index);
	}, [items, index]);
}

/** All owned cards grouped by cardId, sorted by key+dir. [] until corpus + sets load. */
export function useOwnedCardRows(key: SortKey, dir: SortDir): CardRow[] {
	const items = useUserland((s) => s.items);
	const { index, sets } = useCorpusJoinInputs();
	return useMemo(() => {
		if (!index || !sets) return [];
		return sortCardRows(
			buildCardRows(Object.values(items), index, setsById(sets)),
			key,
			dir,
		);
	}, [items, index, sets, key, dir]);
}

/** Hook: compute progress for a binder by id; null until corpus + sets + userland load. */
export function useBinderProgress(binderId: string): BinderProgress | null {
	const binder = useUserland((s) => s.binders[binderId] ?? null);
	const items = useUserland((s) => s.items);
	const { index, sets } = useCorpusJoinInputs();
	return useMemo(() => {
		if (!binder || !index || !sets) return null;
		return computeBinderProgress(
			binder,
			index,
			setsById(sets),
			ownedCardIdSet(items),
		);
	}, [binder, items, index, sets]);
}

/** Hook: compute the member card-id set for a binder by id; null until corpus + sets load. */
export function useBinderMembers(binderId: string): Set<string> | null {
	const binder = useUserland((s) => s.binders[binderId] ?? null);
	const { index, sets } = useCorpusJoinInputs();
	return useMemo(() => {
		if (!binder || !index || !sets) return null;
		return binderMembers(binder, index, setsById(sets));
	}, [binder, index, sets]);
}
