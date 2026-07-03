# Pricing PR 3b-i — Valuation Engine + Stats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pure valuation core — an FX converter, a per-stack market-value function (printing→finish resolution + condition multipliers + cardmarket fallback), collection-level market value + unrealized P&L in the user's display currency, a persisted hide-value setting, and actually-wired price staleness revalidation. No new visible surfaces — those are PR 3b-ii, which renders what this computes.

**Architecture:** `src/lib/corpus/fx.ts` converts integer minor-unit amounts between currencies using the EUR-based FX table already carried in the price blob's `meta.fx`. `src/store/userland/valuation.ts` (pure) resolves a stack's structured printing to a tcgplayer finish, reads the per-card price entry, applies a condition multiplier, and returns the stack's NM market value in USD cents (canonical). `useCollectionStats` gains `marketValue`/`unrealizedPnL`/`valueCurrency` computed from the prices runtime + FX + the profile's `displayCurrency`. `Profile.hideValue` rides the persistence layer like `displayCurrency`. A reusable `useEnsurePrices()` hook loads + revalidates the blob (finally wiring `syncPrices`).

**Tech Stack:** TypeScript, React 19, Zustand, TanStack Start, Bun test.

**Spec:** `docs/superpowers/specs/2026-07-03-pricing-implementation-design.md` (§5 valuation engine, condition multipliers, FX, canonical USD).

## Global Constraints

- Money is **integer minor units**, scaled by each currency's ISO-4217 exponent (`exponentFor` from `src/lib/currencies.ts`). `null` = unknown (never `undefined`, never 0-as-unknown).
- **Canonical internal currency is USD cents** for market value; convert to the display currency only when producing a user-facing total. FX table is **EUR-based** (`FxTable = { base:"EUR", date, rates:Record<string,number> }`; `rates[X]` = X per 1 EUR; EUR itself has no key → rate 1).
- Condition multipliers (portfolio estimates only): **NM 1.0, LP 0.85, MP 0.70, HP 0.55, DMG 0.40**. Graded stacks value at **raw NM** (multiplier 1) until a graded price source exists.
- Finish fallback chain for tcgplayer market: **resolved-printing-finish → H → N**; if none present, **cardmarket trend (EUR) → USD**; else unpriced (null).
- `Profile.hideValue: boolean` is **additive** (no snapshot `schemaVersion` bump), default **false**, mirroring `displayCurrency`.
- Zustand: subscribe narrow in the consuming hook (S3). `interface` object shapes, `type` unions. Tabs.
- Tests must not hit the network (inject fetchers / pre-seed stores). Lint: `bunx biome check --write --config-path=. <files>` (NOT `bun run lint`).
- Do NOT `git add -A` — add only the files each task names. Commit after every task. Final task regenerates `routeTree.gen.ts` (gitignored — boot `vite dev` briefly) then runs `tsc -b` + full `bun test` + biome.

## File Structure

- `src/lib/corpus/fx.ts` — NEW. `convertMinorUnits(minor, from, to, fx)` — EUR-based, exponent-aware.
- `src/store/userland/valuation.ts` — NEW. `finishForPrinting`, `CONDITION_MULTIPLIER`/`conditionMultiplier`, `unitMarketValueUsdCents`, `stackValueUsdCents` (all pure).
- `src/store/userland/stats.ts` — MODIFIED. `CollectionStats` + `useCollectionStats` gain market value / P&L / value currency.
- `src/store/userland/types.ts`, `idb-repo.ts`, `supabase-repo.ts`, `supabase-row.ts`, `backup.ts` — MODIFIED. `Profile.hideValue` persistence.
- `supabase/migrations/<ts>_profile_hide_value.sql` — NEW.
- `src/store/corpus/prices-runtime.ts` — MODIFIED. Add `useEnsurePrices()`.
- `src/components/islands/card-prices.tsx` + its test — MODIFIED. Use `useEnsurePrices()`; stub fetchers in the test.

---

### Task 1: FX converter (`src/lib/corpus/fx.ts`)

**Files:**
- Create: `src/lib/corpus/fx.ts`
- Test: `src/lib/corpus/fx.test.ts`

**Interfaces:**
- Consumes: `exponentFor` (`src/lib/currencies.ts`); `FxTable` (`src/lib/corpus/price-types.ts`).
- Produces: `function convertMinorUnits(minor: number | null, from: string, to: string, fx: FxTable): number | null`

- [ ] **Step 1: Write the failing test**

Create `src/lib/corpus/fx.test.ts`:

```ts
import { expect, test } from "bun:test";
import type { FxTable } from "./price-types";
import { convertMinorUnits } from "./fx";

// EUR-based: 1 EUR = 1.09 USD = 184 JPY = 0.86 GBP.
const fx: FxTable = {
	base: "EUR",
	date: "2026-07-03",
	rates: { USD: 1.09, JPY: 184, GBP: 0.86 },
};

test("same currency passes through unchanged", () => {
	expect(convertMinorUnits(1234, "USD", "USD", fx)).toBe(1234);
});

test("null amount stays null", () => {
	expect(convertMinorUnits(null, "USD", "EUR", fx)).toBeNull();
});

test("converts USD→EUR via the EUR base", () => {
	// $10.90 → €10.00 : 1090 cents / 1.09 = 1000 cents.
	expect(convertMinorUnits(1090, "USD", "EUR", fx)).toBe(1000);
});

test("converts EUR→USD (base is EUR, rate 1)", () => {
	// €10.00 → $10.90.
	expect(convertMinorUnits(1000, "EUR", "USD", fx)).toBe(1090);
});

test("converts across exponents USD→JPY (2-dec → 0-dec)", () => {
	// $1.09 = €1.00 = ¥184. 109 USD cents → 184 yen (integer, 0-decimal).
	expect(convertMinorUnits(109, "USD", "JPY", fx)).toBe(184);
});

test("returns null when a rate is unknown", () => {
	expect(convertMinorUnits(1000, "USD", "XYZ", fx)).toBeNull();
	expect(convertMinorUnits(1000, "XYZ", "USD", fx)).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/corpus/fx.test.ts`
Expected: FAIL — `Cannot find module './fx'`

- [ ] **Step 3: Write the implementation**

Create `src/lib/corpus/fx.ts`:

```ts
import { exponentFor } from "@/lib/currencies";
import type { FxTable } from "./price-types";

/** X per 1 EUR from an EUR-based table; the base (EUR) is 1. null when unknown. */
function rateToEur(currency: string, fx: FxTable): number | null {
	if (currency === fx.base) return 1;
	const r = fx.rates[currency];
	return typeof r === "number" && r > 0 ? r : null;
}

/**
 * Convert an integer minor-unit amount from one currency to another using an
 * EUR-based reference table (the shape the price blob carries). Exponent-aware,
 * so USD cents → JPY yen drops the two decimals correctly. Returns null when
 * either currency's rate is unknown — the caller decides how to degrade (we
 * never guess a rate).
 */
export function convertMinorUnits(
	minor: number | null,
	from: string,
	to: string,
	fx: FxTable,
): number | null {
	if (minor == null) return null;
	if (from === to) return minor;
	const rFrom = rateToEur(from, fx);
	const rTo = rateToEur(to, fx);
	if (rFrom == null || rTo == null) return null;
	const major = minor / 10 ** exponentFor(from);
	const eur = major / rFrom;
	return Math.round(eur * rTo * 10 ** exponentFor(to));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/lib/corpus/fx.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Lint + commit**

```bash
bunx biome check --write --config-path=. src/lib/corpus/fx.ts src/lib/corpus/fx.test.ts
git add src/lib/corpus/fx.ts src/lib/corpus/fx.test.ts
git commit -m "feat(pricing): EUR-based minor-unit FX converter (exponent-aware)"
```

---

### Task 2: Valuation engine (`src/store/userland/valuation.ts`)

**Files:**
- Create: `src/store/userland/valuation.ts`
- Test: `src/store/userland/valuation.test.ts`

**Interfaces:**
- Consumes: `CardVariant` (`src/lib/card-variants.ts`); `convertMinorUnits` (Task 1); `CardPriceEntry`, `FinishCode`, `FxTable` (`src/lib/corpus/price-types.ts`); `CardCondition`, `Stack` (`./types`).
- Produces:
  - `function finishForPrinting(printing: CardVariant | null): FinishCode | null`
  - `const CONDITION_MULTIPLIER: Record<CardCondition, number>`
  - `function conditionMultiplier(stack: Pick<Stack, "condition" | "grading">): number`
  - `function unitMarketValueUsdCents(stack: Pick<Stack, "printing">, entry: CardPriceEntry | null, fx: FxTable | null): number | null`
  - `function stackValueUsdCents(stack: Pick<Stack, "printing" | "quantity" | "condition" | "grading">, entry: CardPriceEntry | null, fx: FxTable | null): number | null`

- [ ] **Step 1: Write the failing tests**

Create `src/store/userland/valuation.test.ts`:

```ts
import { expect, test } from "bun:test";
import type { CardVariant } from "@/lib/card-variants";
import type { CardPriceEntry, FxTable } from "@/lib/corpus/price-types";
import {
	conditionMultiplier,
	finishForPrinting,
	stackValueUsdCents,
	unitMarketValueUsdCents,
} from "./valuation";

const fx: FxTable = { base: "EUR", date: "x", rates: { USD: 1.09 } };
const printing = (over: Partial<CardVariant>): CardVariant => ({
	variantId: "v",
	type: "normal",
	subtype: null,
	size: null,
	stamp: null,
	...over,
});

test("finishForPrinting maps type/stamp to a tcgplayer finish", () => {
	expect(finishForPrinting(null)).toBeNull();
	expect(finishForPrinting(printing({ type: "reverse" }))).toBe("R");
	expect(finishForPrinting(printing({ type: "holo" }))).toBe("H");
	expect(finishForPrinting(printing({ type: "normal" }))).toBe("N");
	expect(finishForPrinting(printing({ type: "holo", stamp: ["1st-edition"] }))).toBe("1H");
	expect(finishForPrinting(printing({ type: "normal", stamp: ["1st-edition"] }))).toBe("1N");
});

test("conditionMultiplier: raw scale; graded values at raw NM (1)", () => {
	expect(conditionMultiplier({ condition: "NM", grading: null })).toBe(1);
	expect(conditionMultiplier({ condition: "LP", grading: null })).toBe(0.85);
	expect(conditionMultiplier({ condition: "DMG", grading: null })).toBe(0.4);
	expect(conditionMultiplier({ condition: null, grading: null })).toBe(1);
	// graded → 1 regardless of any condition
	expect(conditionMultiplier({ condition: "LP", grading: { company: "PSA", grade: 9, cert: null } })).toBe(1);
});

test("unitMarketValueUsdCents resolves the finish, falls back H→N", () => {
	const entry: CardPriceEntry = { tp: { N: [700, 400], H: [72034, 53499] } };
	// reverse printing not present → fall back to H, then N.
	expect(unitMarketValueUsdCents({ printing: printing({ type: "reverse" }) }, entry, fx)).toBe(72034);
	// holo printing present → H.
	expect(unitMarketValueUsdCents({ printing: printing({ type: "holo" }) }, entry, fx)).toBe(72034);
	// normal printing → N.
	expect(unitMarketValueUsdCents({ printing: printing({ type: "normal" }) }, entry, fx)).toBe(700);
});

test("unitMarketValueUsdCents falls back to cardmarket trend converted EUR→USD", () => {
	const entry: CardPriceEntry = { cm: [1000, null, null, null] }; // €10.00 trend
	expect(unitMarketValueUsdCents({ printing: null }, entry, fx)).toBe(1090); // → $10.90
	// no fx → can't convert cardmarket → null
	expect(unitMarketValueUsdCents({ printing: null }, entry, null)).toBeNull();
});

test("unitMarketValueUsdCents is null for an unpriced card", () => {
	expect(unitMarketValueUsdCents({ printing: null }, null, fx)).toBeNull();
	expect(unitMarketValueUsdCents({ printing: null }, {}, fx)).toBeNull();
});

test("stackValueUsdCents = unit × quantity × condition multiplier", () => {
	const entry: CardPriceEntry = { tp: { N: [1000, null] } }; // $10 unit
	// 3 copies, LP (0.85): 1000 × 3 × 0.85 = 2550
	expect(
		stackValueUsdCents(
			{ printing: printing({ type: "normal" }), quantity: 3, condition: "LP", grading: null },
			entry,
			fx,
		),
	).toBe(2550);
	// unpriced → null
	expect(
		stackValueUsdCents(
			{ printing: null, quantity: 1, condition: "NM", grading: null },
			null,
			fx,
		),
	).toBeNull();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/store/userland/valuation.test.ts`
Expected: FAIL — `Cannot find module './valuation'`

- [ ] **Step 3: Write the implementation**

Create `src/store/userland/valuation.ts`:

```ts
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
import type { CardCondition, Stack } from "./types";

/**
 * Best-effort tcgplayer finish for a stack's structured printing; null when
 * unknown (the caller's fallback chain then tries H→N). tcgplayer's finish axis
 * is coarse (N/H/R + 1st-edition), so fine TCGdex printings collapse here — a
 * miss just falls back, never throws.
 */
export function finishForPrinting(printing: CardVariant | null): FinishCode | null {
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

/** Finish fallback order: resolved printing finish, then Holofoil, then Normal. */
function finishOrder(printing: CardVariant | null): FinishCode[] {
	const order: FinishCode[] = [];
	const resolved = finishForPrinting(printing);
	if (resolved) order.push(resolved);
	for (const f of ["H", "N"] as const) if (!order.includes(f)) order.push(f);
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/store/userland/valuation.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Lint + commit**

```bash
bunx biome check --write --config-path=. src/store/userland/valuation.ts src/store/userland/valuation.test.ts
git add src/store/userland/valuation.ts src/store/userland/valuation.test.ts
git commit -m "feat(pricing): pure per-stack valuation (printing→finish, condition, cardmarket fallback)"
```

---

### Task 3: Market value + P&L in `useCollectionStats`

**Files:**
- Modify: `src/store/userland/stats.ts`
- Test: `src/store/userland/stats.test.ts` (extend)

**Interfaces:**
- Consumes: `usePricesRuntime` (`src/store/corpus/prices-runtime.ts`); `stackValueUsdCents` (Task 2); `convertMinorUnits` (Task 1); `useUserland` profile.
- Produces: `CollectionStats` gains
  - `marketValue: number | null` — total NM market value in `valueCurrency` minor units; null when prices/FX unavailable.
  - `costBasisConverted: number | null` — total cost basis converted to `valueCurrency`; null when FX unavailable.
  - `unrealizedPnL: number | null` — `marketValue − costBasisConverted`; null when either is null.
  - `valueCurrency: string` — the display currency these three are in (the profile's `displayCurrency`, default "USD").

- [ ] **Step 1: Write the failing tests**

Extend `src/store/userland/stats.test.ts` (read it first for its render/seed helpers — how it seeds `useUserland` items + a profile, and whether it renders the hook via a test renderer). Add a case that seeds the prices runtime + owned stacks and asserts the market/P&L numbers. Illustrative shape (match the file's actual harness):

```ts
import { usePricesRuntime } from "@/store/corpus/prices-runtime";
// ... within the existing describe/harness:

test("marketValue, costBasis, and P&L compute in the profile display currency", () => {
	// Seed prices: one card, tcgplayer Normal market $10.00 (1000 USD cents).
	usePricesRuntime.setState({
		byId: new Map([["base1-4", { tp: { N: [1000, null] } }]]),
		meta: {
			date: "2026-07-03",
			sources: { tp: "2026-07-03", cm: null },
			fx: { base: "EUR", date: "2026-07-03", rates: { USD: 1.09 } },
		},
		status: "ready",
	});
	// Seed a profile (displayCurrency USD) + one owned stack: 2× base1-4, NM,
	// paid $4.00 each (400 cents USD). (Use the file's userland-seed helper.)
	// Expect: marketValue = 1000 × 2 = 2000 (USD cents); costBasis = 400 × 2 = 800;
	// unrealizedPnL = 1200; valueCurrency = "USD".
	const stats = /* render/read useCollectionStats via the file's harness */;
	expect(stats.marketValue).toBe(2000);
	expect(stats.costBasisConverted).toBe(800);
	expect(stats.unrealizedPnL).toBe(1200);
	expect(stats.valueCurrency).toBe("USD");
});

test("marketValue is null when the prices blob is not loaded", () => {
	usePricesRuntime.setState({ byId: null, meta: null, status: "idle" });
	// ... seed a priced stack ...
	const stats = /* read hook */;
	expect(stats.marketValue).toBeNull();
	expect(stats.unrealizedPnL).toBeNull();
});
```

Add a `usePricesRuntime.setState({ byId: null, meta: null, status: "idle" })` reset in the test file's `afterEach` (or `resetPricesRuntimeForTests()` from prices-runtime) so cases don't leak the seeded blob.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/store/userland/stats.test.ts`
Expected: FAIL — new fields absent.

- [ ] **Step 3: Implement**

In `src/store/userland/stats.ts`:

3a. Imports (add):

```ts
import { convertMinorUnits } from "@/lib/corpus/fx";
import { usePricesRuntime } from "../corpus/prices-runtime";
import { stackValueUsdCents } from "./valuation";
```

3b. `CollectionStats` interface — add after `estValueCurrency`:

```ts
	/** Total NM market value in `valueCurrency` minor units; null when prices/FX unavailable. */
	marketValue: number | null;
	/** Total cost basis converted to `valueCurrency`; null when FX unavailable. */
	costBasisConverted: number | null;
	/** marketValue − costBasisConverted; null when either is null. */
	unrealizedPnL: number | null;
	/** The display currency of the three fields above (profile displayCurrency, default "USD"). */
	valueCurrency: string;
```

3c. In `useCollectionStats`, add subscriptions (narrow) before the `useMemo`:

```ts
	const priceById = usePricesRuntime((s) => s.byId);
	const fx = usePricesRuntime((s) => s.meta?.fx ?? null);
	const displayCurrency = useUserland((s) => s.profile?.displayCurrency ?? "USD");
```

3d. Inside the `useMemo`, after the existing cost-basis loop, compute the market fields (canonical USD → display currency):

```ts
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
					const c = convertMinorUnits(it.pricePaid * it.quantity, it.currency, "USD", fx);
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
			usd === null || !fx ? null : convertMinorUnits(usd, "USD", displayCurrency, fx);
		const marketValue = toDisplay(marketUsd);
		const costBasisConverted = toDisplay(costUsd);
		const unrealizedPnL =
			marketValue !== null && costBasisConverted !== null
				? marketValue - costBasisConverted
				: null;
```

3e. Add `marketValue, costBasisConverted, unrealizedPnL, valueCurrency: displayCurrency` to the returned object, and add `priceById, fx, displayCurrency` to the `useMemo` dependency array.

Note on the FX self-conversion: when `displayCurrency === "USD"`, `convertMinorUnits(usd, "USD", "USD", fx)` returns `usd` unchanged (same-currency passthrough), so the USD path needs `fx` present only because `toDisplay` guards on it — that's fine (fx is present whenever a blob is loaded). If `fx` lacks the display currency's rate, `toDisplay` returns null and the surface falls back to estValue.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/store/userland/stats.test.ts`
Expected: PASS.

- [ ] **Step 5: Guard the shared hook + commit**

`useCollectionStats` feeds the vault hero + profile (both untouched here — they ignore the new fields until PR 3b-ii). Confirm they still render:

Run: `bun test src/components/vault/ src/routes/`
Expected: PASS (new fields are additive; existing estValue rendering unchanged).

```bash
bunx biome check --write --config-path=. src/store/userland/stats.ts src/store/userland/stats.test.ts
git add src/store/userland/stats.ts src/store/userland/stats.test.ts
git commit -m "feat(pricing): collection market value + unrealized P&L in display currency"
```

---

### Task 4: `Profile.hideValue` persistence

**Files:**
- Modify: `src/store/userland/types.ts` (`Profile` + `ProfilePatch`)
- Modify: `src/store/userland/idb-repo.ts`, `supabase-repo.ts`, `supabase-row.ts`, `backup.ts`
- Create: `supabase/migrations/20260703100000_profile_hide_value.sql`
- Test: extend `src/store/userland/backup.test.ts` + `src/store/userland/idb-repo.test.ts`

**Interfaces:**
- Produces: `Profile.hideValue: boolean` (always present, default `false`); `ProfilePatch` accepts `hideValue`.

This mirrors `displayCurrency` EXACTLY (shipped in PR 3a) but as a **boolean default `false`**. Read each `displayCurrency` line and add a `hideValue` sibling. A required boolean field forces every `Profile`/`ProfileRow` literal to carry it — expect the same fixture fallout PR 3a's `displayCurrency` had (~6 test/fixture sites: `sync/cache-repo.ts`, `test-utils` profile helper, and the profile fixtures in `backup.test.ts`/`idb-repo.test.ts`/`supabase-row.test.ts`/`sync/*.test.ts`); add `hideValue: false` (or `hide_value: false` for `ProfileRow`) beside the existing `displayCurrency`/`display_currency` there. Do NOT bump `schemaVersion`.

- [ ] **Step 1: Write the failing tests**

Append to `src/store/userland/backup.test.ts` (mirror the `displayCurrency` backfill test):

```ts
test("upgrade backfills hideValue to false when absent", () => {
	const raw = {
		schemaVersion: 6,
		exportedAt: 1,
		collection: [],
		binders: [],
		profile: {
			id: "me",
			displayName: "X",
			bio: null,
			avatarPreset: "a",
			favoriteSetId: null,
			displayLanguage: "en",
			displayCurrency: "USD",
			createdAt: 1,
			updatedAt: 1,
			deletedAt: null,
		},
	};
	const up = upgrade(raw as never);
	expect(up.profile?.hideValue).toBe(false);
});
```

Append to `src/store/userland/idb-repo.test.ts` (mirror the `displayCurrency` save/patch test):

```ts
test("saveProfile persists hideValue and defaults it to false", async () => {
	const repo = /* the file's repo-construction helper */;
	await repo.profile.save({ displayName: "X", hideValue: true });
	expect((await repo.profile.get())?.hideValue).toBe(true);
	await repo.profile.save({ displayName: "Y" });
	expect((await repo.profile.get())?.hideValue).toBe(false);
});
```

(Match the actual helper names in each file — read a nearby `displayCurrency` test and mirror it.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/store/userland/backup.test.ts src/store/userland/idb-repo.test.ts`
Expected: FAIL — `hideValue` not on `Profile` / not persisted.

- [ ] **Step 3: Implement across the layer** (mirror `displayCurrency`; `grep -n displayCurrency` each file):

3a. `types.ts` `Profile`: `hideValue: boolean; // hide all monetary surfaces; always present (default false)`. `ProfilePatch` `Pick`: add `"hideValue"`.

3b. `idb-repo.ts`: new-profile branch default `hideValue: patch.hideValue ?? false`.

3c. `supabase-repo.ts`: existing-branch `hideValue: patch.hideValue ?? existingProfile.hideValue`; new-branch `hideValue: patch.hideValue ?? false`.

3d. `supabase-row.ts`: `ProfileRow` add `hide_value: boolean`; `profileToRow` add `hide_value: profile.hideValue`; `rowToProfile` add `hideValue: typeof row.hide_value === "boolean" ? row.hide_value : false`.

3e. `backup.ts`: `hideValue: typeof raw.hideValue === "boolean" ? raw.hideValue : false`.

3f. Create `supabase/migrations/20260703100000_profile_hide_value.sql`:

```sql
-- PR3b — valuation: per-user hide-all-monetary-surfaces toggle.
-- Additive boolean on profiles; defaults false so existing rows read back false.
alter table public.profiles
  add column hide_value boolean not null default false;
```

3g. Fix the required-field fixture fallout (the ~6 sites — same as PR 3a's displayCurrency): add `hideValue: false` / `hide_value: false` beside the existing `displayCurrency`/`display_currency` in each. `bunx tsc -b` will name them.

- [ ] **Step 4: Run tests + sync suite** (handle the local supabase column like PR 3a did)

Run: `bun test src/store/userland/backup.test.ts src/store/userland/idb-repo.test.ts src/store/userland/supabase-repo.test.ts src/store/userland/sync/`
Expected: PASS. If the sync tests fail on a missing column, apply it locally:
`docker exec supabase_db_cloud-vault psql -U postgres -d postgres -c "alter table public.profiles add column if not exists hide_value boolean not null default false;"`
then re-run. If the local supabase stack isn't up (command can't connect), report DONE_WITH_CONCERNS naming the tests you couldn't run — don't fake a pass. Prod is 100% IDB so the field works regardless.

- [ ] **Step 5: Lint + commit**

```bash
bunx biome check --write --config-path=. src/store/userland/types.ts src/store/userland/idb-repo.ts src/store/userland/supabase-repo.ts src/store/userland/supabase-row.ts src/store/userland/backup.ts
# add each fixture file you had to fix, by explicit path:
git add src/store/userland/types.ts src/store/userland/idb-repo.ts src/store/userland/supabase-repo.ts src/store/userland/supabase-row.ts src/store/userland/backup.ts supabase/migrations/20260703100000_profile_hide_value.sql src/store/userland/backup.test.ts src/store/userland/idb-repo.test.ts
# ... plus the fixture sites (git add <path> each) ...
git commit -m "feat(pricing): Profile.hideValue setting across persistence layer"
```

---

### Task 5: Wire price staleness revalidation (`useEnsurePrices`)

**Files:**
- Modify: `src/store/corpus/prices-runtime.ts` (add `useEnsurePrices`)
- Modify: `src/components/islands/card-prices.tsx` (use it)
- Test: `src/store/corpus/prices-runtime.test.ts` + `src/components/islands/card-prices.test.tsx`

**Interfaces:**
- Produces: `function useEnsurePrices(): void` — a mount effect that calls `loadPrices()` then `syncPrices()` (load from cache instantly, then revalidate the blob date and re-download if stale). Idempotent + deduped by the runtime's own guards.

Rationale: PR 2 shipped `syncPrices` but left it unwired — a client caching yesterday's blob never pulled today's. This adds the one call site. Making it a shared hook (mirroring `useEnsureCorpus`) lets PR 3b-ii's vault surfaces load prices too, without opening a card modal.

- [ ] **Step 1: Write the failing test**

Add to `src/store/corpus/prices-runtime.test.ts` a test that `useEnsurePrices` triggers both a load and a sync. Since it's a hook, drive it with a minimal render (the repo's runtime tests are non-React; if so, instead test the composition directly by asserting that after mounting the hook the injected `fetchVersion` was called — use the existing `setPricesFetchersForTests` seam). Illustrative:

```ts
import { render } from "@testing-library/react";
import { setPricesFetchersForTests, useEnsurePrices } from "./prices-runtime";

test("useEnsurePrices loads then revalidates via syncPrices", async () => {
	let versionCalls = 0;
	setPricesFetchersForTests({
		fetchVersion: async () => {
			versionCalls++;
			return { date: "2026-07-03", count: 1, builtAt: "x" };
		},
		fetchBlob: async () => gzBlob(BLOB), // reuse the file's gzBlob helper + BLOB fixture
	});
	function Probe() {
		useEnsurePrices();
		return null;
	}
	render(<Probe />);
	await Promise.resolve(); // let the mount effect's async chain settle
	expect(versionCalls).toBeGreaterThanOrEqual(1); // syncPrices probed the version
});
```

(If `prices-runtime.test.ts` has no React deps, add the `@testing-library/react` import used elsewhere in the repo, or place this test in a `.test.tsx`. Match the repo's convention.)

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/store/corpus/prices-runtime.test.ts`
Expected: FAIL — `useEnsurePrices` not exported.

- [ ] **Step 3: Implement**

3a. In `src/store/corpus/prices-runtime.ts`, add near the other hooks (needs a React import — `import { useEffect } from "react";` at the top):

```ts
/**
 * Mount hook: load the price blob (IDB-first, instant) then revalidate its date
 * against the server and re-download if stale. Idempotent + deduped by
 * loadPrices/downloadPrices' own guards, so multiple mounts are cheap. This is
 * the sole wiring of syncPrices — without it a cached client never sees a newer
 * daily blob until IDB is cleared.
 */
export function useEnsurePrices(): void {
	useEffect(() => {
		loadPrices().then(() => syncPrices());
	}, []);
}
```

3b. In `src/components/islands/card-prices.tsx`, replace the inline `useEffect(() => { loadPrices(); }, [])` with `useEnsurePrices();` (import it from `@/store/corpus/prices-runtime`; drop the now-unused `loadPrices` import + the `useEffect` import if orphaned).

3c. Update `src/components/islands/card-prices.test.tsx`: the tests seed `usePricesRuntime` with `status:"ready"` and did NOT stub fetchers. Now that mount also calls `syncPrices()` (which calls the real `fetchVersion` → network), the tests MUST stub the fetchers via `setPricesFetchersForTests` in their setup so nothing hits the wire. Add a `beforeEach`/setup that stubs `fetchVersion` (return a date equal to the seeded meta's date so `syncPrices` finds it fresh and no-ops) + `fetchBlob` (return a gz of the seeded blob, never actually used on the fresh path). Keep every existing assertion.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/store/corpus/prices-runtime.test.ts src/components/islands/card-prices.test.tsx`
Expected: PASS (existing + new; no network).

- [ ] **Step 5: Lint + commit**

```bash
bunx biome check --write --config-path=. src/store/corpus/prices-runtime.ts src/components/islands/card-prices.tsx src/store/corpus/prices-runtime.test.ts src/components/islands/card-prices.test.tsx
git add src/store/corpus/prices-runtime.ts src/components/islands/card-prices.tsx src/store/corpus/prices-runtime.test.ts src/components/islands/card-prices.test.tsx
git commit -m "feat(pricing): wire price staleness revalidation via useEnsurePrices"
```

---

### Task 6: Final verification gate

**Files:** none (verification only)

- [ ] **Step 1: Regenerate the route tree, then run all gates**

```bash
nohup bunx vite dev --port 6301 >/tmp/pr3bi-routegen.log 2>&1 & VP=$!; sleep 8; kill $VP 2>/dev/null
```

Then run in parallel (background the slow ones):
- `bunx tsc -b`
- `bun test`
- `bunx biome check --config-path=. src/lib/corpus/fx.ts src/store/userland/valuation.ts src/store/userland/stats.ts src/store/userland/types.ts src/store/userland/idb-repo.ts src/store/userland/supabase-repo.ts src/store/userland/supabase-row.ts src/store/userland/backup.ts src/store/corpus/prices-runtime.ts src/components/islands/card-prices.tsx`

Expected: tsc 0 errors; full suite green (baseline 1509 + new tests); biome clean. After the run, `rm -f src/routeTree.gen.ts` (gitignored artifact).

- [ ] **Step 2: Fix anything red, re-run, commit fixes.** No known-red advance.

- [ ] **Step 3: Confirm no lockfile/manifest drift**

Run: `git status --short`
Expected: clean (no `bun.lock`/`package.json` change — no new deps).

## Self-Review Notes (plan author)

- **Spec coverage (this PR):** FX converter, printing→finish, condition multipliers, cardmarket fallback, canonical-USD market value → §5 (T1, T2). Collection market value + P&L in display currency → §5/§7 headline (T3). Hide-value persistence → §7 toggle (data half; T4). `syncPrices` wiring → PR 2 follow-up (T5). Deferred to **PR 3b-ii** (surfaces): rendering market value / P&L / hide-toggle control on vault-summary + profile + stack-row, binder market value, and the money-visibility gate.
- **estValue interplay:** this PR ADDS `marketValue`/`costBasisConverted`/`unrealizedPnL`/`valueCurrency` and leaves PR 3a's `estValue`/`estValueCurrency` untouched, so the existing vault/profile rendering is unchanged. PR 3b-ii swaps the surfaces to the new fields (and `costBasisConverted` — FX-summed — finally lets a mixed-currency collection show a real total instead of "—").
- **No new deps. No schemaVersion bump.** Supabase migration dormant in prod (100% IDB); local column only for sync tests.
- **Type consistency:** `stackValueUsdCents`/`unitMarketValueUsdCents`/`finishForPrinting`/`conditionMultiplier`/`convertMinorUnits`/`useEnsurePrices` names used identically across tasks.
