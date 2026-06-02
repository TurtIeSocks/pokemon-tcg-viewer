# User-land Roadmap

**Date:** 2026-06-02
**Foundation spec:** [`specs/2026-06-02-userland-foundation-design.md`](specs/2026-06-02-userland-foundation-design.md)

The goal: make this **the** hub for Pokémon TCG collectors to track a collection in an organized way — local-first now, with a clean seam to a hosted database (possibly a paid tier) later.

Everything below sits on the **foundation** (per-copy data model + repository port + corpus join + import/export engine). Each layer is its own spec → plan → implement cycle. The foundation deliberately ships only thin/interim UI so these layers own the taste-heavy decisions.

## Status legend

`[ ]` not started · `[~]` in progress · `[x]` done

## Layer 0 — Foundation `[ ]`

Per-copy `CollectionItem` + `Goal` model; IDB-backed `CollectionRepo`/`GoalsRepo`/`BackupRepo` behind a port; non-persisted Zustand cache hydrated from the repo; corpus join (`byId` + `hydrateCard`); versioned import/export engine + minimal backup buttons; migrate existing call sites; clean break (no migration). **Must land before any layer below.**

## Recommended sequence

```
0 Foundation
└─ 1 Copy Manager (per-copy CRUD UI)   ← replaces interim destructive toggle
   └─ 2 Themed hub + IA/rename          ← the home that hosts everything
      ├─ 3 Set grid (X/Y overlays)
      ├─ 4 Card grid + multi-sort
      ├─ 5 Collection Goals UI
      ├─ 6 Bulk add (search/set/series → collection &/or goal)
      ├─ 7 Owned / not-owned filter on set pages   (independent, tiny)
      └─ 8 Import/export polish
```

Layers 3–8 are largely independent once 1 and 2 land; reorder by appetite. Layer 7 is small and depends only on the foundation's owned index — it can jump the queue.

---

## Layer 1 — Copy Manager (per-copy CRUD UI) `[ ]`

**Adds:** the real interaction for the per-copy model — add a copy, edit a copy's fields (acquiredAt, pricePaid, variant, notes, raw condition **or** grading company+grade), delete a copy; view all copies of a card. Replaces the foundation's **interim destructive toggle** (owned → remove-all).

**Depends on:** foundation (store actions + `useOwnedIndex`).

**Open questions to brainstorm:** where editing happens (inline popover on the card vs a copy-list panel in card detail vs a modal); the raw/graded toggle UX; condition enum copy/labels; the grading company picklist (PSA/BGS/CGC/TAG/SGC + "Other"); how the card-grid "+" affordance reads once a card has N copies (badge + count, opens manager).

## Layer 2 — Themed hub + IA / rename `[ ]`

**Adds:** rename "Collection" → a TCG-themed hub (candidate: **Binder** / "My Binder"; alternatives to explore), a landing page tying together set grid + card grid + goals + backup, and nav placement (sidebar + toolbar).

**Depends on:** foundation; benefits from 1.

**Open questions:** the name; landing-page composition (summary stats? recent acquisitions? quick links?); route structure (`/binder`, `/binder/sets`, `/binder/cards`, `/binder/goals`); nav entry treatment.

## Layer 3 — Set grid (X/Y owned overlays) `[ ]`

**Adds:** a grid of sets (like the card grid but set tiles) with an owned-count overlay per set, e.g. `13/120`. Count = distinct owned cardIds in the set ÷ `set.total`.

**Depends on:** foundation (`useOwnedIndex`), `sets` slice.

**Open questions:** tile design (reuse `set-tile`/booster art?); sort/group (by series? by completion %?); progress visualization (text vs ring/bar); click-through target (set page, optionally pre-filtered to owned).

## Layer 4 — Full card grid + multi-sort `[ ]`

**Adds:** a grid of all owned cards with sort by **set → set#**, **date acquired**, **price paid**, **year released**; asc/desc. Handles a card with multiple copies (expand into N copies, or aggregate with a count + per-copy drill-in).

**Depends on:** foundation (`useOwnedCardViews`, join), 1 for editing.

**Open questions:** copy expansion vs aggregation in the grid; sort behavior when the key is per-copy (e.g. sort by pricePaid when a card has 3 prices — min? each copy as a row?); default sort; where sort/asc-desc controls live; virtualization (reuse react-virtuoso grid).

## Layer 5 — Collection Goals UI `[ ]`

**Adds:** create/edit/delete goals; a **target picker** to add sets, series, or individual cards; a goal display page showing per-target progress (set→owned/total, series→owned/total, card→owned?) and overall (deduped across overlapping targets).

**Depends on:** foundation (`GoalsRepo`, `useOwnedIndex`).

**Open questions:** target-picker UX (search/add from anywhere); goal page layout (per-target cards reusing the set-grid overlay style); overall-progress definition surfaced to the user; master-set vs base-set counting for set/series targets (variants); goal cover art / ordering; whether goals are shareable later.

## Layer 6 — Bulk add `[ ]`

**Adds:** "add all" from a search result, a set, or a series → into the collection and/or a goal in one action.

**Depends on:** foundation (`bulkAddCopies`, goals), reuses corpus query results.

**Open questions:** dedupe policy (skip cards already owned? add another copy?); default per-copy fields for bulk (likely all unset except acquiredAt); confirm/preview step for large adds; entry points (button on set/series/search headers); add-to-goal target selection.

## Layer 7 — Owned / not-owned filter on set pages `[ ]`

**Adds:** a filter on the existing set page (and likely series/search) to show only **owned** or **not owned** cards.

**Depends on:** foundation (`useOwnedIndex`). Small; independent.

**Open questions:** where the toggle lives in `SearchControls`; whether it's a tri-state (all/owned/missing); URL search-param persistence (existing `validateListSearch` pattern).

## Layer 8 — Import / export polish `[ ]`

**Adds:** a proper home for backup (settings/hub), merge-vs-replace prompt UX, clear validation-error surfacing, optional per-goal or per-set export, maybe drag-drop import.

**Depends on:** foundation (engine + schema already exist).

**Open questions:** merge semantics surfaced to the user; partial export scopes; export format additions (e.g. include a human-readable manifest); versioning policy when the schema grows (`schemaVersion` bumps + import upgraders).

---

## Cross-cutting future work (not yet specced)

- **Remote adapter + auth + sync** — the `RemoteRepo` behind the port; the possible paid tier. Drop-in by design; no feature rewrites expected.
- **Variants / master-set semantics** — a consistent model for "do reverse-holo / 1st-ed count as separate completion targets?" touches layers 3, 5, and the `variant` field.
- **Stats / value** — collection value (needs price data join), spend over time, P&L from `pricePaid`. Natural once the card grid + price join exist.
