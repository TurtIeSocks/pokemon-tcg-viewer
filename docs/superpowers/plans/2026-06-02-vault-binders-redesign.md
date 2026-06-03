# Vault → Binders Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Convention (per repo owner's rule):** Tasks give the spec, exact files, key signatures, and concrete test targets — NOT pre-baked implementation bodies. The implementer writes code via TDD from the spec + the current file contents. When touching a form, use the `tanstack-form` skill; when adding/using shadcn components, use the `shadcn` skill.

**Goal:** Rework the Vault per the PR #9 follow-up batch: rename Goals→Binders with a hybrid smart-rule/manual model, snapshot link sharing, sidebar nav, redesigned modals, and sets-tab fixes.

**Architecture:** Local-first userland store (Zustand cache over an IndexedDB repo port). Binder membership = `(⋃ rule-queries ∪ includeCardIds) − excludeCardIds`, where a rule is a serialized corpus query re-run live. Sharing encodes a frozen snapshot into a URL hash. UI reuses the existing corpus query engine, card grid, and shadcn primitives.

**Tech Stack:** TanStack Start/Router, React 19 (compiler on; manual memo kept), Zustand, TanStack Form + Zod, shadcn/ui, Tailwind v4, Bun test + happy-dom, Biome.

**Spec:** `docs/superpowers/specs/2026-06-02-vault-binders-redesign-design.md`

**No data migration** — solo user; the old IDB `goals` store is abandoned, not migrated.

---

## Execution order & parallelism

- **Phase A is a hard prerequisite** (renames + new types touch ~10 files; land it before anything else).
- After A lands: **B, F, G** are independent of **C, D, E, H** and may run in parallel pools.
- **C → D, E** (C1 produces the rule-query util + label formatter both need).
- **H0 (fieldErrorText util)** lands before D1 and H2 (both consume it).
- Verify (Phase I) last.

---

## Phase A — Data model foundation (sequential, blocks all)

### Task A1: Rename Goal→Binder; new hybrid types; repo + idb + backup

**Files:**
- Modify: `src/store/userland/types.ts`
- Modify: `src/store/userland/repo.ts`
- Modify: `src/store/userland/idb-repo.ts`
- Modify: `src/store/userland/backup.ts`
- Test: `src/store/userland/idb-repo.test.ts`, `src/store/userland/backup.test.ts`

- [ ] **Step 1 — Types.** In `types.ts`: delete `GoalTarget` and `Goal`. Add:
  ```ts
  export interface SerializedQuery {
    text: string | null; setId: string | null; dexNumber: number | null;
    types: string[]; rarities: string[]; supertypes: string[]; subtypes: string[];
    yearMin: number | null; yearMax: number | null;
  }
  export interface BinderRule { id: string; query: SerializedQuery; }
  export interface Binder {
    id: string; name: string; description: string | null;
    rules: BinderRule[]; includeCardIds: string[]; excludeCardIds: string[];
    createdAt: number; updatedAt: number;
  }
  export type NewBinder = { name: string; description?: string | null };
  export type BinderPatch = Partial<Pick<Binder, "name" | "description" | "rules" | "includeCardIds" | "excludeCardIds">>;
  ```
  Keep `CollectionItem` unchanged.
- [ ] **Step 2 — Repo port.** In `repo.ts`: `GoalsRepo`→`BindersRepo` (`list/create/update/remove/clear` over `Binder`/`NewBinder`/`BinderPatch`). Update `Repos` aggregate type + `UserDataSnapshot.goals`→`binders: Binder[]`.
- [ ] **Step 3 — IDB adapter.** In `idb-repo.ts`: rename store `goals`→`binders`; add `fillBinder(input: NewBinder): Binder` defaulting `rules:[], includeCardIds:[], excludeCardIds:[], description: input.description ?? null`, fresh `crypto.randomUUID()` + timestamps. Update `BackupRepo.exportAll/importAll` to read/write `binders`.
- [ ] **Step 4 — Tests.** Update idb-repo + backup tests for the binder shape (create defaults to empty arrays; export/import round-trips a binder with rules/include/exclude). Add a case: imported binder preserves `id`.
- [ ] **Step 5 — Run** `bun test src/store/userland/idb-repo.test.ts src/store/userland/backup.test.ts` → PASS.
- [ ] **Step 6 — Commit** `refactor(userland): Goal→Binder hybrid model (types, repo, idb, backup)`.

### Task A2: binder-progress + selectors

**Files:**
- Rename/rewrite: `src/store/userland/goal-progress.ts` → `src/store/userland/binder-progress.ts` (+ test file)
- Modify: `src/store/userland/selectors.ts`
- Modify: `src/store/corpus/corpus-engine.ts` *(only if a `toCorpusQuery` helper belongs there; otherwise keep local)*

- [ ] **Step 1 — `toCorpusQuery(q: SerializedQuery): CorpusQuery`** mapping fields (text→query, rarities/types/supertypes/subtypes→`filters`, setId/dexNumber/yearMin/yearMax through), `relevance:false`. (yearMin/yearMax require Task B1's CorpusQuery fields — A2 may land its mapping but the predicate is wired in B1; if B1 not yet done, pass the fields through and B1 makes them effective.)
- [ ] **Step 2 — `binderMembers(binder, index, setsById): Set<string>`** = union of `queryCorpus(index, toCorpusQuery(rule.query), setsById)` ids, ∪ `includeCardIds`, minus `excludeCardIds`. Return resolved id Set.
- [ ] **Step 3 — `computeBinderProgress(binder, index, setsById, ownedCardIds)`** → `{ total, owned, members }` (`total = members.size`, `owned = count members ∈ ownedCardIds`).
- [ ] **Step 4 — Tests** (`binder-progress.test.ts`): rules-only union dedups across two overlapping rules; include adds a non-matching card; exclude removes a rule-matched card; owned/total counts; a year-bounded rule (seed cards in sets with 1999 vs 2001 release dates → yearMax:1999 keeps only the old one). Pre-seed corpus index + setsById per CLAUDE.md.
- [ ] **Step 5 — Selectors.** In `selectors.ts`: `useGoalProgress`→`useBinderProgress(binderId)`; add `useBinderMembers(binderId)` returning resolved members + owned/total via the corpus + sets. Keep `useOwnedCardIdSet` etc.
- [ ] **Step 6 — Run** `bun test src/store/userland/binder-progress.test.ts src/store/userland/selectors.test.ts` → PASS.
- [ ] **Step 7 — Commit** `feat(userland): binder membership + progress selectors`.

### Task A3: store actions + auto-primary (#1)

**Files:**
- Modify: `src/store/userland/userland-store.ts`
- Test: `src/store/userland/userland-store.test.ts`

- [ ] **Step 1 — Tests first.** (a) `addCopy(cardId)` when no existing copy of `cardId` → returned item `isPrimary === true`; a second `addCopy` of same card → `isPrimary` falsy. (b) removing the primary copy while ≥1 remains → earliest-`createdAt` survivor becomes `isPrimary`. (c) binder actions below.
- [ ] **Step 2 — Auto-primary.** In `addCopy` (and `bulkAddCopies` per-card): if the store currently has zero copies for that `cardId`, persist `isPrimary:true` on the new copy. (bulkAdd: first added copy of each previously-unowned card becomes primary.)
- [ ] **Step 3 — Promote on delete.** In the copy-removal action: if the removed copy had `isPrimary` and other copies of that `cardId` remain, `setPrimaryCopy(cardId, earliestSurvivor.id)` atomically.
- [ ] **Step 4 — Binder actions.** Replace goal actions with: `createBinder(NewBinder)`, `updateBinder(id, BinderPatch)`, `removeBinder(id)`, `addCardsToBinder(id, cardIds[])` (union into `includeCardIds`, also drop those ids from `excludeCardIds`), `addRuleToBinder(id, query: SerializedQuery)` (push `{id:uuid, query}`), `removeRuleFromBinder(id, ruleId)`, `removeManualCard(id, cardId)` (remove from include; if still a rule-member, add to `excludeCardIds`), `restoreCard(id, cardId)` (inverse). Each awaits the repo then commits to the Zustand cache. Update `loadUserland` to read `binders`.
- [ ] **Step 5 — Run** `bun test src/store/userland/userland-store.test.ts` → PASS.
- [ ] **Step 6 — Commit** `feat(userland): auto-primary + binder store actions`.

---

## Phase B — Release-year filter (#10 / decision C) — parallel-safe after A

### Task B1: CorpusQuery year predicate

**Files:** Modify `src/store/corpus/corpus-engine.ts`; Test `src/store/corpus/corpus-engine.test.ts`.

- [ ] **Step 1 — Test:** seed cards across sets with releaseDates `1999/01/01` and `2001/01/01`; `queryCorpus(index, { yearMax: 1999, relevance:false }, setsById)` returns only the 1999 card; `{ yearMin: 2000 }` only the 2001 card; both bounds → range.
- [ ] **Step 2 — Impl:** add `yearMin?: number | null; yearMax?: number | null` to `CorpusQuery`; in the `queryCorpus` loop, derive `year = Number(setsById.get(card.setId)?.releaseDate?.slice(0,4))`; skip when `yearMin!=null && year<yearMin` or `yearMax!=null && year>yearMax` (NaN year → excluded only when a bound is set).
- [ ] **Step 3 — Run** `bun test src/store/corpus/corpus-engine.test.ts` → PASS.
- [ ] **Step 4 — Commit** `feat(corpus): release-year range filter in queryCorpus`.

### Task B2: ListSearch + buildCorpusQuery + URL

**Files:** Modify `src/lib/card-query.ts`, `src/lib/list-search.ts`; Tests for both.

- [ ] **Step 1 — Test:** `buildCorpusQuery` forwards `yearMin/yearMax`; `listSearchToUrl`/`fromUrl` round-trip the year params and omit them when null/empty.
- [ ] **Step 2 — Impl:** add `yearMin: number | null; yearMax: number | null` to `ListSearch` (+ defaults in `LIST_SEARCH_DEFAULTS`); forward in `buildCorpusQuery`; ser/de in `list-search.ts` (numeric parse, clamp invalid → null).
- [ ] **Step 3 — Run** `bun test src/lib/card-query.test.ts src/lib/list-search.test.ts` → PASS.
- [ ] **Step 4 — Commit** `feat(search): year range in ListSearch + URL`.

### Task B3: search-controls year UI

**Files:** Modify `src/components/islands/search-controls.tsx`; Test alongside.

- [ ] **Step 1 — Test:** rendering with a value shows From/To year inputs; typing a year calls `onChange({ yearMin })` / `{ yearMax }`.
- [ ] **Step 2 — Impl:** add a compact "Release year" From/To pair (two `Input type="number"` with `min/max` and labels/aria) to the controls grid; empty → null. Keep the existing owned Select.
- [ ] **Step 3 — Run** the test → PASS.
- [ ] **Step 4 — Commit** `feat(search): release-year range control`.

---

## Phase C — Bulk-add flow + select mode (#10, #11) — after A; C1 before D/E

### Task C1: SerializedQuery capture + rule-label formatter

**Files:**
- Create: `src/lib/serialized-query.ts` (capture/from ListSearch+context), `src/lib/binder-rule-label.ts`
- Tests for both.

- [ ] **Step 1 — `toSerializedQuery(search: ListSearch, ctx: ListContext): SerializedQuery`** — copies q→text (trim→null), arrays (clone), setId/dexNumber from ctx (null when absent), yearMin/yearMax; ignores `owned`/`view`. **`isRuleCapturable(ctx, search): boolean`** — false when there is nothing to match (no ctx, no q, all facet arrays empty, no year) OR when the view can't express a rule (series page passes no ctx and we want it disabled). Test both.
- [ ] **Step 2 — `binderRuleLabel(q: SerializedQuery, { setsById, dexName }): string`** — compose human label: setId→set name; dexNumber→species name (passed in); supertypes/subtypes/rarities/types joined with `·`; year → `before {yearMax+1}` / `from {yearMin}` / `{yearMin}–{yearMax}`; text → `"{text}"`. Fallback `"Custom filter"`. Tests for the three user-story shapes + set + dex.
- [ ] **Step 3 — Run** the two tests → PASS.
- [ ] **Step 4 — Commit** `feat(binders): serialized-query capture + rule label formatter`.

### Task C2: bulk-add dropdown redesign + delete TargetPicker

**Files:**
- Modify: `src/components/vault/bulk-add-menu.tsx` (+ test)
- Modify callsites: `src/routes/search.tsx`, `src/routes/$series/$set/index.tsx`, `src/routes/$series/index.tsx`, `src/routes/pokemon/$name.tsx` (pass `ruleQuery`/context + selection)
- Delete: `src/components/goals/target-picker.tsx` (+ its test) and any import.

- [ ] **Step 1 — Props.** New `BulkAddMenuProps`: `{ cardIds: string[]; ruleQuery?: SerializedQuery | null; selectedCardIds?: string[]; label?: string }`. `{x}` = `selectedCardIds?.length || toAdd.length`. Operate on `selectedCardIds` when non-empty, else `cardIds`.
- [ ] **Step 2 — Three items** (replace the 2-item menu + goalTarget logic):
  1. `Add {x} to collection` → `bulkAddCopies` (keep the >25 confirm; replace `window.alert` with a toast — use the app's toast or a shadcn `sonner`/`toast` via the shadcn skill).
  2. `Add {x} cards to binder ▸` submenu: list binders (`useUserland(s=>s.binders)`) + `＋ New binder…`; on select → `addCardsToBinder(binderId, targetIds)`.
  3. `Add smart rule to binder ▸` submenu: binders + new; on select → `addRuleToBinder(binderId, ruleQuery)`. **Disabled** when `selectedCardIds?.length` OR `!ruleQuery`. Add an inline `DropdownMenuLabel` caption under this item: *"Matching cards always appear in this binder, including ones from future sets."* and a tooltip on the disabled trigger explaining why.
  3b. `＋ New binder…` opens `BinderFormDialog` (Task D1); on save, complete the pending add against the new binder.
- [ ] **Step 3 — Callsites.** Pass `ruleQuery`: set page → `toSerializedQuery(search, {setId})`; search page → `toSerializedQuery(search, {})`; dex page → `toSerializedQuery(search, {dexNumber})`; series index → `ruleQuery={null}` (disabled). Thread `selectedCardIds` from the selection context (Task C3).
- [ ] **Step 4 — Tests.** Three items render; smart-rule disabled when `ruleQuery` null or selection present; selecting a binder for "cards" calls `addCardsToBinder` with the right ids; "smart rule" calls `addRuleToBinder`. Remove old goalTarget tests.
- [ ] **Step 5 — Run** `bun test src/components/vault/bulk-add-menu.test.tsx` → PASS.
- [ ] **Step 6 — Commit** `feat(binders): 3-way bulk-add dropdown; remove TargetPicker`.

### Task C3: Select mode

**Files:**
- Create: `src/components/islands/card-selection.tsx` (context + provider + `useCardSelection` hook)
- Modify: `src/components/islands/card-grid-island.tsx`, and the list routes that show the toolbar+grid (`search.tsx`, `$series/$set/index.tsx`, `pokemon/$name.tsx`) to wrap in the provider and render a `Select cards` toggle button next to `BulkAddMenu`.
- Tests: `card-grid-island.test.tsx` (selection overlay + click), a selection-hook test.

- [ ] **Step 1 — Selection context.** `{ active: boolean; selected: Set<string>; toggleActive(): void; toggle(id): void; clear(): void }`. Provider holds state; `clear()` on `active`→false and on route change.
- [ ] **Step 2 — Grid integration.** In `card-grid-island`, consume the context: when `active`, (a) pass `hoverOverlay={undefined}` (hide CollectionToggle), (b) disable the `FlipCard` hover transform (prop or wrapper class), (c) wrap the card so a click calls `toggle(card.id)` and prevents navigation, (d) render a large semi-transparent ✓ overlay when `selected.has(card.id)` (absolute inset, `bg-primary/40`, check icon). When inactive, behave exactly as today.
- [ ] **Step 3 — Toggle button + wiring.** On each list route, render a `Select cards` toggle (toolbar, where the bulk button sits); pass `selectedCardIds={[...selected]}` to `BulkAddMenu`.
- [ ] **Step 4 — Tests.** With provider `active`, clicking a card adds its id to selection + shows the overlay; clicking again removes it; CollectionToggle overlay absent in select mode. (Use the test-env `<ul>` grid fallback path.)
- [ ] **Step 5 — Run** `bun test src/components/islands/card-grid-island.test.tsx` → PASS.
- [ ] **Step 6 — Commit** `feat(grid): card select mode for bulk binder actions`.

---

## Phase H0 — Shared form-error util (before D1, H2)

### Task H0: fieldErrorText

**Files:** Create `src/lib/field-error.ts` (+ test).

- [ ] **Step 1 — Test:** `fieldErrorText({ message: "Name is required" })` → `"Name is required"`; `fieldErrorText("plain")` → `"plain"`; `fieldErrorText(undefined)` → `""`; `fieldErrorText({})` → `String({})` fallback is avoided → returns `""` when no message.
- [ ] **Step 2 — Impl:** `export function fieldErrorText(e: unknown): string` → if `e && typeof e === "object" && "message" in e` return `String(e.message)`; if `typeof e === "string"` return e; else `""`.
- [ ] **Step 3 — Run + Commit** `fix(forms): fieldErrorText helper (kills [object Object])`.

---

## Phase D — Binders UI (#3, #8, #9) — after A, C1, H0

### Task D1: BinderFormDialog (renames GoalFormDialog; shadcn Field; #9 fix)

**Files:**
- Create: `src/components/binders/binder-form-dialog.tsx`; Delete `src/components/goals/goal-form-dialog.tsx`.
- Possibly add shadcn `field` family (`bunx shadcn@latest add field` — use the shadcn skill) if not present.
- Test: `src/components/binders/binder-form-dialog.test.tsx`.

- [ ] **Step 1 — Test:** submitting empty name shows "Name is required" **as text** (assert `getByText("Name is required")`, NOT `[object Object]`); the error node has `role="alert"`; saving calls `createBinder`/`updateBinder`. Use the tanstack-form skill's testing pattern.
- [ ] **Step 2 — Impl:** copy the GoalFormDialog structure but: title/desc "Binder"; use shadcn `Field`/`FieldLabel`/`FieldDescription`/`FieldError` (or, if not adding the registry component, a `grid gap-2` so label↔input have spacing) — fix the cramped label/input gap; render errors via `fieldErrorText(field.state.meta.errors[0])` inside a `role="alert"` element; call `createBinder`/`updateBinder`. Keep TanStack Form render-prop + biome suppressions.
- [ ] **Step 3 — Run** the test → PASS.
- [ ] **Step 4 — Commit** `feat(binders): BinderFormDialog with proper fields + error fix`.

### Task D2: Binders list route (renames goals)

**Files:**
- Rename: `src/routes/vault/goals/index.tsx` → `src/routes/vault/binders/index.tsx`; component `GoalCard`→`BinderCard` (likely `src/components/goals/*`→`src/components/binders/*`); `GoalTargetRow`→ adapt or drop (replaced by rule chips in D3).
- Modify any imports/links to `/vault/goals`.
- Test: update existing goals route/card tests → binder.

- [ ] **Step 1 — Test:** list renders a binder card with name + progress (owned/total via `useBinderProgress`) + counts (`n rules · m cards`); `New binder` opens `BinderFormDialog`; clicking a card navigates to `/vault/binders/$id`.
- [ ] **Step 2 — Impl:** rename + rewire to binders; `BinderCard` shows `ProgressBar`, rule/manual counts, a share icon button (opens Task E2 dialog), links to detail.
- [ ] **Step 3 — Run** `bun test` for the route/card tests → PASS.
- [ ] **Step 4 — Commit** `feat(binders): binders list route`.

### Task D3: Binder detail route

**Files:**
- Create: `src/routes/vault/binders/$binderId.tsx`; supporting components in `src/components/binders/` (rule chip list, manual-cards section).
- Test: `binder-detail` route test.

- [ ] **Step 1 — Test:** detail renders binder name; a rule chip with a human label (via `binderRuleLabel`) and a remove control that calls `removeRuleFromBinder`; the member grid shows owned (color) vs missing (b&w) using `useBinderMembers`; a `Share` button opens the share dialog; edit/delete present.
- [ ] **Step 2 — Impl:** header (name/description, edit→BinderFormDialog, delete→confirm→`removeBinder`, Share→ShareDialog); rule chips (removable); manual cards section (`removeManualCard`); full member grid reusing the owned/missing rendering (color vs `grayscale` filter); progress summary. Pre-seed corpus in tests.
- [ ] **Step 3 — Run** the test → PASS.
- [ ] **Step 4 — Commit** `feat(binders): binder detail + management`.

---

## Phase E — Sharing (#4) — after A, C1

### Task E1: share.ts (encode/decode/buildSnapshot)

**Files:** Create `src/store/userland/share.ts` (+ test). Add a compression dep if chosen (`fflate`) — or use `CompressionStream`/`btoa`. **Decision:** use `fflate` (`deflateSync`/`inflateSync`) + base64url for deterministic, sync, testable round-trips in Bun/happy-dom.

- [ ] **Step 1 — Test:** `decodeSnapshot(encodeSnapshot(s)) deep-equals s`; `buildSnapshot` with `scope:"owned"` includes only owned members; `"needed"` only missing; `"all"` both with correct `owned` flags; `includeGrades:false` omits condition/grade; **never** includes `pricePaid`/`notes` (assert keys absent); malformed input → `decodeSnapshot` throws a typed error caught by a guard.
- [ ] **Step 2 — Types + impl:** `BinderSnapshot` (§8 of spec); `buildSnapshot(binder, members, ownedIndex, copiesByCard, { scope, includeGrades })`; `encodeSnapshot(s): string` = base64url(deflateSync(utf8(JSON))); `decodeSnapshot(hash): BinderSnapshot` inverse + `isValidSnapshot` guard. "best copy" for grade = primary copy else first.
- [ ] **Step 3 — Run** `bun test src/store/userland/share.test.ts` → PASS.
- [ ] **Step 4 — Commit** `feat(share): binder snapshot encode/decode + scope/grades`.

### Task E2: ShareDialog

**Files:** Create `src/components/binders/share-dialog.tsx` (+ test).

- [ ] **Step 1 — Test:** dialog shows scope segmented control (All/Owned/Needed) + `Include condition & grades` switch; changing them updates the generated `#b=` link; a Copy button writes to clipboard (mock); the snapshot-is-frozen note is present.
- [ ] **Step 2 — Impl:** build link `${origin}/vault/shared#b=${encodeSnapshot(buildSnapshot(...))}` reactive to scope/grades; copy button; warn when encoded length > 30000 (suggest narrowing scope). Use `useBinderMembers` + owned set + copies.
- [ ] **Step 3 — Run + Commit** `feat(share): binder share dialog`.

### Task E3: /vault/shared recipient route

**Files:** Create `src/routes/vault/shared.tsx` (+ test). Hash-only (no server loader).

- [ ] **Step 1 — Test:** given a known hash on `window.location`, route decodes + renders binder name, the **"Snapshot from {date} — not live"** banner, and a grid with owned cards in color / missing greyscale (+ grade badge when present); a malformed hash renders a friendly error state.
- [ ] **Step 2 — Impl:** read `location.hash`, `useEnsureCorpus`, `decodeSnapshot` in a guard; render banner + grid (join corpus art by cardId; missing → `grayscale` + reduced opacity). Read-only.
- [ ] **Step 3 — Run + Commit** `feat(share): /vault/shared snapshot viewer`.

---

## Phase F — Sets tab + vault-set-detail (#6) — after A

### Task F1: set-tile fix (overflow + big badge)

**Files:** Modify `src/components/shell/set-tile.tsx` (+ test).

- [ ] **Step 1 — Test:** tile root has width-constraining classes (`w-full`, `max-w-full`) and the image uses `object-contain`/`max-w-full` (no fixed width that overflows); the `{owned}/{total}` badge is rendered prominently (assert a large-text/`tabular-nums` element).
- [ ] **Step 2 — Impl:** constrain image + tile width to the grid track; redesign so `{owned}/{total}` is a large hero element + progress bar (no packaging art). Keep the booster-pack aesthetic but bounded.
- [ ] **Step 3 — Run + Commit** `fix(sets): set-tile overflow + prominent status badge`.

### Task F2: Vault Sets tab — owned-only default + toggle + link

**Files:** Modify `src/routes/vault/sets.tsx` (+ test).

- [ ] **Step 1 — Test:** by default only sets with ≥1 owned card render; an `All sets / Owned sets` toggle reveals all; tiles link to `/vault/sets/$set` (not `/$series/$set`).
- [ ] **Step 2 — Impl:** filter sets via `useOwnedCountBySet` (>0) by default; toggle state reveals all; tile href → vault-set-detail.
- [ ] **Step 3 — Run + Commit** `feat(vault): owned-sets default + all-sets toggle`.

### Task F3: /vault/sets/$set detail

**Files:** Create `src/routes/vault/sets/$set.tsx` (+ test). Reuse the owned/missing grid rendering (shared with D3/E3 — extract a small `OwnedFilteredGrid` component in `src/components/binders/` or `src/components/vault/` if it reduces duplication).

- [ ] **Step 1 — Test:** renders all cards of the set in `compareCardNumber` order; owned in color, missing greyscale; an `All | Owned | Missing` toggle filters the view.
- [ ] **Step 2 — Impl:** query the set's cards (`queryCorpus` with setId, natural order), join owned set, apply the view toggle. Pre-seed corpus.
- [ ] **Step 3 — Run + Commit** `feat(vault): per-set owned/missing detail page`.

### Task F4: Owned/missing toggle wording parity

**Files:** Modify `src/components/islands/search-controls.tsx` (+ where set page renders it) — already has the Select; align labels to `All cards / Owned / Missing` (rename "Not owned"→"Missing") and confirm it shows on the global set page.

- [ ] **Step 1 — Impl + test:** label text `Missing`; verify the control is present on `/$series/$set` (it uses SearchControls/CardGridIsland already).
- [ ] **Step 2 — Commit** `chore(search): owned-filter wording → Missing`.

---

## Phase G — Sidebar nav + layout (#7, #5) — after A (route paths exist)

### Task G1: Sidebar VAULT group; remove toolbar button + tabs

**Files:** Modify `src/components/islands/sidebar-collapsible.tsx`, `src/components/shell/app-toolbar.tsx`, `src/routes/vault.tsx` (+ sidebar test).

- [ ] **Step 1 — Test:** sidebar renders a collapsible `VAULT` group with `Cards`/`Sets`/`Binders` links (to `/vault`, `/vault/sets`, `/vault/binders`); group auto-expanded when `activeSeriesSlug`/path indicates `/vault/*`; active child highlighted.
- [ ] **Step 2 — Impl:** insert the VAULT `Collapsible` between Home and "Series & Sets" (mirror `SeriesRow`); remove the top-right `Vault` `Button` in `app-toolbar.tsx`; remove the in-vault tab `<nav>` row in `vault.tsx` (keep `VaultHeader`). Pass an `isVaultActive` signal (derive from router state) for auto-open.
- [ ] **Step 3 — Run + Commit** `feat(nav): Vault moves into sidebar; drop tabs + toolbar button`.

### Task G2: Vault scrollbar at viewport edge (#5)

**Files:** Modify `src/routes/vault.tsx`.

- [ ] **Step 1 — Impl:** restructure the layout wrapper — full-width outer element owns `overflow-y-auto` (scrollbar at the far edge); an inner `mx-auto max-w-7xl px-4` div holds the content (centered, padded). Verify no double scrollbars and `min-h-0` flex guards intact.
- [ ] **Step 2 — Commit** `fix(vault): scrollbar at viewport edge, content padded inward`.

---

## Phase H — Copy-manager redesign (#2) — after H0

### Task H1: Apply fieldErrorText in copy-edit-form (#9)

**Files:** Modify `src/components/collection/copy-edit-form.tsx` (+ test).

- [ ] **Step 1 — Test:** an invalid field renders the message text (not `[object Object]`); error node has `role="alert"`; label↔input spacing present (assert wrapper has gap class).
- [ ] **Step 2 — Impl:** replace the local `FieldError` `String(...errors[0])` with `fieldErrorText`; add `role="alert"`; ensure label/input spacing (shadcn `Field` or `grid gap-2`).
- [ ] **Step 3 — Run + Commit** `fix(collection): copy-edit-form error text + label spacing`.

### Task H2: Copy-manager tile redesign + Done button

**Files:** Modify `src/components/collection/copy-manager-dialog.tsx`, `copy-manager.tsx`, `copy-row.tsx` (→ copy *tile*) (+ tests).

- [ ] **Step 1 — Test:** each copy renders as a tile with a visible `Edit` control that reveals the editor (assert editor hidden until Edit clicked); a filled-star `Primary` toggle (calls `setPrimaryCopy`); a sticky footer `Done` button closes the dialog (calls `onOpenChange(false)`); `+ Add copy` and `Remove all` present and separated.
- [ ] **Step 2 — Impl (use ui-ux-pro-max rules):** redesign each copy as a tile (card thumbnail + variant/condition/grade/price badges + star); explicit `Edit` (pencil) reveals the inline `CopyEditForm` (replaces undiscoverable expand); primary tile visually distinct (gold ring/filled star, `var(--accent,#e0b341)`); add a sticky bottom action bar with a prominent `Done` button (keep the corner X); `+ Add copy` prominent; `Remove all copies` destructive + separated. Respect existing dark theme; ≥44px targets; focus rings; 150–300ms transitions.
- [ ] **Step 3 — Run + Commit** `feat(collection): redesigned copy-manager tiles + Done button`.

---

## Phase I — Verification

### Task I1: Full suite + lint + typecheck

- [ ] **Step 1 — Run in parallel:** `bun test`  •  `bunx tsc -b`  •  `bunx biome check --config-path=. src` (worktree-safe per CLAUDE.md).
- [ ] **Step 2 — Fix** any fallout (stale `goal` references, broken imports, type drift, lint). Re-run until clean.
- [ ] **Step 3 — Preview verify** the previewable surfaces (bulk-add dropdown, copy-manager modal, sidebar, shared view) per the harness preview workflow; capture a screenshot of the redesigned copy-manager + binder detail.
- [ ] **Step 4 — Commit** any fixes `chore: typecheck/lint/test fixes for binders redesign`.

Then hand to **/founders-review** (review→fix loop), then open the PR.

---

## Self-review (plan vs spec)

- **Coverage:** #1 A3 · #2 H2 · #3 A1/D2/D3 · #4 E1–E3 · #5 G2 · #6 F1–F4 · #7 G1 · #8 D1 · #9 H0/H1/D1 · #10 A1/A2/B/C · #11 C2 (TargetPicker deleted). All 12 mapped.
- **Type consistency:** `Binder`, `BinderRule`, `SerializedQuery` defined in A1; consumed unchanged in A2/C1/C2/D/E. Store actions named in A3 reused verbatim in C2/D. `fieldErrorText` (H0) reused in D1/H1. `binderRuleLabel`/`toSerializedQuery` (C1) reused in C2/D3.
- **No placeholders:** each task has concrete files, signatures, and test targets; impl bodies intentionally left to TDD per the repo owner's rule (stated in the header).
- **Dep risk:** A2 maps year fields before B1 may land — noted; year predicate only becomes effective once B1 ships, and A2's progress test that relies on year is ordered to run after B1 in practice (Phase B is parallel-safe and small). If executing strictly, run B1 before A2's year assertion.
