# Pricing PR 3b-ii — Valuation Surfaces + Hide Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render everything the PR 3b-i engine computes — market value + unrealized P&L on the vault hero, profile, per stack row, and per binder — plus a hide-value toggle (a profile Switch and a vault quick-toggle) that respects the user's privacy across every money surface. This makes the whole valuation feature visible and completes the pricing epic (bar the PR 4 history charts).

**Architecture:** A shared `useHideValue()` hook reads `Profile.hideValue`; a `<ValueStats>` component owns the three money stats (market value, cost basis, P&L) used by both the vault hero and the profile, so the display logic lives in one tested place. `stack-row` reads a single card's price entry (S3) to show its market value + delta. A new `useBinderValue` selector sums a binder's owned-stack market values through the PR 3b-i valuation + FX. The `<Stat>` primitive gains a `"down"` tone (red) for negative P&L, and `money.ts` gains a signed formatter. The vault calls `useEnsurePrices()` so prices load without opening a card.

**Tech Stack:** TypeScript, React 19, Zustand, TanStack Form + shadcn Switch, lucide icons, Tailwind v4 (Liquid Glass tokens), Bun test.

**Spec:** `docs/superpowers/specs/2026-07-03-pricing-implementation-design.md` (§7 UI surfaces, hide-value toggle).

## Global Constraints

- Money is integer minor units in `valueCurrency`; format via `formatPrice`/`formatSignedPrice` (`src/store/userland/money.ts`). Values from `useCollectionStats`: `marketValue`/`costBasisConverted`/`unrealizedPnL` (all `number | null` in `valueCurrency` minor units) + `valueCurrency` (string). `null` = unavailable → render "—" (or hidden), never a wrong zero.
- **Hide-value gate:** when `Profile.hideValue` is true, EVERY money surface shows a masked placeholder (`"•••"`), not the number. Default false (visible).
- **P&L color:** positive → `--success` (emerald, `tone="up"`); negative → `--danger` (red, `tone="down"`); render with a sign (`+$12.34` / `-$5.00`).
- **Cost basis:** prefer `costBasisConverted` (FX-summed, works for mixed currencies); when null (FX unavailable), fall back to PR 3a's `estValue`/`estValueCurrency` (single-currency or "—").
- **Market value / P&L:** null when prices or FX unavailable → render "—" (a collection with no loaded blob shows "—", never $0).
- Zustand: subscribe narrow in the consuming component (S3). `stack-row` subscribes its own card's entry via `useCardPriceEntry(cardId)`. `interface` object shapes, `type` unions. Tabs.
- Tests must not hit the network: pre-seed `useCorpusRuntime` for grids (project rule); seed `usePricesRuntime.setState(...)` + `useUserland` for money; reset both in `afterEach`.
- Lint: `bunx biome check --write --config-path=. <files>` (NOT `bun run lint`). Do NOT `git add -A`. Commit after every task. Final task regenerates `routeTree.gen.ts` (boot `vite dev` briefly) then runs `tsc -b` + full `bun test` + biome.

## File Structure

- `src/store/userland/money.ts` — MODIFIED. Add `formatSignedPrice`.
- `src/components/ui/stat.tsx` — MODIFIED. `tone?: "up" | "down"`.
- `src/store/userland/valuation-hooks.ts` — NEW. `useHideValue`, `useStackMarketValue`, `useBinderValue` (React hooks wrapping the pure PR 3b-i valuation + prices runtime).
- `src/components/vault/value-stats.tsx` — NEW. `<ValueStats>` — the three money stats (market / cost / P&L), gated.
- `src/components/vault/vault-summary.tsx` — MODIFIED. Use `<ValueStats>`, call `useEnsurePrices()`, add the quick-toggle.
- `src/routes/profile.tsx` — MODIFIED. Use `<ValueStats>`.
- `src/components/collection/stack-row.tsx` — MODIFIED. Per-stack market value + delta, gated.
- `src/components/binders/binder-detail.tsx` — MODIFIED. Binder market-value line, gated.
- `src/components/profile/profile-form-dialog.tsx` — MODIFIED. Hide-value Switch.
- Tests alongside each; plus the PR 3b-i coverage backfill (Task 6).

---

### Task 1: Shared primitives — `useHideValue`, `formatSignedPrice`, `<Stat tone="down">`

**Files:**
- Create: `src/store/userland/valuation-hooks.ts` (this task adds only `useHideValue`)
- Modify: `src/store/userland/money.ts` (add `formatSignedPrice`)
- Modify: `src/components/ui/stat.tsx` (tone `"down"`)
- Test: `src/store/userland/money.test.ts` (extend), `src/store/userland/valuation-hooks.test.tsx` (create), `src/components/ui/stat.test.tsx` (create or extend)

**Interfaces:**
- Produces:
  - `function useHideValue(): boolean` — `useUserland((s) => s.profile?.hideValue ?? false)`.
  - `function formatSignedPrice(minor: number | null, currency: string): string` — `null → ""`; `≥0 → "+" + formatPrice`; `<0 → "-" + formatPrice(abs)`.
  - `<Stat tone="up" | "down">` — down → `text-[var(--danger)]`.

- [ ] **Step 1: Write the failing tests**

Extend `src/store/userland/money.test.ts`:

```ts
import { formatSignedPrice } from "./money";

test("formatSignedPrice prefixes sign and formats absolute value", () => {
	expect(formatSignedPrice(1234, "USD")).toBe("+$12.34");
	expect(formatSignedPrice(-500, "USD")).toBe("-$5.00");
	expect(formatSignedPrice(0, "USD")).toBe("+$0.00");
	expect(formatSignedPrice(-350, "JPY")).toBe("-¥350");
	expect(formatSignedPrice(null, "USD")).toBe("");
});
```

Create `src/store/userland/valuation-hooks.test.tsx`:

```tsx
import { afterEach, expect, test } from "bun:test";
import { renderHook } from "@testing-library/react";
import { setupUserlandTest } from "../../test-utils";
import { useUserland } from "./userland-store";
import { useHideValue } from "./valuation-hooks";

afterEach(async () => {
	await setupUserlandTest(); // resets userland between cases
});

test("useHideValue reflects the profile flag, defaulting false", async () => {
	await setupUserlandTest();
	expect(renderHook(() => useHideValue()).result.current).toBe(false);
	useUserland.setState({
		profile: { ...useUserland.getState().profile, hideValue: true } as never,
	});
	expect(renderHook(() => useHideValue()).result.current).toBe(true);
});
```

(Read `test-utils` for the actual profile-seed helper — if there's a `makeProfile`, seed a full profile object rather than spreading a possibly-null one. Match the file's conventions.)

Create/extend `src/components/ui/stat.test.tsx`:

```tsx
import { expect, test } from "bun:test";
import { render } from "@testing-library/react";
import { Stat } from "./stat";

test("Stat down tone uses the danger color", () => {
	const { getByText } = render(<Stat value="-$5.00" label="p&l" tone="down" />);
	expect(getByText("-$5.00").className).toContain("var(--danger)");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/store/userland/money.test.ts src/store/userland/valuation-hooks.test.tsx src/components/ui/stat.test.tsx`
Expected: FAIL — new exports/tone absent.

- [ ] **Step 3: Implement**

3a. `src/store/userland/money.ts` — add after `formatPrice`:

```ts
/**
 * Format signed minor units for a delta (P&L): "+$12.34" / "-$5.00". null → "".
 * Zero renders as "+" (a break-even is not a loss). Uses the currency exponent
 * via formatPrice on the absolute value.
 */
export function formatSignedPrice(
	minor: number | null,
	currency: string,
): string {
	if (minor == null) return "";
	const sign = minor < 0 ? "-" : "+";
	return `${sign}${formatPrice(Math.abs(minor), currency)}`;
}
```

3b. `src/store/userland/valuation-hooks.ts` (new; more hooks added in later tasks):

```ts
import { useUserland } from "./userland-store";

/** True when the collector has hidden all monetary surfaces (Profile.hideValue). */
export function useHideValue(): boolean {
	return useUserland((s) => s.profile?.hideValue ?? false);
}
```

3c. `src/components/ui/stat.tsx` — widen `tone`:

```tsx
interface StatProps {
	value: string;
	label: string;
	tone?: "up" | "down";
}

export function Stat({ value, label, tone }: StatProps) {
	return (
		<div>
			<div
				className={cn(
					"font-mono text-2xl font-medium tabular-nums",
					tone === "up"
						? "text-[var(--success)]"
						: tone === "down"
							? "text-[var(--danger)]"
							: "text-[var(--ink)]",
				)}
			>
				{value}
			</div>
			<div className="mt-0.5 text-[11px] uppercase tracking-wide text-[var(--faint)]">
				{label}
			</div>
		</div>
	);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/store/userland/money.test.ts src/store/userland/valuation-hooks.test.tsx src/components/ui/stat.test.tsx`
Expected: PASS.

- [ ] **Step 5: Lint + commit**

```bash
bunx biome check --write --config-path=. src/store/userland/money.ts src/store/userland/valuation-hooks.ts src/components/ui/stat.tsx src/store/userland/money.test.ts src/store/userland/valuation-hooks.test.tsx src/components/ui/stat.test.tsx
git add src/store/userland/money.ts src/store/userland/valuation-hooks.ts src/components/ui/stat.tsx src/store/userland/money.test.ts src/store/userland/valuation-hooks.test.tsx src/components/ui/stat.test.tsx
git commit -m "feat(pricing): hide-value hook, signed-price formatter, Stat down tone"
```

---

### Task 2: `<ValueStats>` on the vault hero + profile

**Files:**
- Create: `src/components/vault/value-stats.tsx`
- Test: `src/components/vault/value-stats.test.tsx`
- Modify: `src/components/vault/vault-summary.tsx`, `src/routes/profile.tsx`

**Interfaces:**
- Consumes: `useCollectionStats` (marketValue/costBasisConverted/unrealizedPnL/valueCurrency/estValue/estValueCurrency); `useHideValue`, `formatPrice`, `formatSignedPrice`, `<Stat>`.
- Produces: `<ValueStats />` — renders three `<Stat>`s: **Market value**, **Cost basis**, **P&L** (tone up/down), each masked (`"•••"`) when `hideValue`. Vault + profile both drop in `<ValueStats />` in place of their `est. value` block. Vault calls `useEnsurePrices()`.

**Display rules (one place):**
- Masked (`hideValue`) → every value is `"•••"` (P&L gets no tone when masked).
- **Market value:** `marketValue != null` → `formatPrice(marketValue, valueCurrency)`; else `"—"`.
- **Cost basis:** `costBasisConverted != null` → `formatPrice(costBasisConverted, valueCurrency)`; else if `estValue != null && estValueCurrency != null` → `formatPrice(estValue, estValueCurrency)`; else `"—"` (with the mixed-currency `title` hint when `estValue != null && estValueCurrency == null`).
- **P&L:** `unrealizedPnL != null` → `formatSignedPrice(unrealizedPnL, valueCurrency)` with `tone` `unrealizedPnL >= 0 ? "up" : "down"`; else omit the P&L stat entirely (no cost/market to compare).

- [ ] **Step 1: Write the failing test**

Create `src/components/vault/value-stats.test.tsx`:

```tsx
import { afterEach, expect, test } from "bun:test";
import { render } from "@testing-library/react";
import type { CollectionStats } from "@/store/userland/stats";
import { setupUserlandTest } from "@/test-utils";
import { useUserland } from "@/store/userland/userland-store";
import { ValueStats } from "./value-stats";

// ValueStats reads useCollectionStats; to test the render logic in isolation,
// pass the stats in as a prop. Refactor <ValueStats> to accept an optional
// `stats` prop (defaults to useCollectionStats()) so tests inject values
// without seeding the whole prices+userland chain. (If you prefer to seed the
// stores instead, do that consistently — but the prop injection keeps this test
// focused on the DISPLAY logic, which is the point of extracting the component.)
const base: CollectionStats = {
	cardsOwned: 0, setsTouched: 0, completionPct: 0, thisWeek: 0,
	collectingSince: null, estValue: null, estValueCurrency: null,
	marketValue: null, costBasisConverted: null, unrealizedPnL: null,
	valueCurrency: "USD",
};

afterEach(async () => {
	await setupUserlandTest();
});

test("renders market value, cost basis, and signed P&L", async () => {
	await setupUserlandTest();
	const { getByText } = render(
		<ValueStats stats={{ ...base, marketValue: 200000, costBasisConverted: 80000, unrealizedPnL: 120000, valueCurrency: "USD" }} />,
	);
	expect(getByText("$2000.00")).toBeTruthy(); // market value
	expect(getByText("$800.00")).toBeTruthy(); // cost basis
	expect(getByText("+$1200.00")).toBeTruthy(); // P&L
});

test("negative P&L renders with the down tone", async () => {
	await setupUserlandTest();
	const { getByText } = render(
		<ValueStats stats={{ ...base, marketValue: 5000, costBasisConverted: 8000, unrealizedPnL: -3000 }} />,
	);
	expect(getByText("-$30.00").className).toContain("var(--danger)");
});

test("market value shows — when prices unavailable", async () => {
	await setupUserlandTest();
	const { getAllByText } = render(<ValueStats stats={base} />);
	expect(getAllByText("—").length).toBeGreaterThanOrEqual(1);
});

test("hideValue masks every money value", async () => {
	await setupUserlandTest();
	useUserland.setState({
		profile: { ...useUserland.getState().profile, hideValue: true } as never,
	});
	const { getAllByText, queryByText } = render(
		<ValueStats stats={{ ...base, marketValue: 200000, costBasisConverted: 80000, unrealizedPnL: 120000 }} />,
	);
	expect(getAllByText("•••").length).toBeGreaterThanOrEqual(2);
	expect(queryByText("$2000.00")).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/components/vault/value-stats.test.tsx`
Expected: FAIL — `Cannot find module './value-stats'`.

- [ ] **Step 3: Implement `<ValueStats>`**

Create `src/components/vault/value-stats.tsx`:

```tsx
import { Stat } from "@/components/ui/stat";
import { formatPrice, formatSignedPrice } from "@/store/userland/money";
import type { CollectionStats } from "@/store/userland/stats";
import { useCollectionStats } from "@/store/userland/stats";
import { useHideValue } from "@/store/userland/valuation-hooks";

const MASK = "•••";
const DASH = "—";
const MIXED_HINT = "Mixed currencies — total needs conversion (coming soon)";

/**
 * The three money stats (market value, cost basis, unrealized P&L), shared by
 * the vault hero and the profile so the display + hide-value logic lives in one
 * place. `stats` is injectable for tests; defaults to the live hook.
 */
export function ValueStats({ stats }: { stats?: CollectionStats }) {
	const live = useCollectionStats();
	const s = stats ?? live;
	const hidden = useHideValue();

	const market =
		s.marketValue != null ? formatPrice(s.marketValue, s.valueCurrency) : DASH;

	// Cost basis: prefer the FX-summed value; fall back to PR3a's single-currency
	// estValue; mixed single-currency-unknown renders "—" with a hint.
	let cost = DASH;
	let costMixed = false;
	if (s.costBasisConverted != null) {
		cost = formatPrice(s.costBasisConverted, s.valueCurrency);
	} else if (s.estValue != null && s.estValueCurrency != null) {
		cost = formatPrice(s.estValue, s.estValueCurrency);
	} else if (s.estValue != null && s.estValueCurrency == null) {
		costMixed = true;
	}

	const pnlTone: "up" | "down" | undefined =
		s.unrealizedPnL == null ? undefined : s.unrealizedPnL >= 0 ? "up" : "down";

	return (
		<>
			<Stat value={hidden ? MASK : market} label="market value" />
			{costMixed && !hidden ? (
				<span title={MIXED_HINT} role="note">
					<Stat value={DASH} label="cost basis" />
				</span>
			) : (
				<Stat value={hidden ? MASK : cost} label="cost basis" />
			)}
			{s.unrealizedPnL != null && (
				<Stat
					value={hidden ? MASK : formatSignedPrice(s.unrealizedPnL, s.valueCurrency)}
					label="unrealized p&l"
					tone={hidden ? undefined : pnlTone}
				/>
			)}
		</>
	);
}
```

3b. `vault-summary.tsx`: import `ValueStats` + `useEnsurePrices` (`@/store/corpus/prices-runtime`). Call `useEnsurePrices()` at the top of the component. Replace the entire `{estValue !== null && (…)}` block (lines ~53-63) with `<ValueStats />`. Drop the now-unused `estValue`/`estValueCurrency` destructuring + `formatPrice` import + `MIXED_CURRENCY_LABEL`/`MIXED_CURRENCY_HINT` consts if orphaned.

3c. `profile.tsx`: import `ValueStats`. Replace the `{stats.estValue !== null && (…)}` block (lines ~103-110) with `<ValueStats />`. Drop orphaned `formatPrice`/`MIXED_*` if unused.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/components/vault/value-stats.test.tsx src/components/vault/ src/routes/`
Expected: PASS (new + existing vault/profile tests; update any existing test that asserted the old "est. value" label to the new "market value"/"cost basis" labels — change the expectation, don't weaken).

- [ ] **Step 5: Lint + commit**

```bash
bunx biome check --write --config-path=. src/components/vault/value-stats.tsx src/components/vault/vault-summary.tsx src/routes/profile.tsx src/components/vault/value-stats.test.tsx
git add src/components/vault/value-stats.tsx src/components/vault/vault-summary.tsx src/routes/profile.tsx src/components/vault/value-stats.test.tsx
# add any updated existing test files by path
git commit -m "feat(pricing): market value + cost basis + P&L on vault hero and profile"
```

---

### Task 3: Per-stack market value + P&L on the stack row

**Files:**
- Modify: `src/store/userland/valuation-hooks.ts` (add `useStackMarketValue`)
- Modify: `src/components/collection/stack-row.tsx`
- Test: `src/store/userland/valuation-hooks.test.tsx` (extend), `src/components/collection/stack-row.test.tsx` (extend)

**Interfaces:**
- Produces:
  - `interface StackMarket { marketValue: number | null; pnl: number | null; currency: string }`
  - `function useStackMarketValue(stack: Stack): StackMarket` — reads `useCardPriceEntry(stack.cardId)` + the fx table + profile displayCurrency; returns the stack's market value (via `stackValueUsdCents` → display currency) and P&L (market − pricePaid×qty converted). Nulls when unpriced / FX unavailable.

- [ ] **Step 1: Write the failing tests**

Extend `valuation-hooks.test.tsx`:

```tsx
import { renderHook } from "@testing-library/react";
import { makeStack } from "../../test-utils";
import { usePricesRuntime, resetPricesRuntimeForTests } from "../corpus/prices-runtime";
import { useStackMarketValue } from "./valuation-hooks";

// add to afterEach: await resetPricesRuntimeForTests();

test("useStackMarketValue returns market value + P&L in display currency", async () => {
	await setupUserlandTest();
	usePricesRuntime.setState({
		byId: new Map([["base1-4", { tp: { N: [1000, null] } }]]), // $10 unit
		meta: { date: "x", sources: { tp: "x", cm: null }, fx: { base: "EUR", date: "x", rates: { USD: 1.09 } } },
		status: "ready",
	});
	const stack = makeStack({ cardId: "base1-4", quantity: 2, pricePaid: 400, currency: "USD", condition: "NM", grading: null, printing: null });
	const { result } = renderHook(() => useStackMarketValue(stack));
	expect(result.current.marketValue).toBe(2000); // $10 × 2
	expect(result.current.pnl).toBe(1200); // 2000 − 800
	expect(result.current.currency).toBe("USD");
});

test("useStackMarketValue is null-safe when unpriced", async () => {
	await setupUserlandTest();
	await resetPricesRuntimeForTests();
	const stack = makeStack({ cardId: "nope", pricePaid: 400, currency: "USD" });
	const { result } = renderHook(() => useStackMarketValue(stack));
	expect(result.current.marketValue).toBeNull();
	expect(result.current.pnl).toBeNull();
});
```

Extend `stack-row.test.tsx` — read the file first for its render harness (it renders a `StackRow` with an `item` stack). Seed `usePricesRuntime` with a price entry for the row's card + a profile, assert the market value string renders; seed `hideValue: true` and assert "•••". Reset prices in afterEach.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/store/userland/valuation-hooks.test.tsx src/components/collection/stack-row.test.tsx`
Expected: FAIL — `useStackMarketValue` absent / row shows no market value.

- [ ] **Step 3: Implement**

3a. Append to `valuation-hooks.ts`:

```ts
import { convertMinorUnits } from "@/lib/corpus/fx";
import { useCardPriceEntry, usePricesRuntime } from "../corpus/prices-runtime";
import type { Stack } from "./types";
import { stackValueUsdCents } from "./valuation";

export interface StackMarket {
	marketValue: number | null;
	pnl: number | null;
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
			? convertMinorUnits(stack.pricePaid * stack.quantity, stack.currency, currency, fx)
			: null;
	const pnl =
		marketValue != null && costDisplay != null ? marketValue - costDisplay : null;
	return { marketValue, pnl, currency };
}
```

3b. `stack-row.tsx`: read `useStackMarketValue(item)` + `useHideValue()` near the top. After the price-paid badge block (~line 111-115), add a market-value span (masked when hidden), e.g.:

```tsx
{(() => {
	const { marketValue, pnl, currency } = market; // from useStackMarketValue(item)
	if (marketValue == null) return null;
	return (
		<span className="font-mono text-[11px] text-[var(--success)]">
			{hidden ? "•••" : formatPrice(marketValue, currency)}
			{!hidden && pnl != null ? (
				<span className={pnl >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]"}>
					{" "}
					{formatSignedPrice(pnl, currency)}
				</span>
			) : null}
		</span>
	);
})()}
```

(Match the row's existing className idiom; import `formatPrice`/`formatSignedPrice`, `useStackMarketValue`, `useHideValue`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/store/userland/valuation-hooks.test.tsx src/components/collection/stack-row.test.tsx src/components/collection/`
Expected: PASS.

- [ ] **Step 5: Lint + commit**

```bash
bunx biome check --write --config-path=. src/store/userland/valuation-hooks.ts src/components/collection/stack-row.tsx src/store/userland/valuation-hooks.test.tsx src/components/collection/stack-row.test.tsx
git add src/store/userland/valuation-hooks.ts src/components/collection/stack-row.tsx src/store/userland/valuation-hooks.test.tsx src/components/collection/stack-row.test.tsx
git commit -m "feat(pricing): per-stack market value + P&L delta on the stack row"
```

---

### Task 4: Binder market value

**Files:**
- Modify: `src/store/userland/valuation-hooks.ts` (add `useBinderValue`)
- Modify: `src/components/binders/binder-detail.tsx`
- Test: `src/store/userland/valuation-hooks.test.tsx` (extend), `src/components/binders/binder-detail.test.tsx` (extend if present)

**Interfaces:**
- Consumes: `useBinderMembers` (`./selectors`), `useOwnedIndex` (`./selectors`), prices runtime, `stackValueUsdCents`, `convertMinorUnits`, profile displayCurrency.
- Produces:
  - `interface BinderValue { value: number | null; currency: string }`
  - `function useBinderValue(binderId: string): BinderValue` — sum, over the binder's member cards the user owns, of every stack's market value; converted to the display currency. Null when prices/FX unavailable.

- [ ] **Step 1: Write the failing test**

Extend `valuation-hooks.test.tsx`:

```tsx
// Seed a binder whose members include an owned, priced card, then assert the
// summed value. Use the binder/userland seed helpers the selectors tests use
// (read src/store/userland/selectors.test.ts for the pattern: seed corpus +
// regions + a binder + owned stacks). Assert useBinderValue(binderId).value
// equals the summed stackValueUsdCents converted to displayCurrency, and null
// when prices aren't loaded.
```

(Because `useBinderValue` depends on corpus regions + binder membership, model the test on the existing `useBinderProgress` test setup. If that setup is heavy, at minimum assert the null-safe path — prices unloaded → value null — and one positive path with a seeded single-member binder + one owned priced stack.)

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/store/userland/valuation-hooks.test.tsx`
Expected: FAIL — `useBinderValue` absent.

- [ ] **Step 3: Implement**

Append to `valuation-hooks.ts`:

```ts
import { useBinderMembers, useOwnedIndex } from "./selectors";

export interface BinderValue {
	value: number | null;
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
```

Note: this hook calls hooks unconditionally BEFORE the early return (members/owned/byId/fx/currency are all read at the top) — the `if (!members …)` guard comes after all hook calls, so the Rules of Hooks hold. Keep it that way.

3b. `binder-detail.tsx`: read `useBinderValue(binder.id)` + `useHideValue()`; in the Progress summary panel (~line 195), add a "Market value" line under the progress row when `value != null`, masked when hidden:

```tsx
{value != null ? (
	<div className="flex justify-between text-sm">
		<span className="text-[10.5px] uppercase tracking-[0.18em] text-[var(--faint)] font-semibold self-center">
			Market value
		</span>
		<span className="font-mono tabular-nums text-[var(--success)]">
			{hidden ? "•••" : formatPrice(value, currency)}
		</span>
	</div>
) : null}
```

(Import `formatPrice`, `useBinderValue`, `useHideValue`. Match the panel's existing markup.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/store/userland/valuation-hooks.test.tsx src/components/binders/`
Expected: PASS.

- [ ] **Step 5: Lint + commit**

```bash
bunx biome check --write --config-path=. src/store/userland/valuation-hooks.ts src/components/binders/binder-detail.tsx src/store/userland/valuation-hooks.test.tsx
git add src/store/userland/valuation-hooks.ts src/components/binders/binder-detail.tsx src/store/userland/valuation-hooks.test.tsx
# add binder-detail.test.tsx if you extended it
git commit -m "feat(pricing): binder market value"
```

---

### Task 5: Hide-value toggle UI (profile Switch + vault quick-toggle)

**Files:**
- Modify: `src/components/profile/profile-form-dialog.tsx` (Switch)
- Modify: `src/components/vault/vault-summary.tsx` (quick-toggle button)
- Test: `src/components/profile/profile-form-dialog.test.tsx` (extend), `src/components/vault/` (extend)

**Interfaces:**
- Consumes: shadcn `Switch` (`@/components/ui/switch`); lucide `Eye`/`EyeOff`; `updateProfile`; `useHideValue`.
- Produces: the profile form has a "Hide monetary values" Switch bound to `Profile.hideValue`; the vault hero has an Eye/EyeOff icon button that flips `hideValue` via `updateProfile`.

- [ ] **Step 1: Write the failing tests**

Extend `profile-form-dialog.test.tsx`: the dialog renders a "Hide" Switch; toggling it + submitting calls `updateProfile` with `hideValue: true` (assert on `useUserland.getState().profile?.hideValue` after submit, matching the file's existing no-spy convention — the displayCurrency test is the template).

Extend a vault test (or add `vault-summary.test.tsx`): the hero renders a hide-toggle button (`aria-label` "Hide values" / "Show values"); clicking it flips `useUserland.getState().profile?.hideValue`. Seed userland; assert the flip.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/components/profile/profile-form-dialog.test.tsx src/components/vault/`
Expected: FAIL — no Switch / no toggle button.

- [ ] **Step 3: Implement**

3a. `profile-form-dialog.tsx`:
- import `Switch` from `@/components/ui/switch`.
- `profileFormSchema`: add `hideValue: z.boolean()`.
- `defaultValues`: `hideValue: profile?.hideValue ?? false`.
- `onSubmit` `updateProfile({...})`: add `hideValue: value.hideValue`.
- Add a `form.Field name="hideValue"` control after the currency Select (a `Field` with a `FieldLabel` "Hide monetary values" + a `Switch` bound `checked={field.state.value} onCheckedChange={(v) => field.handleChange(v)}`). Mirror the existing field markup; biome-ignore the render-prop `children` as the other fields do.

3b. `vault-summary.tsx`:
- import `Eye`, `EyeOff` from `lucide-react`; `updateProfile` from `@/store/userland/userland-store`; `useHideValue`.
- `const hidden = useHideValue();`
- In the Actions area, add an icon Button:
  ```tsx
  <Button
  	variant="ghost"
  	size="icon-sm"
  	aria-label={hidden ? "Show values" : "Hide values"}
  	title={hidden ? "Show values" : "Hide values"}
  	onClick={() => updateProfile({ hideValue: !hidden })}
  >
  	{hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
  </Button>
  ```
  (Use the actual icon-button size variant from `button.tsx` — recon shows `icon-sm` is 8×8; match what exists.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/components/profile/ src/components/vault/`
Expected: PASS.

- [ ] **Step 5: Lint + commit**

```bash
bunx biome check --write --config-path=. src/components/profile/profile-form-dialog.tsx src/components/vault/vault-summary.tsx src/components/profile/profile-form-dialog.test.tsx
git add src/components/profile/profile-form-dialog.tsx src/components/vault/vault-summary.tsx src/components/profile/profile-form-dialog.test.tsx
# add the vault test you extended
git commit -m "feat(pricing): hide-value toggle (profile switch + vault quick-toggle)"
```

---

### Task 6: PR 3b-i coverage backfill + test-helper dedupe

**Files:**
- Modify: `src/store/userland/stats.test.ts`, `src/store/userland/valuation.test.ts`
- Modify: the two files sharing a duplicated `gzBlob` helper (`src/store/corpus/prices-runtime-hooks.test.tsx`, `src/components/islands/card-prices.test.tsx`) — extract to a shared test util.

**Interfaces:** none (tests only).

- [ ] **Step 1: Add the deferred coverage tests**

- `stats.test.ts`: (a) display-currency rate missing — seed prices with an fx table lacking the profile's displayCurrency rate (e.g. displayCurrency "GBP", rates only `{USD}`) → assert `marketValue`/`costBasisConverted`/`unrealizedPnL` are null (degraded, not wrong). (b) mixed-stack cost basis — seed a USD stack + a JPY stack, both priced, fx present → assert `costBasisConverted` is a real summed number (not null, not "—") and `valueCurrency` is the displayCurrency.
- `valuation.test.ts`: reverse+1st-edition precedence — `finishForPrinting({ type: "reverse", stamp: ["1st-edition"] })` → assert `"R"` (reverse wins), locking the documented precedence.

- [ ] **Step 2: Dedupe the `gzBlob` helper**

Extract the duplicated `gzBlob` (+ any shared price-blob fixture) into a shared test util (e.g. a small exported helper in `src/store/corpus/prices-test-util.ts` or the existing `src/test-utils.tsx` if prices helpers fit there) and import it in both `prices-runtime-hooks.test.tsx` and `card-prices.test.tsx`. Keep behavior identical.

- [ ] **Step 3: Run + commit**

Run: `bun test src/store/userland/stats.test.ts src/store/userland/valuation.test.ts src/store/corpus/ src/components/islands/card-prices.test.tsx`
Expected: PASS.

```bash
bunx biome check --write --config-path=. <touched files>
git add <touched files by path>
git commit -m "test(pricing): backfill valuation coverage + dedupe gzBlob helper"
```

---

### Task 7: Final verification gate + whole-branch review prep

**Files:** none (verification only)

- [ ] **Step 1: Regenerate the route tree, then run all gates**

```bash
nohup bunx vite dev --port 6301 >/tmp/pr3bii-rg.log 2>&1 & VP=$!; sleep 8; kill $VP 2>/dev/null
```

Then in parallel:
- `bunx tsc -b`
- `bun test`
- `bunx biome check --config-path=. src/store/userland/valuation-hooks.ts src/store/userland/money.ts src/components/ui/stat.tsx src/components/vault/ src/routes/profile.tsx src/components/collection/stack-row.tsx src/components/binders/binder-detail.tsx src/components/profile/profile-form-dialog.tsx`

Expected: tsc 0; full suite green (baseline 1526 + new tests); biome clean. Then `rm -f src/routeTree.gen.ts`.

- [ ] **Step 2: Browser smoke (previewable UI changed)**

This PR changes visible surfaces. Per the project preview workflow, boot the dev server and verify the vault hero shows market value + P&L, the hide toggle masks values, and no console errors. (If the preview tooling can't bind the worktree, rely on the component tests as the gate and note it — consistent with prior pricing PRs.)

- [ ] **Step 3: Fix anything red, re-run, commit. Confirm `git status --short` clean (no lockfile drift).**

## Self-Review Notes (plan author)

- **Spec coverage:** §7 market value + P&L on vault/profile (T2) + stack-row (T3) + binder (T4); hide-value toggle across all surfaces (T1 gate + T5 controls); `useEnsurePrices` in vault (T2). Coverage backfill from 3b-i (T6). Completes the pricing epic except PR 4 (history charts + local snapshots).
- **Hide gate is one hook** (`useHideValue`) read by every surface; the mask is `"•••"`. Default false (visible).
- **Cost basis** prefers `costBasisConverted` (mixed-currency real total) and falls back to PR 3a `estValue` — so the old "—" only appears offline (no FX), which is honest.
- **Zustand:** `<ValueStats>` reads the headline hook (already a vault/profile subscription); `stack-row` subscribes its own card entry (S3, one per row); `useBinderValue` subscribes byId+fx+items (one binder view). No wide slices, no prop-drilling.
- **No new deps.** Switch + lucide + tokens all exist.
- **Type consistency:** `useHideValue`/`useStackMarketValue`/`useBinderValue`/`formatSignedPrice`/`<ValueStats>`/`StackMarket`/`BinderValue` names used identically across tasks.
