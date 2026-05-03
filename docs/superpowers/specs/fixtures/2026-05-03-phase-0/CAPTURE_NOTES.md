# Phase 0 Visual Baseline Notes

Date: 2026-05-03
Branch: `phase-0/custom-holo-card`
Verified at HEAD: `365b978` (Task 11 complete)

## What was visually verified

The new internal `<HoloCard />` was loaded in a dev server (`bun run dev` from the
phase-0 worktree) and inspected via DOM evaluation. The migration produced a
component with the expected shape:

| Property                  | Pre-migration (`pokemon-holo-cards`) | Post-migration (internal)             |
|---------------------------|--------------------------------------|---------------------------------------|
| Root classes              | `holo-card` (only)                   | `holo-card size-grid <rarity-class>`  |
| `aria-label`              | `"<Name>, <Rarity>"` (concatenated)  | `"<Name>"` (just the name)            |
| `data-rarity` attribute   | present                              | absent (we use class-based rarity)    |
| Custom properties written | `--card-opacity`, `--seedx`, `--cosmosbg`, `--background-x: 50%` (frozen) | `--pointer-x: 50`, `--pointer-y: 50`, `--rotate-x/y: 0deg`, `--pointer-from-center: 0`, `--background-x/y` driven by hook, `--pointer-from-left/top` driven by hook |
| Underlying `<img alt>`    | name (duplicates aria-label)         | empty (decorative inside labelled button) |

Sample card from Crown Zenith (Oddish, Common rarity), inspected at session time:

```
{
  "classes": ["holo-card", "size-grid", "no-foil"],
  "aria": "Oddish",
  "hasDataRarity": false
}
```

This confirms the new component path is in effect: rarity-class lookup, size
variant default, accessible name without rarity duplication, and the `no-foil`
class for plain-rarity cards. Cards with a foiled rarity (e.g. Mega Venusaur ex
in Mega Evolution, mapped to `holo-basic`) render the foil treatment from
`rarity-styles.css` against the textures in `public/holo-textures/`.

## Why no PNG fixtures yet

Automated screenshot capture from the agent harness in this session ran into
two blockers worth recording so a future capture pass can plan around them:

1. **Preview tool returns JPEGs to the agent, not the filesystem.** The
   built-in dev preview tool surfaces screenshots as inline images in the
   conversation; it doesn't expose a "save to disk" path. Useful for live
   inspection, not for committing fixtures.
2. **Playwright requires a Chrome install** at `/Applications/Google Chrome.app`
   on macOS, which wasn't present on the dev machine. Installing it would
   touch system state outside the worktree.

Per the spec, manual capture is acceptable for this baseline. To capture
screenshots manually:

1. From the worktree: `bun run dev`
2. Open the local URL in Chrome / Safari / Firefox
3. Browse to a recent set (e.g. Crown Zenith for V/VMAX, Mega Evolution for
   recent foils, or Vivid Voltage for the famous Pikachu VMAX)
4. Hover so the holo effect is mid-shine
5. Save 5 screenshots in this folder named:
   - `common.png`
   - `rare-holo.png`
   - `rare-holo-vmax.png`
   - `reverse-holo.png`
   - `rare-secret.png`

## Console verification (clean baseline)

Browsing Mega Evolution and Crown Zenith in the dev server produced **zero**
`[holo-card] Unknown rarity` warnings. The rarity map covers what the API has
returned for those sets (Common / Uncommon / Rare / Rare Holo VMAX / Double
Rare / etc.). New rarities surfacing in future TCG releases will trigger the
dev-only warning and route through the generic holo-basic fallback.

## Build / test verification at this commit

- `bun run typecheck` — zero errors
- `bun run lint` — only pre-existing `card-grid.css !important` warning
- `bun test` — 17 pass / 0 fail (sanity + rarity + use-holo-effect + holo-card)
- `bun run build` — success
- `grep -r "pokemon-holo-cards" src/` — no results
