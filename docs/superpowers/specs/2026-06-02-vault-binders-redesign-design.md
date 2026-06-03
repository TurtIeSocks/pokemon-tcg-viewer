# Vault → Binders redesign (PR #9 follow-up batch)

**Date:** 2026-06-02
**Status:** Approved design — ready for implementation plan
**Scope:** 12-item follow-up batch from PR #9. Rename Goals→Binders, hybrid smart-rule/manual binder model, snapshot sharing, sidebar nav, modal + form redesigns, sets-tab fixes, and several small bug fixes.

---

## 1. Context

The Vault (collection + goals) lives in `src/store/userland/` (local-first, DB-ready, per-copy model — see CLAUDE.md). PR #9 shipped goals/targets, a copy-manager modal, and a sets tab. This batch reworks that surface based on user feedback.

**No data migration.** Solo user, no other consumers. The new code uses a fresh IndexedDB `binders` store; the old `goals` store is discarded. No migration code, no back-compat.

---

## 2. Decisions log (from brainstorming Q&A)

| # | Decision |
|---|----------|
| Binder model | **Hybrid**: membership = `(⋃ rules ∪ includeCardIds) − excludeCardIds`. Smart rules (living queries) + manual pins + manual exclusions. |
| Rule builder UX | **No separate surface.** Browse on existing Sets/Search/Pokédex pages; an extended bulk-add dropdown captures either the live query (smart rule) or explicit cards (manual). |
| Share mechanism | **Client-side URL hash** — `/vault/shared#b=<base64url(deflate(json))>`. Zero server. |
| Share contents | **Per-share toggle** `Include condition & grades` + **scope** `All / Owned / Needed`. `pricePaid` + `notes` NEVER shared. Snapshot is **frozen** (resolved member list, not live rules) with a mandatory "snapshot from {date}" banner. |
| Sidebar | **Collapsible VAULT group**, auto-open on `/vault/*`, children Cards / Sets / Binders. Remove top-right Vault button + in-vault tab row. |
| Filter extension | **Release-year range only** (`yearMin/yearMax`), surfaced on the Search page. `dexNumber` + facets + `OwnedMode` already exist in the engine. |
| Series rule dim | **Out of scope** (YAGNI — no user story, no browse surface). |

---

## 3. Data model

`src/store/userland/types.ts`:

```ts
/** A serializable membership query — the subset of CorpusQuery that defines
 *  WHICH cards qualify (excludes display-only: owned mode, view, sort, relevance). */
export interface SerializedQuery {
  text: string | null;
  setId: string | null;
  dexNumber: number | null;
  types: string[];
  rarities: string[];
  supertypes: string[];
  subtypes: string[];
  yearMin: number | null;   // NEW dim (release year, inclusive)
  yearMax: number | null;   // NEW dim (release year, inclusive)
}

export interface BinderRule {
  id: string;               // crypto.randomUUID()
  query: SerializedQuery;   // re-applied live against the corpus
}

/** Replaces Goal. Hybrid membership. */
export interface Binder {
  id: string;
  name: string;
  description: string | null;
  rules: BinderRule[];
  includeCardIds: string[];  // manual pins (no live link)
  excludeCardIds: string[];  // manual exclusions (win over rules + includes)
  createdAt: number;
  updatedAt: number;
}
```

`GoalTarget` discriminated union is **deleted**. `Goal` → `Binder`.

### Membership computation (`binder-progress.ts`, was `goal-progress.ts`)

```
members(binder, index, setsById) =
  let fromRules = ⋃ over binder.rules of queryCorpus(index, toCorpusQuery(rule.query), setsById)
  let ids = new Set([...fromRules.map(c=>c.id), ...binder.includeCardIds])
  for id of binder.excludeCardIds: ids.delete(id)
  return ids   // resolved cardId set; total = ids.size; owned = ids ∩ ownedCardIdSet
```

`toCorpusQuery(SerializedQuery): CorpusQuery` maps fields, defaults `relevance:false`.

---

## 4. Corpus query extension — release year

`src/store/corpus/corpus-engine.ts`:
- `CorpusQuery` gains `yearMin?: number | null; yearMax?: number | null`.
- `queryCorpus` predicate: join `setsById.get(card.setId)?.releaseDate`, parse 4-digit year, skip card if outside `[yearMin, yearMax]` (treat null bounds as open).

`src/lib/card-query.ts`:
- `ListSearch` gains `yearMin`/`yearMax` (or a `{from,to}` pair). `buildCorpusQuery` forwards them.

`src/lib/list-search.ts`: URL ser/de for the new params (omit when null).

`src/components/islands/search-controls.tsx`: add a compact **release-year range** control (two number inputs `From`/`To`, or a min/max). Search page only (per decision C).

---

## 5. Store + repo changes (`src/store/userland/`)

- `repo.ts`: `GoalsRepo`→`BindersRepo` (`list/create/update/remove/clear` over `Binder`). `NewGoal`/`GoalPatch`→`NewBinder`/`BinderPatch`.
- `idb-repo.ts`: `goalsStore`→`bindersStore`. `fillBinder()` defaults `rules:[], includeCardIds:[], excludeCardIds:[]`.
- `userland-store.ts`:
  - **#1 auto-primary** — in `addCopy` (or repo `add`): if no existing copy shares `cardId`, set `isPrimary:true`. On `removeCopy`: if the removed copy was primary and ≥1 copy of that card remains, promote the earliest-`createdAt` survivor (`setPrimaryCopy`). Atomic with the delete.
  - Binder actions: `createBinder`, `updateBinder`, `removeBinder`, `addCardsToBinder(binderId, cardIds[])` (union into `includeCardIds`), `addRuleToBinder(binderId, query)`, `removeRule`, `addExclusion`/`removeManualCard`.
- `selectors.ts`: `useGoalProgress`→`useBinderProgress`; add `useBinderMembers(binderId)` (resolved cardId set + owned/total).
- `backup.ts` / `UserDataSnapshot`: `goals`→`binders`.

---

## 6. Bulk-add flow (#10, #11)

`src/components/vault/bulk-add-menu.tsx` — extend dropdown to **3 items**:

1. `Add {x} to collection`
2. `Add {x} cards to binder ▸` → submenu: each binder + `＋ New binder…`. Writes `includeCardIds`. No live link.
3. `Add smart rule to binder ▸` → submenu: each binder + `＋ New binder…`. Captures the current page query as a `BinderRule`. **Disabled** (greyed + tooltip "Clear your selection to save a rule") when cards are selected. Inline caption under the item: *"Matching cards always appear in this binder, including ones from future sets."*

`{x}` = selected-card count when in select mode with a selection; else the total matching count of the current view.

The captured query comes from the page's current `ListSearch` + context (`setId`/`dexNumber`), stripped of display-only fields (`owned`, `view`, `sort`).

**`＋ New binder…`** opens the binder form (Section 9) pre-targeted, then completes the add.

### Select mode

`Select cards` toggle button in the same toolbar (where "Add all" was). When on:
- card hover-transform disabled;
- the collection-add hover overlay hidden;
- clicking a card toggles a large semi-transparent ✓ overlay (selected state);
- the bulk-add dropdown operates on the selection; smart-rule item disabled.

Selection state lives in the grid island; cleared on toggle-off and on navigation.

**#11**: delete the old `TargetPicker` CommandDialog entirely (its X read as "clear search" but exited the modal). Any remaining in-field search input uses an in-field `×` that clears text only; modal close is a separate, labeled control.

---

## 7. Binders list + detail (#3)

- `src/routes/vault/binders/index.tsx` (was `goals/index.tsx`): grid of binder cards — name, `ProgressBar` (owned/total), counts (n rules · m manual), share icon, `New binder` button.
- `src/routes/vault/binders/$binderId.tsx` (new): detail view —
  - header: name, description, edit/delete, **Share** button;
  - rule chips (human label via formatter; removable);
  - manual cards section;
  - full member grid (owned color / missing b&w) reusing the owned/missing view;
  - progress summary.
  Adding members happens from browse pages; this view manages/removes + shares.

**Rule label formatter** (`src/lib/binder-rule-label.ts`): `SerializedQuery → string`, e.g. `{subtypes:[Full Art],supertypes:[Trainer]}` → `"Full Art · Trainer"`; `{rarities:[Rare Holo],yearMax:1999}` → `"Rare Holo · before 2000"`; `{setId}` → set name; `{dexNumber:151}` → species name (join corpus) → `"Mew"`.

---

## 8. Sharing (#4)

`src/store/userland/share.ts` (new):
- `BinderSnapshot` = `{ v:1, name, description, sharedAt, scope:"all"|"owned"|"needed", cards: Array<{ cardId; owned; condition?; grade? }> }`.
- `encodeSnapshot(snap): string` → `base64url(deflate(JSON))` (use `fflate` or `CompressionStream`; pick at plan time).
- `decodeSnapshot(hash): BinderSnapshot` → inverse + validation guard.
- `buildSnapshot(binder, members, ownedIndex, {scope, includeGrades})`: resolve members; filter by scope (`owned` → owned only; `needed` → missing only; `all` → both); per card set `owned`, and if `includeGrades` attach best copy's `condition`/`grade`. **Never** include `pricePaid`/`notes`.

`src/components/binders/share-dialog.tsx`: scope segmented control (`All / Owned / Needed`) + `Include condition & grades` switch + generated link + copy button + a note that it's a frozen snapshot.

`src/routes/vault/shared.tsx` (new, hash-only — no server loader): decode `window.location.hash`, `useEnsureCorpus`, render name/description + **prominent banner** "📸 Snapshot from {date} — not live", and the card grid (owned color / missing b&w; condition/grade badges if present). Read-only; no write to viewer's vault.

---

## 9. Modal redesigns + form fixes (#2, #8, #9)

Apply `ui-ux-pro-max` rules: visible labels with proper spacing, error below field, `role="alert"`/`aria-live`, escape routes, ≥44px targets, focus rings, 150–300ms transitions. Respect existing dark theme + gold accent (`#e0b341`) — do not override the palette.

### Copy-manager (#2) — `src/components/collection/`
- Each copy = a **tile** (not a thin expandable row): card thumbnail + badges (variant, condition/grade, price), a filled-**star Primary** toggle, and an explicit **Edit (pencil)** button that reveals the inline editor (replaces the undiscoverable expand-to-edit).
- Primary copy visually distinct (gold ring / filled star).
- Sticky **bottom action bar with a `Done` button** (keep the corner X for a11y, but the footer button is the obvious exit).
- `+ Add copy` prominent; `Remove all copies` destructive, visually separated.

### Binder form (#8) — `src/components/binders/binder-form-dialog.tsx`
- shadcn `Field` / `FieldGroup` / `FieldLabel` / `FieldDescription` / `FieldError` from the registry — proper label↔input spacing, helper text, error below field. Fields: Name (required), Description (optional). Bottom Cancel / Save.

### Form error fix (#9)
- Shared `fieldErrorText(e): string = e?.message ?? String(e)` — TanStack Form + Zod issues are objects; `String(issue)` was producing `[object Object]`. Apply in copy-edit-form + binder form. Errors get `role="alert"`.
- Pull the shadcn `field` component family from the registry (bring in more components as needed per the user's instruction).

---

## 10. Sets tab + vault-set-detail (#6)

`src/components/shell/set-tile.tsx`:
- **Fix horizontal scroll**: `w-full max-w-full`, image `object-contain`, grid `repeat(auto-fill, minmax(…, 1fr))` so tiles never exceed track width.
- **Bigger status badge**: foreground a chunky `{owned}/{total}` (large tabular-nums) + progress bar as the tile's hero element (no packaging art available).

`src/routes/vault/sets.tsx`:
- **Default to owned sets only** (sets with ≥1 owned card); add `Owned sets / All sets` toggle to reveal the rest.
- Tiles link to **`/vault/sets/$set`** (vault-set-detail), NOT the global set page.

`src/routes/vault/sets/$set.tsx` (new): all cards in the set in set order (by `number`), owned in color / missing b&w-filtered, with the `All | Owned | Missing` view toggle.

**Owned/missing toggle** already exists (`OwnedMode` in `search-controls`). Ensure it's present on the global set page + reused on vault-set-detail + the shared view; align wording to `All | Owned | Missing`.

---

## 11. Sidebar nav (#7)

`src/components/islands/sidebar-collapsible.tsx`: insert a collapsible **VAULT** group between Home and "Series & Sets" — children `Cards` (`/vault`), `Sets` (`/vault/sets`), `Binders` (`/vault/binders`). Auto-expand when on `/vault/*`; highlight active child.

`src/components/shell/app-toolbar.tsx`: remove the top-right `Vault` button (keep About + repo link).

`src/routes/vault.tsx`: remove the in-vault tab nav row (lines ~37–59). Keep `VaultHeader`. **#5 scrollbar**: move `overflow-y-auto` to a full-width outer wrapper (scrollbar at viewport edge); put `max-w-7xl mx-auto px-4` on an inner content div so content stays centered/padded.

---

## 12. Edge cases

- Binder with zero members → progress shows 0/0, empty-state copy in detail.
- Smart rule matching 20k cards → membership is a Set scan; fine (already done in goal-progress).
- Excluded card that no rule/include covers → no-op (still stored; harmless).
- Deleting the last copy of a primary card → no primary needed (card no longer owned).
- Share URL too long → warn if encoded length exceeds a safe threshold (~30k chars) and suggest narrowing scope.
- `/vault/shared` with malformed/old hash → friendly "couldn't read this shared binder" state.
- Select mode + navigation → clear selection.

---

## 13. Testing strategy

Bun + happy-dom. Pre-seed corpus (`useCorpusRuntime.setState({ index: buildIndex([...]) })`) in any test rendering a grid (no network — CLAUDE.md).

- `binder-progress.test.ts`: membership union/include/exclude math; year-range rule; dex rule; owned/total.
- `share.test.ts`: encode→decode round-trip; scope filtering (all/owned/needed); grade inclusion toggle; price/notes never present; frozen (no live recompute).
- `userland-store.test.ts`: auto-primary on first copy; primary promotion on delete.
- `corpus-engine.test.ts`: year-range predicate.
- `binder-rule-label.test.ts`: formatter cases.
- Component tests: bulk-add dropdown 3 items + disabled smart-rule when selected; select-mode overlay; copy tile edit reveal + Done button; binder-form error renders message (not `[object Object]`); set-tile no overflow; sidebar VAULT group.

---

## 14. Out of scope (YAGNI)

- Data migration (no other users).
- Series as a query dimension.
- Server-stored share links / revoke / expiry.
- "Import shared binder into my vault."
- Per-share QR codes, social previews.

---

## 15. File-by-file change map (summary)

**Rename/edit:** `types.ts`, `repo.ts`, `idb-repo.ts`, `userland-store.ts`, `selectors.ts`, `goal-progress.ts`→`binder-progress.ts`, `backup.ts`, `card-rows.ts`, `corpus-engine.ts`, `card-query.ts`, `list-search.ts`, `search-controls.tsx`, `set-tile.tsx`, `app-toolbar.tsx`, `sidebar-collapsible.tsx`, `vault.tsx`, `bulk-add-menu.tsx`, `copy-manager*.tsx`, `copy-edit-form.tsx`.
**New:** `share.ts`, `binder-rule-label.ts`, `share-dialog.tsx`, `binder-form-dialog.tsx`, `routes/vault/binders/$binderId.tsx`, `routes/vault/sets/$set.tsx`, `routes/vault/shared.tsx`, shared `fieldErrorText` util.
**Delete:** `target-picker.tsx`, `goal-form-dialog.tsx` (replaced), `routes/vault/goals/*` (→ binders).
