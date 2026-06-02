// src/store/userland/selectors.ts
import { useEffect, useMemo } from "react";
import type { HoloCardData } from "../../components/holo-card";
import type { PokemonSet } from "../../server/card-mappers";
import { type CorpusIndex, hydrateCard } from "../corpus/corpus-engine";
import { useCorpusRuntime } from "../corpus/corpus-runtime";
import { useStore } from "../index";
import type { CollectionItem } from "./types";
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
