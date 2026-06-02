# Card Detail Redesign — Design

**Date:** 2026-06-01
**Status:** Approved (visual direction signed off via brainstorming visual companion)
**Supersedes the presentation layer of:** `2026-05-03-phase-2-card-focus-view-design.md` (data/route mechanics unchanged)

## Problem

The card detail modal (`$series/$set/$card` → `CardModal`) is visually incoherent: a flat
`space-y-5` info dump on the right, oversized attack boxes, energy cost as plain text,
weakness/resist/retreat as throwaway gray lines, prices as wrapping `<p>` links, and a
dark floating "overlay" box of cross-links shoved into normal flow. The card art is small
with large dead space beneath it. Theme purple fights the per-card type colors. No
typographic personality (system-ui only).

## Goals

- One cohesive aesthetic: **refined "spec sheet"** — serif headlines + monospace data, calm negative space, hairline rules, per-card type-color accent.
- Card art is the hero: larger, in a full-height framed plate, balanced against the info column.
- Structured, scannable info: energy as icons, attacks as ledger rows with rules captions, stats in one strip, prices + cross-links as a quiet pinned footer.
- Generalize to all supertypes (Pokémon / Trainer / Energy) and to wordy cards.
- Stay a route-driven modal. Keep prices uncacheable (island/ClientOnly). Keep the holo card + collection behavior.

## Non-goals

- No change to routing, loaders, data fetching, `FocusCardData`, cross-link derivation, OG/meta, or the holo/tilt engine.
- No change to the card grid, search, or any other route.
- Not redesigning the price-source logic (only its presentation).

## Visual Direction (locked)

"Spec Sheet": Newsreader (serif) headlines, JetBrains Mono for all data (kicker, HP,
damage, stats, prices, links). Near-black panel `#0d0d0f`, bone text, hairline dividers
`rgba(255,255,255,.07)`. **Accent = the card's primary type color** (`getTypeColor(types[0])`),
applied to HP/damage numerals, energy discs, owned-button, link hover, and a faint frame glow.

### Layout — desktop (≥ `md`)

Two columns, `flex; align-items: stretch` (info column drives height):

- **Left — card plate** (`flex:0 0 auto`): full-height framed backdrop (subtle radial type-tint + 1px border). Inside, a **sticky** wrapper (`position:sticky; top:<pad>`) holding the `HoloCard` (`size="focus"`, ~220px wide) and, below it, a full-width **collection button**. On tall cards the card pins and rides the scroll instead of floating in a tall empty plate.
- **Right — info column** (`flex:1; display:flex; flex-direction:column`):
  - **kicker** (mono caps): `{setName} · #{cardNumber} · {rarity}` (set total is not in `FocusCardData`; out of scope to add to the mapper).
  - **header** (`display:flex; align-items:baseline; justify-content:space-between`): name (serif, ~40px, weight 300) + HP unit on the baseline (`<b>{hp}</b> HP`, number in accent). HP omitted when absent.
  - **descriptor** (serif, muted): `{supertype} · {subtypes}`, plus `Evolves from {evolvesFrom}` and `· {type}` when present.
  - **body** (`flex:1 1 auto` — grows to bottom-align the footer):
    - `Abilities` section (if any): each = keyword badge (`a.type`, e.g. Poké-Power/Poké-Body/Ability) + name (serif) + rules caption (mono).
    - `Attacks` section (if any): each row = `top` line [name (serif) + inline energy discs … damage (mono, accent)] + rules caption (mono) underneath. No box; hairline top border per row.
    - `Rules` section (Trainer/Energy or ex-rules): rules lines as mono captions.
  - **bottom group** (`flex:0 0 auto`, pinned to card-frame bottom):
    - **stat strip** (mono caps): `Weak {…}` · `Resist {…}` · `Retreat {discs|n}` · `Illus. {artist}` — only the present fields.
    - **prices** (island, mono): `**$94.75** market · TCGplayer ↗` · `**€17.22** avg · Cardmarket ↗`.
    - **cross-links** (mono, muted, `→` prefix): inline links, hover → accent. Replaces the floating overlay box.

### Layout — mobile (< `md`)

Single column stack: card plate (centered, ~180px) → collection button (full width) →
kicker → header → descriptor → body → stat strip → prices → links. Sticky **disabled**
(card scrolls normally). Prices stack vertically.

## Component Architecture

Follow repo conventions: component-only `.tsx` files; non-component exports in sibling
`.ts`; `interface` for object shapes; split if a file passes ~500 lines.

| File | Change | Purpose |
|---|---|---|
| `src/components/card/energy-icon.tsx` | **new** | `EnergyIcon({ type, size? })` → colored disc + white glyph SVG. `aria-label={type}`. |
| `src/components/card/energy-glyphs.ts` | **new** | Glyph path map for the 11 energy types + fallback. (Non-component data, kept out of the `.tsx`.) |
| `src/components/card/card-info.tsx` | **new** (replaces `CardMeta`) | The info column: kicker, header, descriptor, body (abilities/attacks/rules), bottom group. Small internal `AttackRow` / `AbilityRow` / `StatStrip` components; split into `card/` subfiles only if it crosses ~500 lines. |
| `src/components/card/card-detail.tsx` | **delete** | `CardMeta` replaced by `card-info.tsx`; `CardDetail` (full-route) is dead code (zero importers). |
| `src/components/islands/card-modal.tsx` | **rewrite** | New plate + info two-column layout; sets `--accent` from card type; sticky card + collection button; renders `CardInfo`, `CardPrices`, `CardCrossLinks`. |
| `src/components/islands/card-prices.tsx` | **restyle** | Mono presentation matching the footer (logic + `ClientOnly` unchanged). |
| `src/components/islands/cross-link-overlay.tsx` → `cross-links.tsx` | **replace** | `CardCrossLinks({ links })` inline mono `→` links. Keep the `CrossLink` interface. Remove the floating/backdrop-blur styling. |
| `src/utils/card-colors.ts` | **extend** | Add `getCardAccent(types?)` (primary type color, else neutral gold `#c9a86a`) and `getReadableAccent(hex)` (oklch lightness clamp so dark types stay legible as numerals — see A11y). |
| `src/app.css` | **extend** | `@font-face` (serif + mono), `--font-serif`/`--font-mono` tokens in `:root` + `@theme inline`, base body keeps system; headings/data opt in via utilities. |
| `public/fonts/*` | **new** | Self-hosted variable woff2: Newsreader + JetBrains Mono. |
| `src/routes/__root.tsx` | **extend** | Preload the two woff2 in `head().links` (`rel:preload, as:font, type:font/woff2, crossOrigin`). |

## Fonts (self-hosted)

- Fetch the **variable** woff2 for Newsreader (italic + roman as available) and JetBrains Mono into `public/fonts/`.
- `@font-face` with `font-display: swap` and a `unicode-range` not required (Latin only is fine).
- Tokens: `--font-serif: "Newsreader", Georgia, serif;` `--font-mono: "JetBrains Mono", ui-monospace, monospace;`. Expose to Tailwind via `@theme inline { --font-serif: …; --font-mono: …; }` so `font-serif`/`font-mono` utilities work. Body default stays system-ui.
- Preload only the two critical weights/files in `__root` to avoid FOIT without over-preloading.

## Energy Icons

- `EnergyIcon` renders an 18px (default) SVG: `circle r=9 fill={getTypeColor(type)}` + white glyph `path` per type. Glyph map in `energy-glyphs.ts` for the 11 types (Grass, Fire, Water, Lightning, Psychic, Fighting, Darkness, Metal, Fairy, Dragon, Colorless) + Colorless fallback for unknowns.
- Used for: attack `cost[]` (one disc per entry) and `retreatCost[]` (one disc per entry). `aria-label` = type name; group has an accessible summary (e.g. `aria-label="Cost: Lightning, Colorless, Colorless"`).
- Glyphs are simple/flat to match the aesthetic (bolt, droplet, flame, leaf, swirl, fist, moon, gear, sparkle, dragon, star) — not the glossy official symbols.

## Accent Color + Accessibility

- `--accent` set on the modal root from `getCardAccent(card.types)`. Non-Pokémon (no types) → neutral gold `#c9a86a`.
- **Numerals legibility:** some type colors are dark (Darkness `#705848`, Fighting `#C03028`) and fail contrast as text on `#0d0d0f`. HP/damage numerals use `getReadableAccent()` — clamp oklch lightness to a floor (~`L 0.7`) so every type meets ≥4.5:1. Energy **disc fills** keep the true type color (white glyph carries contrast; disc is a shape, not text).
- Verify muted mono text (`captions`, kicker, stat strip) meets **4.5:1** on `#0d0d0f`; use a token at/above that (≈`#9b978c`+), not the `#88857b` used in mockups if it falls short.
- Energy/stat meaning never conveyed by color alone (glyph + aria-label; stat labels are text).
- Keyboard: Dialog focus trap + Esc (existing). Collection button, links, price links, close all focusable with visible focus ring (theme `--ring`).
- `prefers-reduced-motion`: no new motion beyond hover color transitions; sticky is layout, not animation.
- Touch targets ≥44px for collection button, links, close on mobile.

## States

- **Collection button:** outline + `＋ Add to collection` (not owned) → accent-filled + `✓ In collection` (owned). Driven by existing `useStore` owned map.
- **Prices:** `ClientOnly` (never SSR/cached); render nothing when no lines (no empty footer border).
- **Empty sections:** abilities/attacks/rules/stat fields render only when present (Trainer/Energy collapse gracefully; body still flex-grows so footer bottom-aligns).
- **Long cards:** card pins (sticky) within the scrolling `DialogContent`; capped by viewport via the modal's existing `max-h-[90vh] overflow-y-auto`.

## Testing

- Unit: `EnergyIcon` renders correct glyph/fill + aria-label per type incl. unknown→Colorless. `getCardAccent`/`getReadableAccent` (fallback + lightness clamp). `CardInfo` conditional sections (Pokémon vs Trainer; missing HP/types/abilities/stats).
- Existing tests for `card-colors`, `price-lines`, modal route stay green; update any snapshot/string assertions touching the old `CardMeta` markup.
- Manual (preview): Pokémon card, Trainer card, wordy card (sticky), mobile stack, dark-mode contrast, reduced-motion.

## Migration / Cleanup

- Delete `CardDetail` (dead) and `CardMeta` (replaced); remove `card-detail.tsx` once imports repoint to `card-info.tsx`.
- Remove the floating `CrossLinkOverlay`; repoint `card-modal` to `CardCrossLinks`.
- Keep `CrossLink` interface + the route's cross-link derivation unchanged.

## Out of Scope

- Card grid, search, collection page, holo engine internals, price-source logic, routing/loaders, OG meta.
