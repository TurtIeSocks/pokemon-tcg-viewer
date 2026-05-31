# Home hero redesign — design

- **Date:** 2026-05-30
- **Branch:** `design-revamp`
- **Status:** Approved (chosen via visual-companion mockups)

## Context

The first Home was a lone search box on an empty page — sparse and awkward. Via visual
mockups the user picked **direction B (search hero over a holo backdrop)** with **alignment A
(centered column, recents left-aligned within it)**. This redesigns `src/pages/home.tsx`
accordingly. Everything else (toolbar, sidebar, browse) is unchanged.

## Design

A single centered max-width column (`mx-auto`, ~`max-w-2xl`) holding a hero and, below it, the
recents — so the whole thing reads as one centered column even though the recents content is
left-aligned.

### Hero (centered)

- **Backdrop:** a few decorative holo-card shapes (CSS holo gradient, the app's
  `--holo` colors), tilted at varying angles, low opacity (~0.15), gently drifting
  (vertical float, staggered delays). **Decorative/CSS only for v1** — no data fetch.
  **Respects `prefers-reduced-motion`** (no drift when reduced). A soft radial holo glow
  sits behind them.
- **Logo:** `logo-64.png` (the app mark), ~56px.
- **Title:** "Pokémon TCG Holo Playground".
- **Tagline:** "Search the catalog · admire the holo".
- **Search:** the existing `SearchInput` (autofocus), constrained width (~`max-w-md`), centered.
- **Quick-pick chips:** a curated list of popular Pokémon — `Pikachu`, `Charizard`, `Eevee`,
  `Mewtwo`, `Gengar`. Click sets `?q=<name>` (runs that search). Centered row.

### Below the hero (same column, left-aligned, separated by a top border)

- **Recent searches:** chip row from `useRecentsStore().recentSearches`; click sets `?q=<chip>`;
  a "Clear" affordance calls `clearRecentSearches`. Hidden when empty.
- **Recently viewed:** a horizontal `HoloCard` strip from `useRecentsStore().recentlyViewed`
  (cards ~`width: 96px`); click → `/card/:id`; overflow scrolls horizontally. Hidden when empty.
- **Empty first visit:** only the hero + chips show (no recents sections, no hint line needed —
  the chips give an obvious next action).

## Components / files

- **Rewrite** `src/pages/home.tsx` — the hero + recents column described above. Reuses
  `SearchInput` (src/components/search-bar/search-input.tsx), `useRecentsStore`
  (src/store/recents.ts), `HoloCard` (src/components/holo-card), `useNameQueryParam`
  (for chip → query), `useNavigate` (recently-viewed → card).
- **Add** a `float-card` keyframe to `src/app.css` (keyframes can't be inline Tailwind). Apply via
  an arbitrary `animate-[float-card_…]` utility on the backdrop cards, gated with
  `motion-reduce:animate-none`.
- **Popular list:** a small `POPULAR_POKEMON` constant (in `home.tsx`).

## Testing

- Visual-verify in preview: hero centered with drifting backdrop, chips run searches, recents
  appear/left-align when present and hide when empty, reduced-motion stops the drift.
- Light render test (optional): `home.test.tsx` — chips render and a chip click updates the `q`
  param; seeded recents render. (Recents store logic is already unit-tested.)

## Out of scope / future

- **Data-driven backdrop** (real holo cards from the newest set or recently-viewed) — v1 uses
  decorative CSS shapes; swapping in real card art is a later enhancement.
- No changes to search/scope/filters/sidebar/toolbar.
