// src/store/userland/stats.ts
import { useMemo, useState } from "react";
import { setsById } from "../corpus/corpus-engine";
import { useStore } from "../index";
import { useOwnedCountBySet, useOwnedIndex } from "./selectors";
import type { Stack } from "./types";
import { useUserland } from "./userland-store";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Earliest stack acquisition time across the collection; null when empty. Pure. */
export function earliestAcquired(items: Record<string, Stack>): number | null {
	let min: number | null = null;
	for (const it of Object.values(items)) {
		if (min === null || it.acquiredAt < min) min = it.acquiredAt;
	}
	return min;
}

/** All headline collection stats in one read; reused by the vault hero + profile page. */
export interface CollectionStats {
	cardsOwned: number;
	setsTouched: number;
	completionPct: number;
	estValue: number | null;
	thisWeek: number;
	collectingSince: number | null;
}

/** Compute the headline collection stats reactively. */
export function useCollectionStats(): CollectionStats {
	const items = useUserland((s) => s.items);
	const ownedIndex = useOwnedIndex();
	const countBySet = useOwnedCountBySet();
	const sets = useStore((s) => s.sets);
	const [weekCutoff] = useState(() => Date.now() - WEEK_MS);

	return useMemo(() => {
		let owned = 0;
		let total = 0;
		if (sets) {
			const byId = setsById(sets);
			for (const [setId, count] of countBySet) {
				const set = byId.get(setId);
				if (!set || set.total <= 0) continue;
				owned += count;
				total += set.total;
			}
		}
		const completionPct =
			total === 0 ? 0 : Math.min(100, Math.round((owned / total) * 100));

		let sum = 0;
		let anyPrice = false;
		let thisWeek = 0;
		for (const it of Object.values(items)) {
			if (it.pricePaid !== null) {
				sum += it.pricePaid * it.quantity;
				anyPrice = true;
			}
			if (it.acquiredAt >= weekCutoff) thisWeek++;
		}

		return {
			cardsOwned: ownedIndex.size,
			setsTouched: countBySet.size,
			completionPct,
			estValue: anyPrice ? sum : null,
			thisWeek,
			collectingSince: earliestAcquired(items),
		};
	}, [items, ownedIndex, countBySet, sets, weekCutoff]);
}
