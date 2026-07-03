// src/store/userland/stats.ts
import { useMemo, useState } from "react";
import { convertMinorUnits } from "@/lib/corpus/fx";
import { setsById } from "../corpus/corpus-engine";
import { usePricesRuntime } from "../corpus/prices-runtime";
import { useStore } from "../index";
import { allLoadedSets } from "../sets-slice";
import { useOwnedCountBySet, useOwnedIndex } from "./selectors";
import type { Stack } from "./types";
import { useUserland } from "./userland-store";
import { stackValueUsdCents } from "./valuation";

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
	/** Total NM market value in `valueCurrency` minor units; null when prices/FX unavailable. */
	marketValue: number | null;
	/** Total cost basis converted to `valueCurrency`; null when FX unavailable. */
	costBasisConverted: number | null;
	/** marketValue − costBasisConverted; null when either is null. */
	unrealizedPnL: number | null;
	/** The display currency of the three fields above (profile displayCurrency, default "USD"). */
	valueCurrency: string;
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
	const priceById = usePricesRuntime((s) => s.byId);
	const fx = usePricesRuntime((s) => s.meta?.fx ?? null);
	const displayCurrency = useUserland(
		(s) => s.profile?.displayCurrency ?? "USD",
	);

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

		// Market value + P&L. Canonical math in USD cents (valuation.ts), then a
		// single conversion to the display currency. Null when prices aren't loaded
		// or FX can't reach the display currency — PR 3b-ii surfaces fall back to the
		// cost-basis estValue in that case.
		let marketUsd: number | null = null;
		let costUsd: number | null = null;
		if (priceById) {
			let mAcc = 0;
			let mAny = false;
			let cAcc = 0;
			let cAny = false;
			for (const it of Object.values(items)) {
				const v = stackValueUsdCents(it, priceById.get(it.cardId) ?? null, fx);
				if (v !== null) {
					mAcc += v;
					mAny = true;
				}
				if (it.pricePaid !== null && fx) {
					const c = convertMinorUnits(
						it.pricePaid * it.quantity,
						it.currency,
						"USD",
						fx,
					);
					if (c !== null) {
						cAcc += c;
						cAny = true;
					}
				}
			}
			marketUsd = mAny ? mAcc : null;
			costUsd = cAny ? cAcc : null;
		}
		const toDisplay = (usd: number | null) =>
			usd === null || !fx
				? null
				: convertMinorUnits(usd, "USD", displayCurrency, fx);
		const marketValue = toDisplay(marketUsd);
		const costBasisConverted = toDisplay(costUsd);
		const unrealizedPnL =
			marketValue !== null && costBasisConverted !== null
				? marketValue - costBasisConverted
				: null;

		return {
			cardsOwned: ownedIndex.size,
			setsTouched: countBySet.size,
			completionPct,
			estValue: anyPrice ? sum : null,
			estValueCurrency,
			thisWeek,
			collectingSince: earliestAcquired(items),
			marketValue,
			costBasisConverted,
			unrealizedPnL,
			valueCurrency: displayCurrency,
		};
	}, [
		items,
		ownedIndex,
		countBySet,
		sets,
		weekCutoff,
		priceById,
		fx,
		displayCurrency,
	]);
}
