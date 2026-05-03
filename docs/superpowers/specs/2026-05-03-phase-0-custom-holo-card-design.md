# Phase 0 — Custom HoloCard Component

**Date:** 2026-05-03
**Status:** Implemented
**Roadmap phase:** 0 of 5 (foundation for all subsequent enhancement specs)

## Context

The viewer currently renders cards via `pokemon-holo-cards` (`HoloCard`, `CardZoomModal`, `apiCardToProps`). The package is opinionated in ways we already work around — we strip `id` from props to defeat its built-in auto-fetch, and the bundled `CardZoomModal` is dead weight we don't want.

Phase 0 replaces the package with our own component. The point is **ownership and extensibility**, not visual redesign. Subsequent phases (#4 cross-mode linking, #2 card-focus route, #6 device-tilt holo, #3 pack opening, #8 lineage) all depend on being able to control hover, click, and rendering of the card primitive.

We also take this opportunity to upgrade visual fidelity to match `simeydotme/pokemon-cards-css` — the reference the upstream package was itself derived from — since we're rewriting the CSS anyway.

## Goals

1. Drop the `pokemon-holo-cards` dependency entirely.
2. Ship an internal `<HoloCard />` that visually matches simey's full rarity catalog (holo, reverse holo, cosmos, V/VMAX/VSTAR, radiant, trainer gallery, rainbow, gold/secret, etc.).
3. Expose API hooks that downstream phases need:
   - Custom `onClick` handler (no built-in modal dispatch).
   - `hoverOverlay` slot for #4's cross-mode link affordances.
   - `size` variant prop for #2's card-focus view.
   - Pointer-driven CSS custom properties on the root element so #6 can later feed `DeviceOrientationEvent` into the same rendering path.
4. Graceful fallback for unrecognized rarities (generic holo + dev-only console warning).
5. Keep the virtualized grid's per-frame perf characteristics — no React re-renders during pointer motion.

## Non-goals

- Custom click semantics beyond pass-through (#4 fills that in).
- Device-tilt input (#6).
- Per-card override JSON files (`alternate-arts.json`, `promos.json` from simey).
- Visual additions beyond simey's current rarity catalog.
- Server-side prerendering or static generation (#2 territory).
- Replacing the pokemontcg.io API client.

## Approach

### Module layout

```
src/components/holo-card/
├── index.ts            # Re-exports the public surface
├── holo-card.tsx       # The component
├── holo-card.css       # Base layout, transform, custom-property declarations
├── rarity-styles.css   # Per-rarity foil layers (ported from simey)
├── use-holo-effect.ts  # Pointer-tracking hook → CSS custom properties
├── rarity.ts           # Rarity string → CSS class map + fallback
└── types.ts            # HoloCardData type (replaces package export)
```

Foil texture assets ship in `public/holo-textures/` with attribution recorded in `public/holo-textures/CREDITS.md` (Galaxy Holo from aschefield101; backgrounds from Vecteezy — same attributions simey carries).

### Component API

```tsx
interface HoloCardProps {
  // Card data
  imageUrl: string;
  name: string;
  rarity?: string;
  subtypes?: string[];
  supertype?: string;
  setId?: string;
  cardNumber?: string;

  // Behavior
  onClick?: (e: React.MouseEvent | React.KeyboardEvent) => void;

  // Slots
  hoverOverlay?: React.ReactNode;

  // Variants
  size?: "grid" | "focus";

  // Style
  className?: string;
  style?: React.CSSProperties;
}
```

Props dropped vs. the upstream package: `id`, `apiKey`, `onFetchError`, `disableZoom`, `loadingFallback`, `errorFallback`. None are used by us; their absence makes our `imageUrl` non-optional and removes a class of error states we don't need to handle.

### `useHoloEffect` hook

Attaches `pointermove` and `pointerleave` listeners to the returned `ref`. On each event, computes percentages relative to the element's bounding rect and writes them as CSS custom properties on the element's `style`:

| Property                  | Range   | Drives                          |
|---------------------------|---------|---------------------------------|
| `--pointer-x`             | 0..100  | Foil gradient horizontal offset |
| `--pointer-y`             | 0..100  | Foil gradient vertical offset   |
| `--pointer-from-center`   | 0..1    | Foil intensity near edges       |
| `--rotate-x`              | deg     | 3D tilt around X axis           |
| `--rotate-y`              | deg     | 3D tilt around Y axis           |

The hook **never calls `setState`**. All pointer state is written directly to the DOM element's inline style. This keeps React out of the per-frame loop, which is necessary because the virtualized grid mounts dozens of `<HoloCard />` instances simultaneously.

Returns `{ ref }`. For #6 device tilt, an alternate input source will write the same custom properties from `DeviceOrientationEvent` data — the rendering layer doesn't change.

### Rarity → class mapping

```ts
// rarity.ts
const RARITY_CLASS = {
  "Rare Holo":                  "holo-basic",
  "Rare Holo V":                "holo-v",
  "Rare Holo VMAX":             "holo-vmax",
  "Rare Holo VSTAR":            "holo-vstar",
  "Reverse Holo":               "reverse-holo",
  "Radiant Rare":               "radiant",
  "Rare Rainbow":               "rainbow",
  "Rare Secret":                "gold-secret",
  "Trainer Gallery Rare Holo":  "trainer-gallery",
  // ...full simey catalog
} as const;

export function getRarityClass(rarity?: string): string {
  if (!rarity) return "no-foil";
  const cls = RARITY_CLASS[rarity as keyof typeof RARITY_CLASS];
  if (cls) return cls;
  if (import.meta.env.DEV) {
    console.warn(`[holo-card] Unknown rarity "${rarity}" — using generic holo fallback`);
  }
  return "holo-basic";
}
```

The dev-only warning is the trip wire that surfaces new TCG rarities as they ship, so we extend coverage instead of silently rendering blank cards.

### CSS structure

- **`holo-card.css`** — root frame, image positioning, 3D transform with perspective, declarations for the pointer-driven custom properties (`--pointer-x: 50;` defaults), and grid/focus size variants.
- **`rarity-styles.css`** — each rarity class adds foil layers via `::before`/`::after` pseudo-elements. Layers use `mix-blend-mode: color-dodge`, conic/radial gradients, and texture mask images. Ported faithfully from simey's `Card.svelte` rarity-specific selectors.

The two files are split along a clear axis: structure vs. decoration. Future rarity additions only touch `rarity-styles.css`.

### Migration

1. Build the new component + CSS in isolation under `src/components/holo-card/`.
2. Replace the import in [src/components/card-grid.tsx:56](src/components/card-grid.tsx) — same call shape, just a different source. Remove the `id`-stripping workaround since our component doesn't auto-fetch.
3. Remove `<CardZoomModal />` and its import from [src/app.tsx:10](src/app.tsx).
4. Inline `apiCardToProps` logic into [src/api.ts](src/api.ts) directly. It's a small mapping and lives more naturally next to the response-shape definition.
5. Remove `pokemon-holo-cards` from `package.json` dependencies.
6. `bun install`, `bun run lint`, `bun run typecheck`, `bun run build`.

## Verification

- **Visual baseline capture:** screenshot at least 5 representative cards post-migration — one each of Common, Rare Holo, Rare Holo VMAX, Reverse Holo, Rare Secret. Save under `docs/superpowers/specs/fixtures/2026-05-03-phase-0/` as the documented baseline for future visual regression checks. Visual differences from the pre-migration package are expected (we're upgrading to simey's richer effects); the check is "renders plausibly with no broken layers or missing images", not "matches the old visuals".
- **Console clean:** browse a recent Sword & Shield set and confirm zero unknown-rarity warnings in dev console.
- **Smoke render test:** unit test for `<HoloCard />` covering known rarity, unknown rarity, missing rarity, click handler, and `hoverOverlay` slot rendering.
- **Lint/typecheck/build green:** `bun run lint && bun run typecheck && bun run build` all pass.
- **Bundle didn't regress:** check Vite build output — total app JS shouldn't grow more than ~10 KB gzipped from this change. We drop the package and add equivalent code; small drift is expected, large growth is a smell.
- **Cross-browser smoke check:** open the dev server in Chrome, Safari, and Firefox; spot-check that holo effects render without obvious stacking-context bugs in each. Safari is the highest-risk target because of `mix-blend-mode` quirks.

## Open questions

None at design time. Ambiguities to resolve during implementation:

- Exact list of rarity strings simey covers — verified against his `Card.svelte` during the CSS port.
- Whether any foil texture in simey's repo is too large to ship in our `public/` folder. If a texture is over ~200 KB we'll regenerate via CSS gradient instead of bundling the asset.

## Risks

- **CSS port fidelity.** Simey's effects use combinations of `mix-blend-mode`, gradients, and masks that are sensitive to stacking context. Browser differences (especially Safari) can shift the result. Mitigation: visual smoke test on Chrome, Safari, and Firefox during implementation.
- **Texture asset size.** Galaxy holo and similar effects use large image assets. Mitigation: check sizes early; substitute CSS gradients where viable.
- **Unknown rarity strings.** The pokemontcg.io API may return rarities not in simey's catalog. Mitigation: dev warning + generic fallback, plus a follow-up issue if the warning fires for a common rarity.
