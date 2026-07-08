# Card Cockpit — 3-tab card page redesign

Date: 2026-06-27
Status: approved (design), pending spec review
Branch: `c/great-volhard-21b8ba`

## Summary

Reorganize the card-specific page/overlay from today's **two-face horizontal
slide** (detail ↔ collection-manager) into a **three-tab cockpit**:

1. **Details** (default) — the card's printed data.
2. **Collection** — stack management.
3. **Pricing** — price data (minimal now, built out later).

This is a reorganization, not a visual overhaul. The Liquid Glass visual
language stays. The decided architecture: **the card art is a persistent rail on
the left; the tabs swap only the right-hand content pane.** The card is the
subject; the tabs are lenses on it.

## Motivation

- Today's detail face and manager face **both already** put card-art-left,
  content-right (`card-detail.tsx`: art left / `CardInfo` right;
  `card-collection-manager.tsx`: holo hero left / `StackManager` right). The
  three-tab cockpit is the natural generalization of a layout that is already
  half-built.
- Prices currently render in **two** places (the Details footer via
  `CardPrices`, and the Collection-manager left column). A dedicated Pricing tab
  gives price data a single home and a place to grow.
- The persistent rail keeps the expensive `HoloCard` (a `ClientOnly`-gated holo
  render) **mounted once**. Per-tab layouts would re-mount or move it on every
  tab switch, causing flicker. One rail = zero remount.

## The decided question: card stays left

**Decision: the card art is a persistent left rail across all three tabs. Tabs
swap only the right content pane.**

Rejected alternative — *per-tab content* (each tab owns a full-bleed layout, the
card appears/moves/disappears): loses the anchored-hero mental model, re-mounts
the holo render, and adds motion jank. The only argument for it is per-tab
width, which is a non-issue (see below).

Width check: rail is ~190px. Inside the `max-w-4xl` (896px) dialog that leaves
~650px for the content pane — enough for the future price chart. The cold-load
route has even more width. If Pricing ever genuinely needs full-bleed, add an
explicit expand affordance then (YAGNI for now).

Accepted tradeoff: the Details info column is ~190px narrower than today.
Abilities/attacks/flavor text wrap fine at ~650px.

## Identity vs. data split (resolves the de-duplication question)

The rail and the Details pane must not both render the card name. Clean division:

- **Rail owns identity** (persistent across all tabs): holo art, **name**,
  `set · # · type`, **HP**, **rarity** badge, and the collection control
  (Add to Vault / Owned). Identity stays on screen on every tab — switching to
  Collection or Pricing never hides what card you're looking at.
- **Details pane owns card data**: abilities, attacks, rules, flavor, stat strip
  (weakness / resistance / retreat / illustrator), and cross-links. No name, no
  set/rarity header (the rail owns those), no prices (Pricing owns those).

Mechanism: `CardInfo` gains a `showHeader?: boolean` prop (default `true`, so the
cold-load standalone use is unchanged). When `false` (cockpit Details pane), it
suppresses its top identity block — the `set · #`, name + HP, descriptor +
rarity rows (`card-info.tsx:186-214`) — and renders only abilities onward. The
rail renders identity independently (it does not reuse `CardInfo`'s header). We
chose the prop over extracting a `CardInfoHeader` component: one boolean is less
churn than a new component + import rewiring, and nothing else needs the header
standalone.

## Current architecture (what we're changing)

| File | Role today |
|------|-----------|
| `src/lib/card-route.ts` | History-state link helpers. `HistoryState` augments `cardOverlay?: string` + `cardManage?: boolean`. `cardModalLinkPropsFor` (detail), `cardManageLinkPropsFor` (manager). Masks URL to `/$series/$set/$card` or `/.../manage`. Helper signature: `(p: CardRouteParams) => LinkProps`. |
| `src/components/islands/card-overlay.tsx` | Reads `cardOverlay` + `cardManage` from router state (`:44-46`), hydrates card (optimistic corpus → RPC detail), renders `CardModal` with `manage` prop. |
| `src/components/islands/card-modal.tsx` | Dialog + 2-panel horizontal slide track (`:97-141`). `manage` prop drives `translateX(-100%)`. Each panel owns scroll; off-screen panel gets `aria-hidden`+`inert`. |
| `src/components/card/card-detail.tsx` | Detail face. `@container` flex: art + `CollectionButton` left, `CardInfo` right. Prices via `CardInfo`'s `footer` slot. `PriceGhost` shimmer when `pending`. |
| `src/components/card/card-info.tsx` | Identity header (`:186-214`), abilities, attacks, rules, flavor, stat strip, `footer` slot. |
| `src/components/islands/card-prices.tsx` | Renders `buildPriceLines(card)` (TCGplayer + Cardmarket) in a `GlassPanel`. |
| `src/components/collection/card-collection-manager.tsx` | Manager face. Own sticky top bar (`:83-111`), 2-col body: holo hero + meta + prices left (`:124-177`), `StackManager` right (`:181`). |
| `src/components/collection/stack-manager.tsx` | Standalone. Stack list + add/merge/remove. |
| `src/routes/$series/$set/$card.tsx` | Cold-load detail route. `onManage` pushes to `/manage`. |
| `src/routes/$series/$set/$card_.manage.tsx` | Cold-load manager route. `onBack` navigates to detail. |

## Target architecture

### 1. Navigation model

Replace the boolean `cardManage` with a tri-state tab token. **Clean cut** —
nothing external persists this history state, so no alias/back-compat is kept.

- `card-route.ts`: define and export `export type CardTab = "details" |
  "collection" | "pricing"`.
- `HistoryState` module augmentation: **remove** `cardManage?: boolean`,
  **add** `cardTab?: CardTab`. Default when absent = `"details"`.
- Tab → masked route:
  - `details` → `/$series/$set/$card`
  - `collection` → `/$series/$set/$card/manage` (keep the existing route file)
  - `pricing` → `/$series/$set/$card/prices` (**new** route file)
- One private helper backs all three (no duplication):
  `cardTabLinkPropsFor(p: CardRouteParams, tab: CardTab): LinkProps` — sets
  `cardOverlay`, sets `cardTab`, masks to the tab's route, preserves `search`.
  The three named helpers delegate to it:
  - `cardModalLinkPropsFor(p)` → `cardTabLinkPropsFor(p, "details")`
  - `cardManageLinkPropsFor(p)` → `cardTabLinkPropsFor(p, "collection")`
  - `cardPricesLinkPropsFor(p)` → `cardTabLinkPropsFor(p, "pricing")` (**new**,
    same `(p: CardRouteParams) => LinkProps` signature as the other two)
- Tab switches use `replace: true` (no history growth — identical to today's
  detail↔manage switching). Dialog X / browser back closes the overlay and
  returns to the origin grid/vault. Existing back-closes-overlay behavior is
  preserved.

### 2. `CardCockpit` — one shared shell

New `src/components/card/card-cockpit.tsx`. Single implementation used by BOTH
the overlay (`card-modal.tsx`) and the three cold-load routes — same sharing
strategy that `CardDetail` uses today.

```
┌─ header ───────────────────────────────────────────────┐
│  Base Set · #4        [ Details | Collection | Pricing ] │   (overlay: Dialog's X)
├─ body grid [190px  minmax(0,1fr)] ─────────────────────┤
│  ┌ rail (persistent) ┐   ┌ pane (swaps per tab) ──────┐ │
│  │ HoloCard hero      │   │  active tab content        │ │
│  │ name               │   │                            │ │
│  │ set · # · type     │   │                            │ │
│  │ HP · rarity badge  │   │                            │ │
│  │ [Add to Vault /    │   │                            │ │
│  │  Owned badge]      │   │                            │ │
│  └────────────────────┘   └────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

- **Props:** `{ card: FocusCardData; crossLinks: CrossLink[]; tab: CardTab;
  onTabChange: (tab: CardTab) => void; pending?: boolean }`.
- **Header:** `set · #` breadcrumb (mono) left, the `CardTabs` control right. No
  back pill — the overlay supplies the Dialog's own close X; each cold-load
  route supplies normal page-chrome back navigation.
- **Rail (persistent, never unmounts):** `HoloCard` hero (`ClientOnly` + `<img>`
  fallback, `size="focus"`), then name, `set · # · type`, HP, rarity `Badge`,
  and the collection control (`CollectionButton` — reused as-is from
  `card-detail.tsx`). `sticky` on the side-by-side breakpoint.
- **Pane:** renders the active tab (see §4). Crossfade (opacity) transition, NOT
  a horizontal slide. The rail is static; only the pane content changes. All
  three panes mount? **No** — only the active pane renders (cheaper; the holo
  render that needed persistence lives in the rail, not the panes). A short
  opacity crossfade keyed on `tab`, guarded by `motion-reduce:`.
- **`@container`** drives collapse: below the side-by-side breakpoint the rail
  stacks above the pane (same behavior `card-detail.tsx` has today).

### 3. `CardTabs` — the tab control

New `src/components/card/card-tabs.tsx`. **Built fresh** as a proper tablist —
the existing `SegmentedControl` (`stack-edit-form.tsx`) and `ToggleGroup`
(`islands/toggle-group.tsx`) are single-select pill groups but neither
implements `role="tablist"` roving focus, so we don't retrofit them. `CardTabs`
borrows the SegmentedControl **visual** (active pill =
`bg-(--primary) text-(--primary-ink)`) with correct semantics:

- `role="tablist"`; each option `role="tab"`, `aria-selected`, roving `tabIndex`
  (active = 0, others = -1), arrow-key navigation moves selection.
- Each tab carries `id` + `aria-controls` pointing at its pane; the pane is
  `role="tabpanel"` with matching `aria-labelledby`.
- Props: `{ tab: CardTab; onChange: (tab: CardTab) => void }`. Three fixed
  options. Sentence-case labels, no terminal punctuation.

### 4. Tab contents (rendered by the cockpit pane)

- **Details** → `<CardInfo card={card} showHeader={false} pending={pending}
  footer={<CardCrossLinks links={crossLinks} />} />`. Header suppressed (rail
  owns identity). **Prices removed** — the footer holds only cross-links. The
  old `PriceGhost` shimmer is **removed from Details**; price-loading shimmer now
  belongs to the Pricing tab.
- **Collection** → `<GlassPanel><StackManager cardId={card.id}
  variants={variants} /></GlassPanel>`. `StackManager` is already standalone and
  is rendered **directly** by the cockpit — no wrapper component needed. The
  manager's old sticky top bar and left holo/meta/prices column are gone (the
  cockpit header + rail own those).
- **Pricing** → new `src/components/card/card-pricing-tab.tsx`. Concrete
  structure now:
  ```tsx
  <div className="flex flex-col gap-4">
    <section> {/* "Market prices" */}
      {pending ? <PriceGhost /> : <CardPrices card={card} />}
    </section>
    <section aria-label="Price history">
      {/* labeled empty-state scaffold — no real chart yet */}
      <GlassPanel> Price history — coming soon </GlassPanel>
    </section>
  </div>
  ```
  `PriceGhost` moves here from `card-detail.tsx` (it owns price-loading shimmer
  now). The "coming soon" sections are static labeled empty states, not charts.

### 5. Overlay + routes wiring

`onTabChange` is `(tab: CardTab) => void`. Each surface binds it to a navigate:

| Surface | binds `onTabChange` to | nav mode |
|---------|------------------------|----------|
| `card-modal.tsx` (overlay) | `router.navigate({ ...cardTabLinkPropsFor(p, tab), replace: true })` | replace (modal stays one history entry) |
| `$card.tsx` (cold) | `router.navigate(cardTabLinkPropsFor(p, tab))` | push |
| `$card_.manage.tsx` (cold) | same push navigate | push |
| `$card_.prices.tsx` (cold) | same push navigate | push |

Per-file changes:

- `card-overlay.tsx`: read `cardTab` (default `"details"`) from router state
  instead of `cardManage`; pass `tab` (not `manage`) to `CardModal`.
- `card-modal.tsx`: drop the 2-panel slide track (`:97-141`) and the `manage`
  prop; accept `tab: CardTab`; render one `CardCockpit` inside the `Dialog` with
  `onTabChange` = replace-navigate. `handleManage`/`handleBack` are removed
  (replaced by the single `onTabChange`). Dialog stays `max-w-4xl
  overflow-hidden p-0`; the cockpit owns internal scroll (pane scrolls, rail
  `sticky`).
- `$card.tsx`: render `CardCockpit` with `tab="details"`; `onTabChange` =
  push-navigate. Replaces today's `CardDetail` + `onManage`.
- `$card_.manage.tsx`: render `CardCockpit` with `tab="collection"`.
- `$card_.prices.tsx` (**new**, mirrors `$card_.manage.tsx`): same
  `getCardForRouteFn` loader, render `CardCockpit` with `tab="pricing"`.

## Components touched

**New**
- `src/components/card/card-cockpit.tsx`
- `src/components/card/card-tabs.tsx`
- `src/components/card/card-pricing-tab.tsx`
- `src/routes/$series/$set/$card_.prices.tsx`
- `cardPricesLinkPropsFor` + private `cardTabLinkPropsFor` + `CardTab` type in
  `card-route.ts`

**Modified**
- `src/lib/card-route.ts` — `CardTab` type; `HistoryState` swap (`-cardManage`,
  `+cardTab`); three helpers delegate to `cardTabLinkPropsFor`.
- `src/components/islands/card-overlay.tsx` — read `cardTab`, pass `tab`.
- `src/components/islands/card-modal.tsx` — slide track → single `CardCockpit`;
  `manage` prop → `tab`.
- `src/components/card/card-info.tsx` — add `showHeader?: boolean` (default
  `true`); skip identity block (`:186-214`) when `false`.
- `src/routes/$series/$set/$card.tsx`, `$card_.manage.tsx` — render cockpit.

**Retired (deleted)**
- `src/components/card/card-detail.tsx` — its layout is absorbed by
  `CardCockpit`; `CollectionButton` moves into the rail (relocate the export
  into `card-cockpit.tsx` or a small sibling). `PriceGhost` moves to
  `card-pricing-tab.tsx`.
- `src/components/collection/card-collection-manager.tsx` — the cockpit's
  Collection pane renders `StackManager` directly; the top bar + left column are
  no longer needed.

**Unchanged (reused as-is)**
- `src/components/collection/stack-manager.tsx`, `stack-edit-form.tsx`,
  `stack-row.tsx`.
- `src/components/islands/card-prices.tsx`, `src/lib/price-lines.ts`,
  `buildPriceLines`.
- `HoloCard`, `to-holo.ts`, `card-colors.ts`, `CardCrossLinks`.

## Decisions (confirmed with user; hedges resolved)

1. **Pricing tab is minimal now** — existing price lines + a marked "coming
   soon" scaffold. No charts/history yet.
2. **Prices leave Details and Collection entirely** — single home in Pricing.
   The rail shows **no** prices.
3. **Rail shows the collection control on every tab** — Add-to-Vault / Owned is
   the card's primary action; it belongs on the persistent rail.
4. **Crossfade between tabs, not slide** — rail static, only the pane
   transitions; only the active pane renders.
5. **Narrow/mobile:** rail stacks above the pane (`@container` collapse).
6. **Routed tabs, not local `useState`** — preserves deep-link / cold-load /
   shareable `/prices` URL, consistent with the existing `/manage` route.
7. **De-dup via `CardInfo` `showHeader` prop** (not header extraction); rail owns
   identity, Details owns card data.
8. **Clean cut from `cardManage` to `cardTab`** (no alias); single
   `cardTabLinkPropsFor` backs the three named helpers.
9. **`CardTabs` is a fresh tablist** (SegmentedControl visual + real
   `role="tablist"` semantics), not a reuse of the existing pill groups.
10. **`CardDetail` and `CardCollectionManager` are deleted**; the cockpit
    absorbs their roles.

## Accessibility

- Tab control: `role="tablist"`, arrow-key roving focus, `aria-selected`, each
  tab `aria-controls` its pane; the pane is `role="tabpanel"` with matching
  `aria-labelledby`. Built fresh because neither existing pill primitive
  provides tablist roving focus.
- All motion (crossfade, hover lift) guarded by `motion-reduce:`.
- The persistent rail's holo render keeps the `ClientOnly` + `<img>` fallback
  for SSR / no-JS.
- Dialog keyboard semantics unchanged (focus trap, Esc to close, back closes).

## Testing

Bun runner + happy-dom. Pre-seed corpus
(`useCorpusRuntime.setState({ index: buildIndex([...]) })`) in any test that
renders the cockpit so `loadCorpus` early-returns (no network).

- `card-route.test`: `cardPricesLinkPropsFor` masks to `/prices` and sets
  `cardTab: "pricing"`; all three helpers set the right tab token via
  `cardTabLinkPropsFor`; `search` is preserved; `cardManage` no longer in state.
- `card-cockpit.test`: default tab is Details; `onTabChange` fires with the
  right token per tab; the rail (holo + name + HP + rarity + collection control)
  renders on all three tabs; prices render ONLY under Pricing; the active
  `tabpanel` is the only one exposed to AT; `@container` collapse leaves the rail
  above the pane.
- `card-tabs.test`: arrow-key navigation moves selection; `aria-selected` and
  roving `tabIndex` track the active tab; `aria-controls`/`aria-labelledby` link
  each tab to its pane.
- `card-info.test`: `showHeader={false}` suppresses the identity block but keeps
  abilities/attacks/flavor/stat strip; default (`true`) renders the header.
- Route smoke: `$card_.prices.tsx` cold-loads with the Pricing tab active.
- Test churn: the existing `card-modal` test adapts to the cockpit (no slide
  track, `tab` prop); the `card-collection-manager` test is removed and its
  coverage folds into `card-cockpit.test`'s Collection-pane assertions.

## Implementation order (one plan, sequenced)

1. `card-route.ts` — `CardTab` type, `HistoryState` swap, `cardTabLinkPropsFor`
   + three delegating helpers. (Unit-testable in isolation.)
2. `CardInfo` `showHeader` prop.
3. `CardTabs` (tablist) + `CardPricingTab`.
4. `CardCockpit` (rail + header + pane switch), composing 2–3.
5. Wire `card-overlay.tsx`, `card-modal.tsx`, and the three routes; add
   `$card_.prices.tsx`.
6. Delete `card-detail.tsx` + `card-collection-manager.tsx`; relocate
   `CollectionButton` and `PriceGhost`.
7. Tests + typecheck + lint; verify the overlay and all three cold-load routes
   in the dev server.

## Non-goals

- No real price charts, history, or sales feed yet (Pricing scaffold only).
- No change to the Liquid Glass tokens or visual language.
- No change to `StackManager` internals, the corpus, or the holo renderer.
- No currency-picker UI (USD-only stays).
```
