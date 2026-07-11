// Shared price-pipeline types. Used by scripts/build-corpus.ts (crosswalk
// harvest), scripts/build-prices.ts (daily join), and — from PR 2 on — the
// client prices runtime. Lives in src/lib/corpus/ so build and client cannot
// drift (same pattern as tcgdex-card-fields.ts).

/** cardId → [cardmarket idProduct | null, tcgplayer productId | null]. */
export type PriceIdEntry = [cm: number | null, tp: number | null];
export type PriceIdsMap = Record<string, PriceIdEntry>;

/** N Normal · H Holofoil · R Reverse Holofoil · 1H/1N 1st Edition Holofoil/Normal. */
export type FinishCode = "N" | "H" | "R" | "1H" | "1N";

/**
 * Canonical fallback order for picking ONE representative finish when a card's
 * printing is unknown (every quick-add / scan / CSV / legacy stack has
 * `printing: null`). Normal ('N') leads because Holofoil often prices ~10x the
 * Normal a collector actually owns, so preferring H first inflated those stacks.
 * SINGLE SOURCE OF TRUTH: both `valuation.ts` (portfolio value) and
 * `price-history.ts` (the sparkline) must use this, or a card's history reads a
 * different finish than its portfolio value — they drifted (H-first vs N-first)
 * and disagreed ~10x until this was unified.
 */
export const MARKET_FINISH_ORDER: FinishCode[] = ["N", "H", "1N", "1H"];

/** tcgcsv subTypeName → finish code. Unknown names are logged + skipped at join. */
export const TP_SUBTYPE_TO_CODE: Partial<Record<string, FinishCode>> = {
	Normal: "N",
	Holofoil: "H",
	"Reverse Holofoil": "R",
	"1st Edition Holofoil": "1H",
	"1st Edition Normal": "1N",
	// "Unlimited" is tcgplayer's name for the non-1st-edition printing of
	// vintage products; physically identical to the plain finish.
	"Unlimited Holofoil": "H",
	"Unlimited Normal": "N",
};

export type TpPricePair = [marketCents: number | null, lowCents: number | null];
export type CmTuple = [
	trend: number | null,
	avg1: number | null,
	avg7: number | null,
	avg30: number | null,
];

export interface CardPriceEntry {
	/** tcgplayer per-finish [market, low], USD cents. */
	tp?: Partial<Record<FinishCode, TpPricePair>>;
	/** cardmarket [trend, avg1, avg7, avg30], EUR cents. */
	cm?: CmTuple;
	/**
	 * tcgplayer product id, for a DIRECT product-page link
	 * (`tcgplayer.com/product/{tpId}`, no slug needed) instead of a search URL.
	 * Present only after a blob rebuild carries it; consumers fall back to the
	 * search URL when absent, so links upgrade gracefully. Cardmarket has no
	 * equivalent (its URLs are slug-based, not id-addressable).
	 */
	tpId?: number;
}

/** ECB reference table (frankfurter.dev shape), EUR-based. */
export interface FxTable {
	base: "EUR";
	date: string;
	rates: Record<string, number>;
}

export interface PricesBlob {
	v: 1;
	/** Build date, YYYY-MM-DD UTC. Clients compare against today for staleness. */
	date: string;
	fx: FxTable;
	/** Upstream data dates (null = source unavailable this build). */
	sources: { tp: string | null; cm: string | null };
	cards: Record<string, CardPriceEntry>;
}

/** Served at /corpus-prices/version for cheap staleness polls. */
export interface PricesMeta {
	date: string;
	count: number;
	builtAt: string;
}

/** Float major units → integer cents; null/undefined stay null (unknown). */
export function toCents(value: number | null | undefined): number | null {
	if (value == null) return null;
	return Math.round(value * 100);
}
