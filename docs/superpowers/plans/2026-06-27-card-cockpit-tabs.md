# Card Cockpit 3-Tab Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize the card overlay/page from a two-face horizontal slide (detail ↔ manager) into a three-tab cockpit (Details / Collection / Pricing) with a persistent card-art rail on the left.

**Architecture:** One shared `CardCockpit` component (persistent identity rail + a tab control + a swappable content pane) replaces today's `CardDetail` and `CardCollectionManager`. It is rendered by both the in-app overlay (`CardModal`) and the three cold-load routes. Tab state lives in router history state as `cardTab` (replacing the boolean `cardManage`); each tab maps to a real masked route so deep-links and cold loads survive.

**Tech Stack:** React 19 (compiler on, manual memo intentional), TanStack Start/Router, Tailwind v4 (Liquid Glass tokens), Zustand, Bun test runner + happy-dom + `@testing-library/react`.

## Global Constraints

- Tests must not hit the network: any test rendering a card pre-seeds the corpus via `seedCorpusFor(card)` (or `seedCorpus([...])`) so `loadCorpus()` early-returns. (`src/test-utils.tsx`)
- Userland-touching tests call `await setupUserlandTest()` in `beforeEach`.
- Optional record fields are `null`, never `undefined`.
- No em-dashes in user-facing copy (use periods/commas). Sentence case for UI labels, no terminal punctuation on labels.
- Manual `useMemo`/`useCallback` are intentional — do not strip them.
- Guard all motion with `motion-reduce:`.
- Never set a self-referential CSS var (`--x: var(--x, …)`) — it hangs happy-dom.
- Money is cents; not relevant here (prices are read-only via `buildPriceLines`).
- Lint a changed file with `bunx biome check --write --config-path=. <file>` (plain `bun run lint` breaks in worktrees). Typecheck with `bunx tsc -b`. Tests with `bun test <file>`.
- Commit after each task. `git add` explicit paths only — never `git add -A` (untracked throwaway dirs exist).

## File Structure

| File | Responsibility | Change |
|------|---------------|--------|
| `src/lib/card-route.ts` | `CardTab` type, `HistoryState` augmentation, tab link helpers | modify |
| `src/lib/card-route.test.ts` | helper unit tests | modify |
| `src/components/card/card-info.tsx` | Details body; gains `showHeader`; exports `describeCard` | modify |
| `src/components/card/card-info.test.tsx` | `showHeader` behavior | create |
| `src/components/card/card-tabs.tsx` | the tablist control | create |
| `src/components/card/card-tabs.test.tsx` | tablist a11y + selection | create |
| `src/components/card/card-pricing-tab.tsx` | Pricing pane (prices + scaffold) | create |
| `src/components/card/card-pricing-tab.test.tsx` | pricing pane structure | create |
| `src/components/card/card-cockpit.tsx` | rail + header + pane switch; owns `CollectionButton` | create |
| `src/components/card/card-cockpit.test.tsx` | rail persistence + per-tab panes | create |
| `src/components/islands/card-overlay.tsx` | reads `cardTab`, passes `tab` | modify |
| `src/components/islands/card-modal.tsx` | renders `CardCockpit` (no slide track) | modify |
| `src/components/islands/card-modal.test.tsx` | cockpit-based assertions | modify |
| `src/routes/$series/$set/$card.tsx` | renders `CardCockpit` tab="details" | modify |
| `src/routes/$series/$set/$card_.manage.tsx` | renders `CardCockpit` tab="collection" | modify |
| `src/routes/$series/$set/$card_.prices.tsx` | renders `CardCockpit` tab="pricing" | create |
| `src/components/card/card-detail.tsx` (+ `.test.tsx`) | retired | delete |
| `src/components/collection/card-collection-manager.tsx` (+ `.test.tsx`) | retired | delete |

**Green-build ordering:** Tasks 1–5 are additive (new code + a transitional dual-write that keeps the old overlay working), so typecheck/tests stay green throughout. Task 6 flips the consumers to the cockpit. Task 7 deletes the retired components and removes the transitional `cardManage`.

---

### Task 1: `card-route` — `CardTab` state + tab link helpers

**Files:**
- Modify: `src/lib/card-route.ts`
- Test: `src/lib/card-route.test.ts`

**Interfaces:**
- Produces: `export type CardTab = "details" | "collection" | "pricing"`; `cardTabLinkPropsFor(p: CardRouteParams, tab: CardTab): LinkProps`; `cardPricesLinkPropsFor(p: CardRouteParams): LinkProps`. `cardModalLinkPropsFor` / `cardManageLinkPropsFor` keep their `(p: CardRouteParams) => LinkProps` signatures and now delegate to `cardTabLinkPropsFor`.
- Transition note: `HistoryState.cardManage?: boolean` is **kept** this task and dual-written (`cardManage = tab === "collection"`) so the not-yet-migrated overlay still works. Task 7 removes it.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/card-route.test.ts` (update the existing import line to include the new helpers):

```ts
import {
	cardManageLinkPropsFor,
	cardModalLinkPropsFor,
	cardPricesLinkPropsFor,
	cardRouteProps,
} from "./card-route";
```

Append these blocks:

```ts
const readState = (props: ReturnType<typeof cardModalLinkPropsFor>) =>
	(props.state as (prev: Record<string, unknown>) => Record<string, unknown>)({});

describe("cardTab on the three tab helpers", () => {
	test("detail helper sets cardTab=details and cardManage=false", () => {
		const s = readState(cardModalLinkPropsFor(p));
		expect(s.cardTab).toBe("details");
		expect(s.cardManage).toBe(false);
		expect(s.cardOverlay).toBe("sword-shield/brilliant-stars/charizard");
	});

	test("manage helper sets cardTab=collection and cardManage=true", () => {
		const s = readState(cardManageLinkPropsFor(p));
		expect(s.cardTab).toBe("collection");
		expect(s.cardManage).toBe(true);
	});

	test("prices helper sets cardTab=pricing and masks to /prices", () => {
		const props = cardPricesLinkPropsFor(p);
		const s = readState(props);
		expect(s.cardTab).toBe("pricing");
		expect(s.cardOverlay).toBe("sword-shield/brilliant-stars/charizard");
		expect((props.mask as { to: string }).to).toBe(
			"/$series/$set/$card/prices",
		);
		expect((props.mask as { params: typeof p }).params).toEqual(p);
	});

	test("prices helper preserves existing state keys", () => {
		const s = (
			cardPricesLinkPropsFor(p).state as (
				prev: Record<string, unknown>,
			) => Record<string, unknown>
		)({ keep: "me" });
		expect(s.keep).toBe("me");
		expect(s.cardTab).toBe("pricing");
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/lib/card-route.test.ts`
Expected: FAIL (`cardPricesLinkPropsFor` is not exported; `cardTab` undefined).

- [ ] **Step 3: Implement the helpers**

In `src/lib/card-route.ts`, add the type and a shared builder, and rewrite the three named helpers to delegate. Keep `cardManage` in the `HistoryState` block for now with a transitional comment.

```ts
export type CardTab = "details" | "collection" | "pricing";

const TAB_MASK: Record<CardTab, LinkProps["to"]> = {
	details: "/$series/$set/$card",
	collection: "/$series/$set/$card/manage",
	pricing: "/$series/$set/$card/prices",
};

/**
 * Shared masked-overlay nav for a given tab: stay on the current route, set
 * `cardOverlay` + `cardTab` in history state, and mask the URL to the tab's
 * canonical route. The three named helpers below delegate here.
 */
export function cardTabLinkPropsFor(p: CardRouteParams, tab: CardTab): LinkProps {
	return {
		to: ".",
		search: (prev: Record<string, unknown>) => prev,
		state: (prev: Record<string, unknown>) => ({
			...prev,
			cardOverlay: `${p.series}/${p.set}/${p.card}`,
			cardTab: tab,
			// Transitional: keep cardManage in sync until CardOverlay reads cardTab
			// (removed in the cleanup task). Lets the old overlay keep working.
			cardManage: tab === "collection",
		}),
		mask: { to: TAB_MASK[tab], params: p },
	} as LinkProps;
}
```

Replace the bodies of `cardModalLinkPropsFor` and `cardManageLinkPropsFor` with delegations, and add the prices helper:

```ts
export function cardModalLinkPropsFor(p: CardRouteParams): LinkProps {
	return cardTabLinkPropsFor(p, "details");
}

export function cardManageLinkPropsFor(p: CardRouteParams): LinkProps {
	return cardTabLinkPropsFor(p, "collection");
}

/** In-app overlay nav that opens the Pricing tab. Mirrors the other two. */
export function cardPricesLinkPropsFor(p: CardRouteParams): LinkProps {
	return cardTabLinkPropsFor(p, "pricing");
}
```

In the `declare module` block, add `cardTab` above `cardManage` (keep `cardManage` for now):

```ts
		/** Active card-overlay tab. Masked to the tab's canonical route. */
		cardTab?: "details" | "collection" | "pricing";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/lib/card-route.test.ts`
Expected: PASS (new blocks + the existing `cardManageLinkPropsFor` / `cardRouteProps` blocks still green — `cardManage` is still dual-written).

- [ ] **Step 5: Lint, typecheck, commit**

```bash
bunx biome check --write --config-path=. src/lib/card-route.ts src/lib/card-route.test.ts
bunx tsc -b
git add src/lib/card-route.ts src/lib/card-route.test.ts
git commit -m "feat(card-route): cardTab state + cardTabLinkPropsFor/cardPricesLinkPropsFor"
```

---

### Task 2: `CardInfo` — `showHeader` prop + exported `describeCard`

**Files:**
- Modify: `src/components/card/card-info.tsx`
- Test: `src/components/card/card-info.test.tsx` (create)

**Interfaces:**
- Produces: `CardInfo` gains `showHeader?: boolean` (default `true`). When `false`, the identity block (set·#, name + HP, descriptor + rarity) is not rendered; abilities/attacks/rules/flavor/stat-strip/footer still render. Also `export function describeCard(card: FocusCardData): string` (the renamed former private `describe`), for the rail to reuse.

- [ ] **Step 1: Write the failing test**

Create `src/components/card/card-info.test.tsx`:

```tsx
import { expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { makeFocusCard } from "../../test-utils";
import { CardInfo } from "./card-info";

const CARD = makeFocusCard({
	id: "base1-4",
	name: "Charizard",
	setName: "Base Set",
	cardNumber: "4",
	hp: "120",
	attacks: [{ name: "Fire Spin", cost: ["Fire"], damage: "100", text: "Discard 2 Energy." }],
});

test("showHeader defaults to true: renders the name", () => {
	render(<CardInfo card={CARD} />);
	expect(screen.getByRole("heading", { name: "Charizard" })).toBeDefined();
});

test("showHeader=false: suppresses name and HP but keeps the attack", () => {
	render(<CardInfo card={CARD} showHeader={false} />);
	expect(screen.queryByRole("heading", { name: "Charizard" })).toBeNull();
	expect(screen.queryByText(/HP/)).toBeNull();
	// Body still renders.
	expect(screen.getByText("Fire Spin")).toBeDefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/components/card/card-info.test.tsx`
Expected: FAIL (`showHeader` not yet a prop — name still renders when false).

- [ ] **Step 3: Implement**

In `src/components/card/card-info.tsx`:
1. Rename `function describe(` to `export function describeCard(` and update its one call site (`{describe(card)}` → `{describeCard(card)}`).
2. Add `showHeader` to the props (default `true`) and wrap the identity block (`<div className="font-mono … setName · #cardNumber>` through the descriptor/rarity `<div>`, i.e. the current lines 186–214) in `{showHeader ? ( … ) : null}`.

```tsx
export function CardInfo({
	card,
	footer,
	pending,
	showHeader = true,
}: {
	card: FocusCardData;
	footer?: ReactNode;
	pending?: boolean;
	showHeader?: boolean;
}) {
	// …unchanged body computations…
	return (
		<div className="flex min-w-0 flex-1 flex-col text-(--ink)">
			{showHeader ? (
				<>
					<div className="font-mono text-[11px] uppercase tracking-[0.14em] text-(--ink-muted)">
						{card.setName} · #{card.cardNumber}
					</div>
					{/* …name + HP row… */}
					{/* …descriptor + rarity row… */}
				</>
			) : null}
			{/* …flex-1 body, stat strip, footer unchanged… */}
		</div>
	);
}
```

(Keep the existing inner JSX verbatim; only wrap the identity block and add the prop. The HP shimmer `pending` branch lives inside the identity block, so it is correctly suppressed when `showHeader={false}`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/components/card/card-info.test.tsx`
Expected: PASS.

- [ ] **Step 5: Lint, typecheck, commit**

```bash
bunx biome check --write --config-path=. src/components/card/card-info.tsx src/components/card/card-info.test.tsx
bunx tsc -b
git add src/components/card/card-info.tsx src/components/card/card-info.test.tsx
git commit -m "feat(card-info): showHeader prop + export describeCard"
```

(Note: `card-detail.tsx` still imports `CardInfo` with no `showHeader` — it keeps the default `true`, so it stays green until deleted in Task 7.)

---

### Task 3: `CardTabs` — the tablist control

**Files:**
- Create: `src/components/card/card-tabs.tsx`
- Test: `src/components/card/card-tabs.test.tsx`

**Interfaces:**
- Consumes: `CardTab` from `@/lib/card-route` (or `../../lib/card-route`).
- Produces: `CardTabs({ tab, onChange, idBase }: { tab: CardTab; onChange: (t: CardTab) => void; idBase?: string })`. Renders `role="tablist"` with three `role="tab"` buttons. Each tab has `id={`${idBase}-tab-${value}`}` and `aria-controls={`${idBase}-panel-${value}`}` so the cockpit pane can set the matching `id`/`aria-labelledby`. `idBase` defaults to `"card"`.

- [ ] **Step 1: Write the failing test**

Create `src/components/card/card-tabs.test.tsx`:

```tsx
import { expect, mock, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { CardTabs } from "./card-tabs";

test("renders a tablist with three tabs and marks the active one", () => {
	render(<CardTabs tab="details" onChange={() => {}} />);
	expect(screen.getByRole("tablist")).toBeDefined();
	const tabs = screen.getAllByRole("tab");
	expect(tabs.length).toBe(3);
	expect(screen.getByRole("tab", { name: "Details" }).getAttribute("aria-selected")).toBe("true");
	expect(screen.getByRole("tab", { name: "Pricing" }).getAttribute("aria-selected")).toBe("false");
});

test("clicking a tab calls onChange with its value", () => {
	const onChange = mock((_: string) => {});
	render(<CardTabs tab="details" onChange={onChange} />);
	fireEvent.click(screen.getByRole("tab", { name: "Collection" }));
	expect(onChange).toHaveBeenCalledTimes(1);
	expect(onChange.mock.calls[0][0]).toBe("collection");
});

test("ArrowRight from the active tab selects the next tab", () => {
	const onChange = mock((_: string) => {});
	render(<CardTabs tab="details" onChange={onChange} />);
	fireEvent.keyDown(screen.getByRole("tab", { name: "Details" }), { key: "ArrowRight" });
	expect(onChange.mock.calls[0][0]).toBe("collection");
});

test("active tab is the only one in the tab order (roving tabIndex)", () => {
	render(<CardTabs tab="collection" onChange={() => {}} />);
	expect(screen.getByRole("tab", { name: "Collection" }).getAttribute("tabindex")).toBe("0");
	expect(screen.getByRole("tab", { name: "Details" }).getAttribute("tabindex")).toBe("-1");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/components/card/card-tabs.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `src/components/card/card-tabs.tsx`. Visual mirrors the SegmentedControl in `stack-edit-form.tsx` (active pill `bg-(--primary) text-(--primary-ink)`); semantics are a real tablist with roving focus.

```tsx
import { cn } from "@/lib/utils";
import type { CardTab } from "../../lib/card-route";

const TABS: { value: CardTab; label: string }[] = [
	{ value: "details", label: "Details" },
	{ value: "collection", label: "Collection" },
	{ value: "pricing", label: "Pricing" },
];

/**
 * Card cockpit tab switcher. A proper `role="tablist"` with roving tabIndex and
 * arrow-key navigation. `idBase` ties each tab to its panel via aria-controls /
 * the panel's aria-labelledby.
 */
export function CardTabs({
	tab,
	onChange,
	idBase = "card",
}: {
	tab: CardTab;
	onChange: (t: CardTab) => void;
	idBase?: string;
}) {
	const move = (dir: 1 | -1) => {
		const i = TABS.findIndex((t) => t.value === tab);
		const next = TABS[(i + dir + TABS.length) % TABS.length];
		onChange(next.value);
	};
	return (
		<div
			role="tablist"
			aria-label="Card views"
			className="inline-flex gap-1 rounded-(--r-pill) border border-white/10 bg-white/4 p-1"
		>
			{TABS.map((t) => {
				const active = t.value === tab;
				return (
					<button
						key={t.value}
						type="button"
						role="tab"
						id={`${idBase}-tab-${t.value}`}
						aria-controls={`${idBase}-panel-${t.value}`}
						aria-selected={active}
						tabIndex={active ? 0 : -1}
						onClick={() => onChange(t.value)}
						onKeyDown={(e) => {
							if (e.key === "ArrowRight") {
								e.preventDefault();
								move(1);
							} else if (e.key === "ArrowLeft") {
								e.preventDefault();
								move(-1);
							}
						}}
						className={cn(
							"rounded-(--r-pill) px-3.5 py-1.5 font-mono text-[12px] tracking-[0.04em] transition-colors",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--primary)",
							active
								? "bg-(--primary) font-semibold text-(--primary-ink)"
								: "text-(--ink-muted) hover:text-(--ink)",
						)}
					>
						{t.label}
					</button>
				);
			})}
		</div>
	);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/components/card/card-tabs.test.tsx`
Expected: PASS.

- [ ] **Step 5: Lint, typecheck, commit**

```bash
bunx biome check --write --config-path=. src/components/card/card-tabs.tsx src/components/card/card-tabs.test.tsx
bunx tsc -b
git add src/components/card/card-tabs.tsx src/components/card/card-tabs.test.tsx
git commit -m "feat(card-tabs): tablist tab control for the card cockpit"
```

---

### Task 4: `CardPricingTab` — the Pricing pane

**Files:**
- Create: `src/components/card/card-pricing-tab.tsx`
- Test: `src/components/card/card-pricing-tab.test.tsx`

**Interfaces:**
- Consumes: `CardPrices` (`../islands/card-prices`), `GlassPanel` + `Skeleton` (`@/components/ui/*`), `FocusCardData`.
- Produces: `CardPricingTab({ card, pending }: { card: FocusCardData; pending?: boolean })`. Renders a "Market prices" section (the existing `CardPrices`, or a shimmer when `pending`) and a labeled "Price history" coming-soon scaffold.

- [ ] **Step 1: Write the failing test**

Create `src/components/card/card-pricing-tab.test.tsx`:

```tsx
import { expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { makeFocusCard } from "../../test-utils";
import { CardPricingTab } from "./card-pricing-tab";

const CARD = makeFocusCard({ id: "base1-4", name: "Charizard" });

test("renders the market-prices and price-history sections", () => {
	render(<CardPricingTab card={CARD} />);
	expect(screen.getByText(/market prices/i)).toBeDefined();
	expect(screen.getByText(/price history/i)).toBeDefined();
	expect(screen.getByText(/coming soon/i)).toBeDefined();
});

test("pending shows a price shimmer instead of the price panel", () => {
	const { container } = render(<CardPricingTab card={CARD} pending />);
	// Shimmer skeletons are aria-hidden.
	expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/components/card/card-pricing-tab.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `src/components/card/card-pricing-tab.tsx`. `PriceGhost` moves here from `card-detail.tsx` (which is deleted in Task 7).

```tsx
import { GlassPanel } from "@/components/ui/glass";
import { Skeleton } from "@/components/ui/skeleton";
import type { FocusCardData } from "../../server/card-mappers";
import { CardPrices } from "../islands/card-prices";

const SECTION =
	"font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-(--faint)";

/** Shimmer stand-in for the price panel while the detail RPC is in flight. */
function PriceGhost() {
	return (
		<GlassPanel className="p-3.5" aria-hidden="true">
			<div className="flex flex-col gap-2.5">
				{["a", "b"].map((k) => (
					<div key={k} className="flex items-center justify-between gap-3">
						<Skeleton className="h-3 w-20" />
						<Skeleton className="h-3 w-14" />
					</div>
				))}
			</div>
		</GlassPanel>
	);
}

/**
 * Pricing tab body. For now: live market prices (TCGplayer / Cardmarket) plus a
 * labeled scaffold for the price-history build-out to come. No charts yet.
 */
export function CardPricingTab({
	card,
	pending,
}: {
	card: FocusCardData;
	pending?: boolean;
}) {
	return (
		<div className="flex flex-col gap-5">
			<section>
				<div className={SECTION}>Market prices</div>
				<div className="mt-2">
					{pending ? <PriceGhost /> : <CardPrices card={card} />}
				</div>
			</section>
			<section aria-label="Price history">
				<div className={SECTION}>Price history</div>
				<GlassPanel className="mt-2 p-4 text-[13px] text-(--ink-muted)">
					Price history. Coming soon.
				</GlassPanel>
			</section>
		</div>
	);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/components/card/card-pricing-tab.test.tsx`
Expected: PASS.

- [ ] **Step 5: Lint, typecheck, commit**

```bash
bunx biome check --write --config-path=. src/components/card/card-pricing-tab.tsx src/components/card/card-pricing-tab.test.tsx
bunx tsc -b
git add src/components/card/card-pricing-tab.tsx src/components/card/card-pricing-tab.test.tsx
git commit -m "feat(card-pricing-tab): pricing pane with market prices + history scaffold"
```

---

### Task 5: `CardCockpit` — rail + header + pane switch

**Files:**
- Create: `src/components/card/card-cockpit.tsx`
- Test: `src/components/card/card-cockpit.test.tsx`

**Interfaces:**
- Consumes: `CardTab`, `CardTabs`, `CardInfo` + `describeCard`, `CardPricingTab`, `StackManager` (`../collection/stack-manager`), `CardCrossLinks` + `CrossLink` (`../islands/cross-links`), `HoloCard` + `holoCardProps` (`../holo-card`), `toHoloCardData` (`./to-holo`), `GlassPanel`/`Badge`, `useIsOwned` + `addStack` (`../../store/userland/*`), `getCardAccent`/`getReadableAccent` (`../../utils/card-colors`).
- Produces: `CardCockpit({ card, crossLinks, tab, onTabChange, pending }: { card: FocusCardData; crossLinks: CrossLink[]; tab: CardTab; onTabChange: (t: CardTab) => void; pending?: boolean })`. Persistent left rail (holo, name, descriptor, set·#, HP, rarity, `CollectionButton`) + header (breadcrumb + `CardTabs`) + a `role="tabpanel"` pane that renders `CardInfo` (Details), `StackManager` in a `GlassPanel` (Collection), or `CardPricingTab` (Pricing). `CollectionButton` lives in this file.

- [ ] **Step 1: Write the failing test**

Create `src/components/card/card-cockpit.test.tsx`:

```tsx
import { beforeEach, expect, mock, test } from "bun:test";
import { fireEvent, screen } from "@testing-library/react";
import { addStack } from "../../store/userland/userland-store";
import {
	makeFocusCard,
	renderInRouter,
	seedCorpusFor,
	setupUserlandTest,
} from "../../test-utils";
import { CardCockpit } from "./card-cockpit";

const CARD = makeFocusCard({
	id: "base1-4",
	name: "Charizard",
	setName: "Base Set",
	cardNumber: "4",
	hp: "120",
	attacks: [{ name: "Fire Spin", cost: ["Fire"], damage: "100", text: "Discard 2 Energy." }],
});

beforeEach(async () => {
	seedCorpusFor(CARD);
	await setupUserlandTest();
});

test("Details tab shows card data; rail shows the name", async () => {
	await renderInRouter(
		<CardCockpit card={CARD} crossLinks={[]} tab="details" onTabChange={() => {}} />,
	);
	expect(screen.getByText("Fire Spin")).toBeDefined();
	// Rail name (the cockpit renders the name once, in the rail).
	expect(screen.getByRole("heading", { name: "Charizard" })).toBeDefined();
});

test("Collection tab shows the StackManager; name still present on the rail", async () => {
	await addStack("base1-4");
	await renderInRouter(
		<CardCockpit card={CARD} crossLinks={[]} tab="collection" onTabChange={() => {}} />,
	);
	expect(screen.getByRole("button", { name: /add stack/i })).toBeDefined();
	expect(screen.getByRole("heading", { name: "Charizard" })).toBeDefined();
	// Attacks (Details body) are NOT shown on the Collection tab.
	expect(screen.queryByText("Fire Spin")).toBeNull();
});

test("Pricing tab shows the pricing pane", async () => {
	await renderInRouter(
		<CardCockpit card={CARD} crossLinks={[]} tab="pricing" onTabChange={() => {}} />,
	);
	expect(screen.getByText(/market prices/i)).toBeDefined();
});

test("clicking the Collection tab calls onTabChange('collection')", async () => {
	const onTabChange = mock((_: string) => {});
	await renderInRouter(
		<CardCockpit card={CARD} crossLinks={[]} tab="details" onTabChange={onTabChange} />,
	);
	fireEvent.click(screen.getByRole("tab", { name: "Collection" }));
	expect(onTabChange.mock.calls[0][0]).toBe("collection");
});

test("unowned card shows 'Add to Vault' on the rail across tabs", async () => {
	await renderInRouter(
		<CardCockpit card={CARD} crossLinks={[]} tab="pricing" onTabChange={() => {}} />,
	);
	expect(screen.getByRole("button", { name: /add to vault/i })).toBeDefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/components/card/card-cockpit.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

Create `src/components/card/card-cockpit.tsx`. The rail reuses the holo hero + identity pattern from `card-collection-manager.tsx:124-166`; `CollectionButton` is the one from `card-detail.tsx:114-162` adapted so "Manage Collection" switches to the Collection tab.

```tsx
import { ClientOnly } from "@tanstack/react-router";
import { Layers } from "lucide-react";
import type { CSSProperties } from "react";
import { Badge } from "@/components/ui/badge";
import { GlassPanel } from "@/components/ui/glass";
import { cn } from "@/lib/utils";
import type { CardTab } from "../../lib/card-route";
import type { FocusCardData } from "../../server/card-mappers";
import { useIsOwned } from "../../store/userland/selectors";
import { addStack } from "../../store/userland/userland-store";
import { getCardAccent, getReadableAccent } from "../../utils/card-colors";
import { StackManager } from "../collection/stack-manager";
import { HoloCard, holoCardProps } from "../holo-card";
import { CardCrossLinks, type CrossLink } from "../islands/cross-links";
import { CardInfo, describeCard } from "./card-info";
import { CardPricingTab } from "./card-pricing-tab";
import { CardTabs } from "./card-tabs";
import { toHoloCardData } from "./to-holo";

const ID_BASE = "card";

export function CardCockpit({
	card,
	crossLinks,
	tab,
	onTabChange,
	pending,
}: {
	card: FocusCardData;
	crossLinks: CrossLink[];
	tab: CardTab;
	onTabChange: (t: CardTab) => void;
	pending?: boolean;
}) {
	const holo = toHoloCardData(card);
	const accent = getReadableAccent(getCardAccent(card.types));
	const variants = holo.variants;
	return (
		<div className="@container" style={{ "--accent": accent } as CSSProperties}>
			{/* Header: breadcrumb + tabs */}
			<div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-5 py-3 @3xl:px-6">
				<span className="font-mono text-[11px] uppercase tracking-[0.14em] text-(--ink-muted)">
					{card.setName} · #{card.cardNumber}
				</span>
				<CardTabs tab={tab} onChange={onTabChange} idBase={ID_BASE} />
			</div>

			{/* Body: persistent rail + swappable pane */}
			<div className="flex flex-col gap-6 p-5 @3xl:flex-row @3xl:items-start @3xl:gap-8 @3xl:p-6">
				{/* Rail (persistent) */}
				<div className="shrink-0 @3xl:sticky @3xl:top-6">
					<div className="flex w-full flex-col gap-4 @3xl:w-[200px]">
						<ClientOnly
							fallback={<img src={card.imageUrl} alt={card.name} className="w-full rounded-xl" />}
						>
							<HoloCard {...holoCardProps(card)} size="focus" className="w-full" />
						</ClientOnly>
						<div className="flex flex-col gap-1.5">
							<h2 className="font-display text-[22px] font-semibold leading-tight text-(--ink)">
								{card.name}
							</h2>
							<div className="font-display text-sm text-(--ink-muted)">
								{describeCard(card)}
							</div>
							<div className="flex items-center gap-2">
								{card.hp ? (
									<span className="font-mono text-[12px] text-(--ink-muted)">
										<b className="text-(--primary)">{card.hp}</b> HP
									</span>
								) : null}
								{card.rarity ? <Badge variant="default">✦ {card.rarity}</Badge> : null}
							</div>
						</div>
						<CollectionButton cardId={card.id} onManage={() => onTabChange("collection")} />
					</div>
				</div>

				{/* Pane (swaps per tab) */}
				<div
					role="tabpanel"
					id={`${ID_BASE}-panel-${tab}`}
					aria-labelledby={`${ID_BASE}-tab-${tab}`}
					className="min-w-0 flex-1"
				>
					{tab === "details" ? (
						<CardInfo
							card={card}
							showHeader={false}
							pending={pending}
							footer={<CardCrossLinks links={crossLinks} />}
						/>
					) : tab === "collection" ? (
						<GlassPanel className="min-w-0 overflow-hidden p-5">
							<StackManager cardId={card.id} variants={variants} />
						</GlassPanel>
					) : (
						<CardPricingTab card={card} pending={pending} />
					)}
				</div>
			</div>
		</div>
	);
}

function CollectionButton({ cardId, onManage }: { cardId: string; onManage: () => void }) {
	const owned = useIsOwned(cardId);
	const base = cn(
		"flex w-full items-center justify-center gap-2 rounded-(--r-control) py-3 min-h-[44px]",
		"font-mono text-[13px] tracking-[0.04em] transition-colors",
		"border border-white/15 text-(--ink) hover:border-white/30 cursor-pointer",
	);
	if (owned) {
		return (
			<button type="button" onClick={onManage} aria-label="Manage Collection" className={base}>
				<Layers className="h-4 w-4 shrink-0" aria-hidden="true" />
				Manage Collection
			</button>
		);
	}
	return (
		<button
			type="button"
			onClick={() => void addStack(cardId)}
			className={cn(
				"w-full rounded-(--r-control) py-2.5 text-center font-mono text-[13px] tracking-[0.04em] transition-colors",
				"border border-white/15 text-(--ink) hover:border-white/30",
			)}
		>
			＋ Add to Vault
		</button>
	);
}
```

(Verify `useIsOwned` is imported from the path `card-detail.tsx` used: `../../store/userland/selectors`. Verify `StackManager`'s props are `{ cardId, variants }` per `stack-manager.tsx`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/components/card/card-cockpit.test.tsx`
Expected: PASS.

- [ ] **Step 5: Lint, typecheck, commit**

```bash
bunx biome check --write --config-path=. src/components/card/card-cockpit.tsx src/components/card/card-cockpit.test.tsx
bunx tsc -b
git add src/components/card/card-cockpit.tsx src/components/card/card-cockpit.test.tsx
git commit -m "feat(card-cockpit): persistent rail + 3-tab pane shell"
```

---

### Task 6: Wire the overlay + routes to `CardCockpit`

**Files:**
- Modify: `src/components/islands/card-overlay.tsx`, `src/components/islands/card-modal.tsx`, `src/components/islands/card-modal.test.tsx`, `src/routes/$series/$set/$card.tsx`, `src/routes/$series/$set/$card_.manage.tsx`
- Create: `src/routes/$series/$set/$card_.prices.tsx`

**Interfaces:**
- Consumes: `CardCockpit` (Task 5); `cardTabLinkPropsFor` (Task 1).
- Produces: `CardModal` prop changes from `manage?: boolean` to `tab: CardTab`. Cold routes navigate to real sibling routes on tab change (push); the overlay uses `cardTabLinkPropsFor` + `replace`.

- [ ] **Step 1: Rewrite the CardModal test for the cockpit**

Replace `src/components/islands/card-modal.test.tsx` with cockpit-based assertions:

```tsx
// card-modal.test.tsx
import { beforeEach, expect, test } from "bun:test";
import { screen } from "@testing-library/react";
import {
	makeFocusCard,
	renderInRouter,
	seedCorpusFor,
	setupUserlandTest,
} from "../../test-utils";
import { CardModal } from "./card-modal";

const CARD = makeFocusCard({
	id: "base1-4",
	name: "Charizard",
	setName: "Base Set",
	cardNumber: "4",
	attacks: [{ name: "Fire Spin", cost: ["Fire"], damage: "100", text: "Discard 2." }],
});

beforeEach(async () => {
	seedCorpusFor(CARD);
	await setupUserlandTest();
});

test("renders the cockpit with a tablist", async () => {
	await renderInRouter(
		<CardModal card={CARD} crossLinks={[]} onClose={() => {}} tab="details" />,
	);
	expect(screen.getByRole("tablist")).toBeDefined();
	expect(screen.getByRole("tab", { name: "Details" }).getAttribute("aria-selected")).toBe("true");
});

test("tab='details' shows the Details body", async () => {
	await renderInRouter(
		<CardModal card={CARD} crossLinks={[]} onClose={() => {}} tab="details" />,
	);
	expect(screen.getByText("Fire Spin")).toBeDefined();
});

test("tab='pricing' shows the pricing pane", async () => {
	await renderInRouter(
		<CardModal card={CARD} crossLinks={[]} onClose={() => {}} tab="pricing" />,
	);
	expect(screen.getByText(/market prices/i)).toBeDefined();
	expect(screen.queryByText("Fire Spin")).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/components/islands/card-modal.test.tsx`
Expected: FAIL (`CardModal` still takes `manage`, renders the slide track, no tablist).

- [ ] **Step 3: Rewrite `CardModal`**

Replace the slide-track body of `src/components/islands/card-modal.tsx` with a single `CardCockpit`. Change `manage?: boolean` to `tab: CardTab`; derive `onTabChange` as a replace-navigate via `cardTabLinkPropsFor`.

```tsx
import { useRouter } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { type CardTab, cardRouteParams, cardTabLinkPropsFor } from "../../lib/card-route";
import type { FocusCardData } from "../../server/card-mappers";
import { useSlugIndex } from "../../store/corpus/corpus-runtime";
import { CardCockpit } from "../card/card-cockpit";
import type { CrossLink } from "./cross-links";

interface CardModalProps {
	card: FocusCardData;
	crossLinks: CrossLink[];
	onClose: () => void;
	tab: CardTab;
	pending?: boolean;
}

export function CardModal({ card, crossLinks, onClose, tab, pending }: CardModalProps) {
	const router = useRouter();
	const slugIndex = useSlugIndex();
	const p = slugIndex ? cardRouteParams(slugIndex, card) : null;

	const onTabChange = (next: CardTab) => {
		if (!p) return;
		void router.navigate({ ...cardTabLinkPropsFor(p, next), replace: true });
	};

	return (
		<Dialog open onOpenChange={(o) => !o && onClose()}>
			<DialogContent aria-describedby={undefined} className="max-w-4xl overflow-hidden p-0 sm:max-w-4xl">
				<DialogTitle className="sr-only">{card.name}</DialogTitle>
				<div className="max-h-[90vh] overflow-y-auto">
					<CardCockpit
						card={card}
						crossLinks={crossLinks}
						tab={tab}
						onTabChange={onTabChange}
						pending={pending}
					/>
				</div>
			</DialogContent>
		</Dialog>
	);
}
```

- [ ] **Step 4: Update `CardOverlay` to read `cardTab`**

In `src/components/islands/card-overlay.tsx`: replace the `cardManage` selector with a `cardTab` selector, and pass `tab` to `CardModal`.

```tsx
	const cardTab = useRouterState({
		select: (s) => s.location.state.cardTab,
	});
	// …
	return (
		<CardModal
			card={card}
			crossLinks={detail?.crossLinks ?? []}
			tab={cardTab ?? "details"}
			pending={pending}
			onClose={() => router.history.back()}
		/>
	);
```

(Remove the old `cardManage` selector. `CardTab` is inferred from the `tab` prop type; no extra import needed if you pass the literal default.)

- [ ] **Step 5: Point the routes at `CardCockpit`**

`$card.tsx` — render the cockpit with a `tab="details"` and a tab-change handler that pushes to the real sibling routes:

```tsx
import { CardCockpit } from "../../../components/card/card-cockpit";
import type { CardTab } from "../../../lib/card-route";
// …
function CardPage() {
	const { card, crossLinks } = Route.useLoaderData();
	const params = Route.useParams();
	const navigate = useNavigate();
	// …addRecentlyViewed effect unchanged…

	const ROUTE: Record<CardTab, "/$series/$set/$card" | "/$series/$set/$card/manage" | "/$series/$set/$card/prices"> = {
		details: "/$series/$set/$card",
		collection: "/$series/$set/$card/manage",
		pricing: "/$series/$set/$card/prices",
	};
	const onTabChange = (tab: CardTab) =>
		void navigate({ to: ROUTE[tab], params });

	return (
		<div className="mx-auto w-full max-w-4xl overflow-y-auto px-4 py-6">
			<div className="mb-3">
				<Link
					to="/$series/$set"
					params={{ series: params.series, set: params.set }}
					search={LIST_SEARCH_DEFAULTS}
					className="text-sm text-muted-foreground hover:text-foreground"
				>
					← {card.setName}
				</Link>
			</div>
			<div className="rounded-2xl border border-white/10 bg-(--bg)">
				<CardCockpit card={card} crossLinks={crossLinks} tab="details" onTabChange={onTabChange} />
			</div>
		</div>
	);
}
```

`$card_.manage.tsx` — same shell, `tab="collection"`, `crossLinks={[]}` (the manage loader returns `{ card }`; `crossLinks` is unused on this tab):

```tsx
import { CardCockpit } from "../../../components/card/card-cockpit";
import type { CardTab } from "../../../lib/card-route";
// …
function ManagePage() {
	const { card } = Route.useLoaderData();
	const params = Route.useParams();
	const navigate = useNavigate();
	const ROUTE: Record<CardTab, "/$series/$set/$card" | "/$series/$set/$card/manage" | "/$series/$set/$card/prices"> = {
		details: "/$series/$set/$card",
		collection: "/$series/$set/$card/manage",
		pricing: "/$series/$set/$card/prices",
	};
	return (
		<div className="mx-auto w-full max-w-4xl overflow-y-auto px-4 py-6">
			<div className="rounded-2xl border border-white/10 bg-(--bg)">
				<CardCockpit
					card={card}
					crossLinks={[]}
					tab="collection"
					onTabChange={(tab) => void navigate({ to: ROUTE[tab], params })}
				/>
			</div>
		</div>
	);
}
```

Create `src/routes/$series/$set/$card_.prices.tsx` mirroring manage with `tab="pricing"`:

```tsx
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { CardCockpit } from "../../../components/card/card-cockpit";
import type { CardTab } from "../../../lib/card-route";
import { getCardForRouteFn } from "../../../server/corpus-server";

export const Route = createFileRoute("/$series/$set/$card_/prices")({
	loader: async ({ params }) => {
		const result = await getCardForRouteFn({
			data: { series: params.series, set: params.set, card: params.card },
		});
		if (!result) throw notFound();
		return result;
	},
	component: PricesPage,
});

function PricesPage() {
	const { card, crossLinks } = Route.useLoaderData();
	const params = Route.useParams();
	const navigate = useNavigate();
	const ROUTE: Record<CardTab, "/$series/$set/$card" | "/$series/$set/$card/manage" | "/$series/$set/$card/prices"> = {
		details: "/$series/$set/$card",
		collection: "/$series/$set/$card/manage",
		pricing: "/$series/$set/$card/prices",
	};
	return (
		<div className="mx-auto w-full max-w-4xl overflow-y-auto px-4 py-6">
			<div className="rounded-2xl border border-white/10 bg-(--bg)">
				<CardCockpit
					card={card}
					crossLinks={crossLinks}
					tab="pricing"
					onTabChange={(tab) => void navigate({ to: ROUTE[tab], params })}
				/>
			</div>
		</div>
	);
}
```

(The TanStack route tree is generated; booting `bun run dev` once regenerates `routeTree.gen.ts` to include the new `/prices` route — it is gitignored. See Step 7.)

- [ ] **Step 6: Run tests + typecheck**

Run: `bun test src/components/islands/card-modal.test.tsx && bunx tsc -b`
Expected: PASS / no type errors. (`card-detail.test.tsx` and `card-collection-manager.test.tsx` still pass — those components are untouched here and deleted in Task 7.)

- [ ] **Step 7: Boot the dev server to regenerate the route tree, then verify**

```bash
bun run dev   # regenerates routeTree.gen.ts (includes /prices); Ctrl-C after it boots
```

Verify in Claude Preview (port per `.claude/launch.json`): open a card overlay from the grid → three tabs, card stays left, switching tabs swaps the right pane and never reloads the holo art; cold-load `/$series/$set/$card/prices` shows the Pricing tab. Capture a screenshot.

- [ ] **Step 8: Lint, commit**

```bash
bunx biome check --write --config-path=. \
  src/components/islands/card-overlay.tsx \
  src/components/islands/card-modal.tsx \
  src/components/islands/card-modal.test.tsx \
  src/routes/$series/$set/$card.tsx \
  src/routes/$series/$set/$card_.manage.tsx \
  src/routes/$series/$set/$card_.prices.tsx
git add src/components/islands/card-overlay.tsx src/components/islands/card-modal.tsx src/components/islands/card-modal.test.tsx "src/routes/\$series/\$set/\$card.tsx" "src/routes/\$series/\$set/\$card_.manage.tsx" "src/routes/\$series/\$set/\$card_.prices.tsx"
git commit -m "feat(card): wire overlay + routes to CardCockpit; add /prices route"
```

---

### Task 7: Retire `CardDetail` + `CardCollectionManager`; clean-cut `cardManage`

**Files:**
- Delete: `src/components/card/card-detail.tsx`, `src/components/card/card-detail.test.tsx`, `src/components/collection/card-collection-manager.tsx`, `src/components/collection/card-collection-manager.test.tsx`
- Modify: `src/lib/card-route.ts`, `src/lib/card-route.test.ts`

**Interfaces:**
- Removes: `HistoryState.cardManage`, the transitional dual-write in `cardTabLinkPropsFor`. No runtime consumer of `cardManage` remains after Task 6.

- [ ] **Step 1: Confirm nothing imports the retired components**

Run: `grep -rn -e "card-detail" -e "CardDetail" -e "card-collection-manager" -e "CardCollectionManager" src --include="*.ts*"`
Expected: only the four files being deleted reference them. If any other file does, fix it (it should already be on `CardCockpit` from Task 6).

- [ ] **Step 2: Delete the retired files**

```bash
git rm src/components/card/card-detail.tsx src/components/card/card-detail.test.tsx \
       src/components/collection/card-collection-manager.tsx src/components/collection/card-collection-manager.test.tsx
```

- [ ] **Step 3: Remove the transitional `cardManage`**

In `src/lib/card-route.ts`:
1. Delete the `cardManage?: boolean` line from the `HistoryState` block (keep `cardTab`).
2. In `cardTabLinkPropsFor`, delete the `cardManage: tab === "collection"` line and its comment.

In `src/lib/card-route.test.ts`: delete the old `describe("cardManageLinkPropsFor", …)` block that asserts `state.cardManage` (the new `describe("cardTab on the three tab helpers", …)` block from Task 1 covers the helpers). Keep the `cardRouteProps` block.

- [ ] **Step 4: Run the full card-route test + typecheck + broad test sweep**

```bash
bun test src/lib/card-route.test.ts
bunx tsc -b
bun test
```
Expected: PASS, no type errors, full suite green. (`tsc -b` now confirms no lingering `cardManage` references.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/card-route.ts src/lib/card-route.test.ts
git commit -m "refactor(card): retire CardDetail/CardCollectionManager; drop cardManage state"
```

---

## Self-Review

**Spec coverage:**
- Persistent rail + tabs swap pane → Task 5 (`CardCockpit`). ✓
- `cardTab` state, three masked routes, `cardTabLinkPropsFor` + `cardPricesLinkPropsFor` → Task 1. ✓
- Identity-vs-data split via `CardInfo` `showHeader` → Task 2 + Task 5 (rail). ✓
- Fresh tablist (`role="tablist"` + roving focus) → Task 3. ✓
- Pricing minimal (prices + coming-soon scaffold), prices removed elsewhere → Task 4 (pane) + Task 5 (Details footer = cross-links only; Collection = StackManager only) + Task 7 (old prices deleted with their components). ✓
- Overlay + routes wiring, new `/prices` route → Task 6. ✓
- Retire `CardDetail` + `CardCollectionManager`, clean-cut `cardManage` → Task 7. ✓
- Crossfade, not slide: the cockpit renders only the active pane (no slide track). A CSS opacity crossfade keyed on `tab` is optional polish; functionally the pane simply swaps. The spec's "crossfade" is satisfied by the no-slide swap; add `transition-opacity` on the panel if desired during dev-server verification.
- a11y: tablist semantics + `role="tabpanel"`/`aria-labelledby` on the pane (Task 5), `motion-reduce:` on any added transition, `ClientOnly` holo fallback retained. ✓
- Testing: `card-route`, `card-info`, `card-tabs`, `card-pricing-tab`, `card-cockpit`, `card-modal` covered. Route-level rendering is verified in the dev server (Task 6 Step 7) — consistent with the repo having no automated route tests.

**Placeholder scan:** No "TBD"/"handle edge cases"/"similar to" — every code step shows the code. ✓

**Type consistency:** `CardTab`, `cardTabLinkPropsFor(p, tab)`, `CardCockpit({card, crossLinks, tab, onTabChange, pending})`, `CardTabs({tab, onChange, idBase})`, `CardPricingTab({card, pending})`, `CardInfo({…, showHeader})`, `describeCard(card)` are used identically across tasks. `CardModal` prop is `tab: CardTab` from Task 6 onward; `CardOverlay` passes `cardTab ?? "details"`. ✓

## Notes / risks

- `StackManager` props are assumed `{ cardId, variants }` per `stack-manager.tsx`; confirm in Task 5 Step 3 before writing the JSX.
- `useIsOwned` import path (`../../store/userland/selectors`) is copied from `card-detail.tsx`; confirm.
- The cockpit renders only the active pane, so the heavy `HoloCard` (in the rail) is the only thing kept mounted across tab switches — exactly the intended zero-remount win.
- Route tree (`routeTree.gen.ts`) is gitignored and regenerated by the dev server; the new `/prices` route only resolves after a `bun run dev` boot (Task 6 Step 7).
