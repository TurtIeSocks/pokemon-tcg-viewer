// src/store/userland/stats.ts
import { useMemo, useState } from "react";
import { setsById } from "../corpus/corpus-engine";
import { useStore } from "../index";
import { allLoadedSets } from "../sets-slice";
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
	/**
	 * Total cost basis in MINOR UNITS, summed across priced stacks; null when no
	 * priced stacks. Only safe to format/sum directly when `estValueCurrency` is
	 * non-null — priced stacks spanning >1 currency need FX (PR3b) before they can
	 * be added together, so the raw sum is currency-ambiguous in that case.
	 */
	estValue: number | null;
	/**
	 * The single ISO-4217 currency shared by every priced stack, or null when
	 * there are zero priced stacks OR priced stacks span more than one currency
	 * (mixed — can't sum without FX; render "—" instead of a wrong total).
	 */
	estValueCurrency: string | null;
	thisWeek: number;
	collectingSince: number | null;
}

/** Compute the headline collection stats reactively. */
export function useCollectionStats(): CollectionStats {
	const items = useUserland((s) => s.items);
	const ownedIndex = useOwnedIndex();
	const countBySet = useOwnedCountBySet();
	// Owned stats span every loaded region, not just west, so this merges
	// sets across all loaded regions rather than reading the bare west list.
	// allLoadedSets is memoized, so a plain subscription stays ref-stable.
	const sets = useStore(allLoadedSets);
	const [weekCutoff] = useState(() => Date.now() - WEEK_MS);

	return useMemo(() => {
		let owned = 0;
		let total = 0;
		if (sets.length > 0) {
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
		const currencies = new Set<string>();
		for (const it of Object.values(items)) {
			if (it.pricePaid !== null) {
				sum += it.pricePaid * it.quantity;
				anyPrice = true;
				currencies.add(it.currency);
			}
			if (it.acquiredAt >= weekCutoff) thisWeek++;
		}
		const estValueCurrency = currencies.size === 1 ? [...currencies][0] : null;

		return {
			cardsOwned: ownedIndex.size,
			setsTouched: countBySet.size,
			completionPct,
			estValue: anyPrice ? sum : null,
			estValueCurrency,
			thisWeek,
			collectingSince: earliestAcquired(items),
		};
	}, [items, ownedIndex, countBySet, sets, weekCutoff]);
}
