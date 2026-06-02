// src/store/userland/selectors.ts
import { useEffect, useMemo } from "react";
import type { HoloCardData } from "../../components/holo-card";
import type { PokemonSet } from "../../server/card-mappers";
import { type CorpusIndex, hydrateCard } from "../corpus/corpus-engine";
import { useCorpusRuntime } from "../corpus/corpus-runtime";
import { useStore } from "../index";
import {
	buildCardRows,
	type CardRow,
	type SortDir,
	type SortKey,
	sortCardRows,
} from "./card-rows";
import { computeGoalProgress, type GoalProgress } from "./goal-progress";
import type { CollectionItem, Goal } from "./types";
import { loadUserland, useUserland } from "./userland-store";

// --- Pure helpers (unit-tested) ---
export function groupByCardId(
	items: CollectionItem[],
): Map<string, CollectionItem[]> {
	const map = new Map<string, CollectionItem[]>();
	for (const item of items) {
		const arr = map.get(item.cardId);
		if (arr) arr.push(item);
		else map.set(item.cardId, [item]);
	}
	return map;
}

export function joinOwnedViews(
	items: CollectionItem[],
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
export function useEnsureUserland(): void {
	useEffect(() => {
		void loadUserland();
	}, []);
}

export function useOwnedIndex(): Map<string, CollectionItem[]> {
	useEnsureUserland();
	const items = useUserland((s) => s.items);
	return useMemo(() => groupByCardId(Object.values(items)), [items]);
}

export function useIsOwned(cardId: string): boolean {
	return useOwnedIndex().has(cardId);
}

export function useOwnedCount(cardId: string): number {
	return useOwnedIndex().get(cardId)?.length ?? 0;
}

/** Distinct owned cards joined with the corpus. [] until corpus + sets load. */
export function useOwnedCardViews(): HoloCardData[] {
	useEnsureUserland();
	const items = useUserland((s) => s.items);
	const index = useCorpusRuntime((s) => s.index);
	const sets = useStore((s) => s.sets);
	return useMemo(() => {
		if (!index || !sets) return [];
		const setsById = new Map(sets.map((s) => [s.id, s]));
		return joinOwnedViews(Object.values(items), index, setsById);
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
		const distinct = new Set(Object.values(items).map((i) => i.cardId));
		return tallyOwnedBySet(distinct, index);
	}, [items, index]);
}

/** All owned cards grouped by cardId, sorted by key+dir. [] until corpus + sets load. */
export function useOwnedCardRows(key: SortKey, dir: SortDir): CardRow[] {
	useEnsureUserland();
	const items = useUserland((s) => s.items);
	const index = useCorpusRuntime((s) => s.index);
	const sets = useStore((s) => s.sets);
	return useMemo(() => {
		if (!index || !sets) return [];
		const setsById = new Map(sets.map((s) => [s.id, s]));
		return sortCardRows(
			buildCardRows(Object.values(items), index, setsById),
			key,
			dir,
		);
	}, [items, index, sets, key, dir]);
}

export function useGoalProgress(goal: Goal): GoalProgress | null {
	useEnsureUserland();
	const items = useUserland((s) => s.items);
	const index = useCorpusRuntime((s) => s.index);
	const sets = useStore((s) => s.sets);
	return useMemo(() => {
		if (!index || !sets) return null;
		const owned = new Set(Object.values(items).map((i) => i.cardId));
		return computeGoalProgress(
			goal,
			owned,
			index,
			new Map(sets.map((s) => [s.id, s])),
		);
	}, [goal, items, index, sets]);
}
