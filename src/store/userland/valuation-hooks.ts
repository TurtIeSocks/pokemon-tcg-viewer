import { convertMinorUnits } from "@/lib/corpus/fx";
import { useCardPriceEntry, usePricesRuntime } from "../corpus/prices-runtime";
import { useBinderMembers, useOwnedIndex } from "./selectors";
import type { Stack } from "./types";
import { useUserland } from "./userland-store";
import { stackValueUsdCents } from "./valuation";

/** True when the collector has hidden all monetary surfaces (Profile.hideValue). */
export function useHideValue(): boolean {
	return useUserland((s) => s.profile?.hideValue ?? false);
}

/** A single stack's market value + unrealized P&L, in the profile display currency. */
export interface StackMarket {
	/** Current market value of the stack (quantity × condition-adjusted unit price), in the display currency's minor units. Null when unpriced / FX unavailable. */
	marketValue: number | null;
	/** marketValue − (pricePaid × quantity, converted to the display currency). Null when either side is unavailable. */
	pnl: number | null;
	/** The profile's display currency (ISO 4217), defaulting "USD". */
	currency: string;
}

/**
 * A single stack's market value + unrealized P&L in the profile display
 * currency. S3: subscribes only this card's price entry + the fx table. Null
 * when the card is unpriced or FX can't reach the display currency.
 */
export function useStackMarketValue(stack: Stack): StackMarket {
	const entry = useCardPriceEntry(stack.cardId);
	const fx = usePricesRuntime((s) => s.meta?.fx ?? null);
	const currency = useUserland((s) => s.profile?.displayCurrency ?? "USD");

	const usd = stackValueUsdCents(stack, entry, fx);
	const marketValue =
		usd != null && fx ? convertMinorUnits(usd, "USD", currency, fx) : null;
	const costDisplay =
		stack.pricePaid != null && fx
			? convertMinorUnits(
					stack.pricePaid * stack.quantity,
					stack.currency,
					currency,
					fx,
				)
			: null;
	const pnl =
		marketValue != null && costDisplay != null
			? marketValue - costDisplay
			: null;

	return { marketValue, pnl, currency };
}

/** A binder's total market value, in the profile display currency. */
export interface BinderValue {
	/** Summed market value across the binder's owned member stacks, in the display currency's minor units. Null when membership/prices/FX aren't ready, or nothing owned is priced. */
	value: number | null;
	/** The profile's display currency (ISO 4217), defaulting "USD". */
	currency: string;
}

/**
 * Total market value of the cards a collector owns within a binder, in the
 * display currency. Sums every owned stack (across the binder's member cards)
 * through the pure valuation, converts once. Null when prices/FX unavailable.
 */
export function useBinderValue(binderId: string): BinderValue {
	const members = useBinderMembers(binderId);
	const owned = useOwnedIndex();
	const byId = usePricesRuntime((s) => s.byId);
	const fx = usePricesRuntime((s) => s.meta?.fx ?? null);
	const currency = useUserland((s) => s.profile?.displayCurrency ?? "USD");

	if (!members || !byId || !fx) return { value: null, currency };

	let usd = 0;
	let any = false;
	for (const cardId of members) {
		const stacks = owned.get(cardId);
		if (!stacks) continue;
		const entry = byId.get(cardId) ?? null;
		for (const st of stacks) {
			const v = stackValueUsdCents(st, entry, fx);
			if (v != null) {
				usd += v;
				any = true;
			}
		}
	}
	const value = any ? convertMinorUnits(usd, "USD", currency, fx) : null;
	return { value, currency };
}
