# User-land Layer 1 — Copy Manager — Design

**Date:** 2026-06-02
**Status:** Approved (design); plan pending
**Roadmap:** [`roadmap-userland.md`](../roadmap-userland.md) Layer 1. Builds on [Layer 0 foundation](2026-06-02-userland-foundation-design.md).

## Summary

The per-copy CRUD UI. Replaces the foundation's **interim destructive toggle** (owned → `removeAllCopiesOfCard`, which deletes every copy on a misclick) with a real manager: list a card's copies, add/edit/delete individual copies, edit every per-copy field. One reusable `<CopyManager>` mounted in two places (a Dialog off the grid badge, and inline in the card detail view).

Establishes **TanStack Form + Zod** as the user-land form standard (first of several roadmap forms: Goals, bulk-add).

## Context

The foundation already ships everything below the UI: `CollectionItem` (per-copy), store actions `addCopy`/`updateCopy`/`removeCopy`/`removeAllCopiesOfCard`/`useOwnedIndex`/`useOwnedCount`, and `useIsOwned`. **No store/repo changes are needed** — this layer is purely UI + a form stack.

Today the toggle lives in `collection-toggle.tsx` (grids) and `card-detail.tsx` `CollectionButton` (focus view); both call the destructive `removeAllCopiesOfCard` when owned. That behavior is removed here.

## Goals

- View all copies of a card; add a copy; edit a copy's fields; delete one copy.
- Per-copy fields: `acquiredAt`, `pricePaid`, `variant`, `notes`, and card-state as **raw** (`condition`) **or graded** (`grading.company` + `grading.grade`).
- Non-destructive everywhere: the grid toggle never deletes; "remove all copies" is an explicit, confirmed action inside the manager.
- TanStack Form + Zod with light validation; save-on-blur (no submit button).

## Non-goals (later layers / out of scope)

- Set grid / card grid / sort (Layers 3–4), Goals UI (5), bulk add (6), owned filter (7), import/export polish (8).
- Multi-select / batch copy edits. Drag-reorder of copies. Image upload.
- Currency/locale formatting beyond a plain number for `pricePaid`.

## Dependencies to add

- `bun add @tanstack/react-form zod`
- shadcn (via `bunx shadcn@latest add …`, `components.json` present): **`textarea`**, **`label`**, **`radio-group`**. (The shadcn `field` primitives are optional sugar; if not in the registry, use `Label` + a small inline `<p className="text-destructive text-xs">` for errors.)
- Watch `bun run check:bundle` — `zod` adds weight; acceptable for a form-heavy user-land, but confirm the gate still passes.

## Form model

A copy's stored shape (`CollectionItem`) maps to/from flat form values. The form never holds `null`; it uses `""`/sentinels and maps at the persistence boundary.

```ts
// Zod (src/components/collection/copy-form-schema.ts)
export const CONDITIONS = ["NM", "LP", "MP", "HP", "DMG"] as const;
export const GRADERS = ["PSA", "BGS", "CGC", "TAG", "SGC", "Other"] as const;

export const copyFormSchema = z.object({
  acquiredAt: z.string().refine(isValidDateStr, "Invalid date"),     // YYYY-MM-DD
  pricePaid: z.string().refine(isMoneyOrEmpty, "Must be ≥ 0"),        // "" or a number ≥ 0
  variant: z.string(),                                               // "" = unspecified
  notes: z.string(),
  state: z.enum(["raw", "graded"] as const),
  condition: z.enum(["", ...CONDITIONS] as const),                   // when raw
  gradingCompany: z.enum(["", ...GRADERS] as const),                 // when graded
  grade: z.string().refine(isGradeOrEmpty, "0–10"),                  // when graded; "" or 0–10
});
export type CopyFormValues = z.infer<typeof copyFormSchema>;
```

**Mapping helpers** (`copy-form-mapping.ts`, pure + unit-tested):
- `itemToForm(item: CollectionItem): CopyFormValues` — ms→`YYYY-MM-DD`; `null`→`""`; `grading` present ⇒ `state:"graded"`, else `"raw"`.
- `formFieldToPatch(values, changedField): CopyPatch` — maps the changed field back: `""`→`null`, money string→number, date→ms. Switching `state` produces a patch that **clears the other** branch (`condition:null` or `grading:null`).

Day-granularity dates: store `acquiredAt` as ms at local midnight of the chosen day.

## Components (`src/components/collection/`)

- **`CopyManager({ cardId, variants? })`** — header "Your copies (N)" + `[+ Add copy]`; maps `useOwnedIndex().get(cardId) ?? []` to a list of `CopyRow`; footer "Remove all copies" (confirm) → `removeAllCopiesOfCard`. Empty (0 copies) renders nothing (callers gate on owned).
- **`CopyRow({ item, variants })`** — collapsed summary (date · price · condition/grade badges) + expand toggle + per-copy delete (🗑, confirm if the copy has any non-null field). Expanded → `CopyEditForm`.
- **`CopyEditForm({ item, variants })`** — one TanStack Form seeded via `itemToForm(item)`. Per-field Zod (`onBlur`). **Persistence = field `listeners.onBlur`**: when the field is valid, `updateCopy(item.id, formFieldToPatch(...))`. The `state` radio's `listeners.onChange` clears+persists the opposite branch and toggles which controls render. No submit button.
- **`add` flow:** `[+ Add copy]` → `await addCopy(cardId)` → the new row auto-expands for editing.

Controls: shadcn `Input` (date/number/text), `Select` (variant, condition, grader), `RadioGroup` (raw/graded), `Textarea` (notes), `Button`, `Dialog`. Accessibility per the tanstack-form skill (`aria-invalid`, `htmlFor`/`id`, `onBlur` on `SelectTrigger`).

## Integration

- **`collection-toggle.tsx`** (grids): unowned → `+` quick-adds one default copy (`addCopy`). Owned → badge shows **`✓ N`** (`useOwnedCount`) and **opens a `Dialog`** containing `<CopyManager cardId variants>`. **Remove the `removeAllCopiesOfCard` call.** Card-body navigation guard (`e.preventDefault()`) preserved.
- **`card-detail.tsx`** `CollectionButton`: unowned → "＋ Add to collection" (`addCopy`). Owned → render the inline **`<CopyManager>`** section (no Dialog; it's already a detail view). Remove the destructive `removeAllCopiesOfCard` call.
- `removeAllCopiesOfCard` stays in the store API (now only reachable via the manager's confirmed "Remove all").

## Testing

RTL + happy-dom + `fake-indexeddb`, injected repo via `setUserlandRepos` (+ `resetUserlandForTests`), as in the foundation.

- **mapping** (pure): `itemToForm` round-trips; `null`↔`""`; ms↔date; raw vs graded inference; `formFieldToPatch` clears the opposite branch on `state` switch; money/date/grade parsing.
- **CopyEditForm**: edit price + blur → `updateCopy` with `{pricePaid:number}`; clear price → `{pricePaid:null}`; invalid price (negative) → no persist + error shown; switch raw→graded → `condition:null` persisted and grader/grade controls appear; notes edit persists.
- **CopyManager**: add → new row; delete one copy → `removeCopy`; "remove all" (confirmed) → `removeAllCopiesOfCard`.
- **collection-toggle**: unowned click → `addCopy` (1 copy); owned → shows `✓ N`, click opens Dialog (assert manager present), **never** deletes.

## Assumptions (approved)

1. Grid owned-badge opens a **Dialog**; card-detail uses an inline section — same `<CopyManager>`.
2. Grid toggle is **never destructive**; "remove all" lives in the manager with a confirm.
3. **Save-on-blur**, no Save button; persistence via TanStack Form field `listeners`.
4. Condition `NM/LP/MP/HP/DMG`; graders `PSA/BGS/CGC/TAG/SGC/Other`; grade 0–10.
5. **TanStack Form + Zod** (new deps) as the user-land form standard; official shadcn `Textarea`/`Label`/`RadioGroup` via CLI; no hand-rolled inputs.
6. Quick-add adds a copy with all optionals `null` (`acquiredAt` = now).
7. No store/repo changes — foundation actions are sufficient.
