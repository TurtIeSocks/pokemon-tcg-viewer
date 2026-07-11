// Pure valuation engine: resolve a stack's printing to a tcgplayer finish, read
// the per-card price entry, apply a condition multiplier, and return the stack's
// NM market value in USD cents (canonical). No store/React dependency — the
// stats hook (and PR 3b-ii surfaces) feed it the already-selected price entry.
import type { CardVariant } from "@/lib/card-variants";
import { convertMinorUnits } from "@/lib/corpus/fx";
import type {
	CardPriceEntry,
	FinishCode,
	FxTable,
} from "@/lib/corpus/price-types";
import { MARKET_FINISH_ORDER } from "@/lib/corpus/price-types";
import type { CardCondition, Stack } from "./types";

/**
 * Best-effort tcgplayer finish for a stack's structured printing; null when
 * unknown (the caller then walks the shared MARKET_FINISH_ORDER fallback,
 * N→H→1N→1H→R). tcgplayer's finish axis is coarse (N/H/R + 1st-edition), so
 * fine TCGdex printings collapse here — a miss just falls back, never throws.
 */
export function finishForPrinting(
	printing: CardVariant | null,
): FinishCode | null {
	if (!printing) return null;
	const type = (printing.type ?? "").toLowerCase();
	const firstEd =
		type.includes("firstedition") ||
		!!printing.stamp?.some((s) => s.toLowerCase().includes("1st"));
	if (type.startsWith("reverse")) return "R";
	if (firstEd) return type.includes("holo") ? "1H" : "1N";
	if (type.includes("holo")) return "H";
	if (type.includes("normal")) return "N";
	return null;
}

/** Portfolio value multiplier by raw condition (NM baseline). */
export const CONDITION_MULTIPLIER: Record<CardCondition, number> = {
	NM: 1,
	LP: 0.85,
	MP: 0.7,
	HP: 0.55,
	DMG: 0.4,
};

/**
 * Multiplier for a stack's portfolio value. Graded stacks value at raw NM (1)
 * until a graded price source exists (PriceCharting, licensing-gated).
 */
export function conditionMultiplier(
	stack: Pick<Stack, "condition" | "grading">,
): number {
	if (stack.grading) return 1;
	return stack.condition ? CONDITION_MULTIPLIER[stack.condition] : 1;
}

/**
 * Finish fallback order: the resolved printing finish first, then a conservative
 * base-before-premium fallback for unresolved printings — Normal ('N') before
 * Holofoil ('H'), 1st-edition Normal ('1N') before 1st-edition Holofoil ('1H'),
 * and Reverse Holofoil ('R') dead last as a pure last resort. Every quick-add /
 * scan / CSV / legacy stack has `printing: null`, so `finishForPrinting` returns
 * null and this fallback decides the value. Holofoil often prices ~10x the
 * Normal a collector actually owns, so preferring H first inflated those stacks
 * ~10x — hence Normal leads. The list still falls through to whatever finish
 * DOES have a price, so a holo-only vintage card (no Normal entry) still
 * resolves to H, and a reverse-only card (no N/H/1N/1H entry) resolves to R
 * instead of skipping tcgplayer pricing.
 */
function finishOrder(printing: CardVariant | null): FinishCode[] {
	const order: FinishCode[] = [];
	const resolved = finishForPrinting(printing);
	if (resolved) order.push(resolved);
	// Shared canonical fallback (Normal-first) — see MARKET_FINISH_ORDER. The
	// sparkline in price-history.ts uses the same constant so they can't drift.
	for (const f of MARKET_FINISH_ORDER) if (!order.includes(f)) order.push(f);
	return order;
}

/**
 * Per-UNIT NM market value of a stack in USD cents, or null when unpriced.
 * Prefers tcgplayer (USD) via the finish fallback chain; else cardmarket trend
 * (EUR) converted to USD (needs `fx`). Condition/quantity are applied by
 * `stackValueUsdCents`, not here — this is the clean NM unit price.
 */
export function unitMarketValueUsdCents(
	stack: Pick<Stack, "printing">,
	entry: CardPriceEntry | null,
	fx: FxTable | null,
): number | null {
	if (!entry) return null;
	if (entry.tp) {
		for (const code of finishOrder(stack.printing)) {
			const pair = entry.tp[code];
			if (pair && pair[0] !== null) return pair[0];
		}
	}
	if (entry.cm && entry.cm[0] !== null && fx) {
		return convertMinorUnits(entry.cm[0], "EUR", "USD", fx);
	}
	return null;
}

/**
 * Portfolio value of a stack in USD cents: unit NM market × quantity ×
 * condition multiplier. null when the card is unpriced.
 */
export function stackValueUsdCents(
	stack: Pick<Stack, "printing" | "quantity" | "condition" | "grading">,
	entry: CardPriceEntry | null,
	fx: FxTable | null,
): number | null {
	const unit = unitMarketValueUsdCents(stack, entry, fx);
	if (unit == null) return null;
	return Math.round(unit * stack.quantity * conditionMultiplier(stack));
}
