# Collapsed-Sidebar Visual Upgrade — Design

**Date:** 2026-06-07
**Status:** Approved (brainstorm)
**Area:** `src/components/shell/app-sidebar.tsx`, `src/lib/nav-tree.ts`

## Problem

When the sidebar is collapsed to its 3rem icon rail (`collapsible="icon"`), shadcn
clips every menu button to `size-8 p-2` — only a ~16px leading child survives. Today
that child is a 1.5px `NavDot`, so the collapsed rail is a column of near-invisible
dots (Vault items) and identical chevrons (series). Nothing distinguishes one row from
another; the rail reads as visual noise.

## Goal

Give every nav row a meaningful leading glyph that survives the collapse clip and also
upgrades the expanded view:

- **Vault items** get distinct lucide icons.
- **Series** get a 2-char monogram badge (e.g. `SV`, `SM`, `BW`).

Decided to live in **both** sidebar states (not collapsed-only): the glyph always sits
left of the label, so the toggle just hides the label — no jarring swap, and the
expanded rail improves too.

## Decisions (from brainstorm)

| Question | Decision |
|---|---|
| Scope | Both states — leading glyph always present; label hides on collapse. |
| Series letter rule | 2-char monogram (uniform width), not single-initial or variable fan codes. |
| Series badge color | Calm — neutral glass; violet only on the active series (matches existing nav dots). |
| Vault icons | Domain-led: Overview=`LayoutDashboard`, All cards=`Layers`, Sets=`Boxes`, Binders=`BookOpen`. |

Design-system rationale for the calm badge: the sidebar is **chrome** (Ethereal Glass
dialect → calm glass). Per-content color is reserved for **hero objects** (set/card
tiles, Liquid dialect). Spectral per-series color would borrow the hero treatment into
chrome and ~15 hues would fight the violet system, so the monogram is the identifier and
only the active-state carries violet.

There is no series-level image in the corpus — `series` is a bare string; only sets
carry `images.symbol` / `images.logo`. A 2-char letter badge is cleaner at glyph size
than an arbitrary per-set symbol, so we use letters.

## Components

### `NavGlyph` — shared leading slot

A fixed ~22px rounded slot that replaces `NavDot`, local to `app-sidebar.tsx`. Modes:

- **icon** — renders a lucide glyph (Vault rows). lucide bumped to `size-5` to fill the slot.
- **mono** — renders a 2-char monogram: calm neutral glass
  (`bg-white/5 border border-white/10`, mono font, `tabular-nums`,
  inset top-highlight to match the glass language).
- **active** prop — when true the glyph/badge goes violet (`var(--primary)`),
  identical active language for both row types and consistent with today's active dot.

The slot is each row's **first child**, so it is exactly what shadcn keeps when the
button collapses to icon size.

### Vault rows

Retire `NavDot`. Icon mapping:

| Item | Route | lucide |
|---|---|---|
| Overview | `/vault` | `LayoutDashboard` |
| All cards | `/vault/cards` | `Layers` |
| Sets | `/vault/sets` | `Boxes` |
| Binders | `/vault/binders` | `BookOpen` |

Expanded = icon + label; collapsed = icon only. Active item → violet glyph + the
existing `isActive` button chrome. Tooltips already wired (`tooltip={label}`).

### Series rows

**Monogram helper** — pure, exported from `src/lib/nav-tree.ts` (co-located with the
other nav helpers; kept out of the component file so `react-doctor`'s
`only-export-components` does not fire), unit-tested:

```ts
export function seriesMonogram(name: string): string {
  const words = name
    .split(/[^A-Za-z0-9]+/)
    .filter((w) => w && !/^(and|of|the)$/i.test(w));
  return (
    words.length >= 2
      ? words[0][0] + words[1][0]
      : (words[0] ?? name).slice(0, 2)
  ).toUpperCase();
}
```

Resulting monograms across the real series — all distinct:

`Scarlet & Violet`→SV, `Sword & Shield`→SS, `Sun & Moon`→SM, `Black & White`→BW,
`XY`→XY, `Diamond & Pearl`→DP, `HeartGold & SoulSilver`→HS, `Platinum`→PL, `EX`→EX,
`Base`→BA, `Neo`→NE, `Gym`→GY, `e-Card`→EC.

Rare collisions are possible only for obscure promo series; the existing per-row tooltip
(`tooltip={series.name}`) disambiguates. Acceptable.

**Row layout changes:**

- Leading `NavDot` → monogram `NavGlyph` (active series → violet badge).
- The disclosure `ChevronRight` moves from the leading edge to the **trailing** edge
  (standard disclosure placement), still rotating on open. Year + set-count stay as-is.
- **Collapsed click target:** sub-sets cannot render in the icon rail, so when the
  sidebar state is `collapsed` the series row renders as a `Link` to `/$series`
  (the series-overview route, confirmed to exist at `src/routes/$series/index.tsx`).
  When `expanded`, the row keeps today's `CollapsibleTrigger` toggle behavior.
  Branch on `useSidebar().state`.

## Collapsed-rail sizing

The default icon-mode button (`size-8 p-2`) leaves a 16px inner box — fine for a lucide
icon, cramped for two characters. On these specific buttons, trim the icon-mode padding
(`group-data-[collapsible=icon]:p-1!`) so the uniform ~22px glyph centers in the 48px
rail (`SIDEBAR_WIDTH_ICON = 3rem`) without clipping. Do **not** modify the shadcn
`sidebar.tsx` primitive — apply overrides via `className` on the app-sidebar buttons.
Final glyph size and mono font-size are tuned live in the preview for legibility.

## Files

- `src/components/shell/app-sidebar.tsx` — `NavGlyph`; Vault icons; series monogram
  badge; trailing chevron; collapsed series `Link`.
- `src/lib/nav-tree.ts` — `seriesMonogram` (pure export).

## Testing

- **Unit** (`seriesMonogram`): table of real series names → expected monograms; edge
  cases (single word, `XY`, hyphenated `e-Card`, stop-word filtering). Bun runner, pure,
  no network.
- **Component** (AppSidebar): renders from a `tree` prop (no `loadCorpus` fetch → no
  network). Assert Vault rows expose their icons, series rows render the monogram text,
  active row carries the violet active state, and a collapsed series row is a link to
  `/$series`.

## Out of scope

Expanded series toggle behavior (unchanged), sidebar header/footer, per-series color,
the mobile sheet (renders full labels, unaffected).
