# User-land Layer 1 — Copy Manager — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development to execute task-by-task. Form code: invoke the **tanstack-form** skill; component installs: the **shadcn** skill. Steps use checkbox (`- [ ]`).

**Goal:** Replace the foundation's destructive collection toggle with a real per-copy manager (list/add/edit/delete copies), built on TanStack Form + Zod.

**Architecture:** A reusable `<CopyManager cardId>` reads `useOwnedIndex()` and renders one `<CopyRow>`/`<CopyEditForm>` per copy. Edits persist save-on-blur via TanStack Form field `listeners` → existing `updateCopy`. Mounted in a Dialog off the grid badge and inline in card detail. No store/repo changes.

**Tech Stack:** TanStack Form, Zod, shadcn/ui (textarea/label/radio-group + existing input/select/dialog/button), Bun test + RTL + fake-indexeddb, Biome.

**Spec:** [`2026-06-02-userland-layer1-copy-manager-design.md`](../specs/2026-06-02-userland-layer1-copy-manager-design.md)

---

## Conventions
- Test a file: `bun test <path>`. Typecheck: `bunx tsc -b` (baseline clean). Lint: `bunx biome check --write <files>`.
- IDB auto-available in tests; inject the repo with `setUserlandRepos(createIdbRepos())` + `resetUserlandForTests()` in `beforeEach` (foundation pattern).
- `git add` explicit paths only. Commit after each task.

## File structure
| File | Responsibility |
|---|---|
| `src/components/ui/{textarea,label,radio-group}.tsx` | shadcn primitives (CLI) |
| `src/components/collection/copy-form-schema.ts` | Zod schema, `CONDITIONS`/`GRADERS`, predicates |
| `src/components/collection/copy-form-mapping.ts` | `itemToForm` / `formFieldToPatch` (pure) |
| `src/components/collection/copy-edit-form.tsx` | TanStack Form, save-on-blur |
| `src/components/collection/copy-row.tsx` | summary + expand + delete |
| `src/components/collection/copy-manager.tsx` | list + add + remove-all |
| `*.test.ts(x)` | colocated tests |
| `collection-toggle.tsx`, `card/card-detail.tsx` | integration (edits) |

---

### Task 1: Dependencies + shadcn primitives

**Files:** `package.json`, `src/components/ui/textarea.tsx`, `label.tsx`, `radio-group.tsx`

- [ ] **Step 1: Add deps**

Run: `bun add @tanstack/react-form zod`

- [ ] **Step 2: Add shadcn components**

Run: `bunx shadcn@latest add textarea label radio-group`
Expected: three files created under `src/components/ui/`. If the CLI prompts, accept defaults (new-york, existing aliases). If `radio-group` pulls `@radix-ui/react-radio-group`, that's fine (radix-ui umbrella already present; the generated import may need aligning to the repo's `radix-ui` import style — match the existing `select.tsx`/`dialog.tsx` import convention).

- [ ] **Step 3: Verify**

Run: `bunx tsc -b` → 0 errors. `bun test src/components/ui` (if any) or skip.

- [ ] **Step 4: Commit**

```bash
git add package.json bun.lock src/components/ui/textarea.tsx src/components/ui/label.tsx src/components/ui/radio-group.tsx
git commit -m "chore(userland): add tanstack-form + zod + shadcn textarea/label/radio-group"
```

---

### Task 2: Copy form Zod schema

**Files:** Create `src/components/collection/copy-form-schema.ts` + `.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// copy-form-schema.test.ts
import { expect, test } from "bun:test";
import { copyFormSchema, isMoneyOrEmpty, isGradeOrEmpty, isValidDateStr } from "./copy-form-schema";

test("predicates", () => {
  expect(isValidDateStr("2024-03-01")).toBe(true);
  expect(isValidDateStr("nope")).toBe(false);
  expect(isMoneyOrEmpty("")).toBe(true);
  expect(isMoneyOrEmpty("0")).toBe(true);
  expect(isMoneyOrEmpty("5.5")).toBe(true);
  expect(isMoneyOrEmpty("-1")).toBe(false);
  expect(isMoneyOrEmpty("x")).toBe(false);
  expect(isGradeOrEmpty("")).toBe(true);
  expect(isGradeOrEmpty("10")).toBe(true);
  expect(isGradeOrEmpty("11")).toBe(false);
});

test("schema accepts a valid raw copy and rejects bad price", () => {
  const base = { acquiredAt: "2024-03-01", pricePaid: "5", variant: "", notes: "",
    state: "raw" as const, condition: "NM" as const, gradingCompany: "" as const, grade: "" };
  expect(copyFormSchema.safeParse(base).success).toBe(true);
  expect(copyFormSchema.safeParse({ ...base, pricePaid: "-3" }).success).toBe(false);
});
```

- [ ] **Step 2: Run → fail.** `bun test src/components/collection/copy-form-schema.test.ts`

- [ ] **Step 3: Implement**

```ts
// copy-form-schema.ts
import { z } from "zod";

export const CONDITIONS = ["NM", "LP", "MP", "HP", "DMG"] as const;
export const GRADERS = ["PSA", "BGS", "CGC", "TAG", "SGC", "Other"] as const;

export function isValidDateStr(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = Date.parse(s);
  return !Number.isNaN(t);
}
export function isMoneyOrEmpty(s: string): boolean {
  if (s === "") return true;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0;
}
export function isGradeOrEmpty(s: string): boolean {
  if (s === "") return true;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n <= 10;
}

export const copyFormSchema = z.object({
  acquiredAt: z.string().refine(isValidDateStr, "Invalid date"),
  pricePaid: z.string().refine(isMoneyOrEmpty, "Must be a number ≥ 0"),
  variant: z.string(),
  notes: z.string(),
  state: z.enum(["raw", "graded"]),
  condition: z.enum(["", ...CONDITIONS]),
  gradingCompany: z.enum(["", ...GRADERS]),
  grade: z.string().refine(isGradeOrEmpty, "0–10"),
});
export type CopyFormValues = z.infer<typeof copyFormSchema>;
```

- [ ] **Step 4: Run → pass. Step 5: lint + commit** (`feat(userland): copy form zod schema`).

---

### Task 3: Form ↔ store mapping (pure)

**Files:** Create `src/components/collection/copy-form-mapping.ts` + `.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// copy-form-mapping.test.ts
import { expect, test } from "bun:test";
import { itemToForm, formFieldToPatch, dayMsToInput, inputDayToMs } from "./copy-form-mapping";
import type { CollectionItem } from "../../store/userland/types";

function item(over: Partial<CollectionItem> = {}): CollectionItem {
  return { id: "1", cardId: "c", acquiredAt: inputDayToMs("2024-03-01"), createdAt: 0,
    pricePaid: null, variant: null, notes: null, condition: null, grading: null, ...over };
}

test("itemToForm: raw item with nulls → empty strings + raw state", () => {
  const f = itemToForm(item());
  expect(f.acquiredAt).toBe("2024-03-01");
  expect(f.pricePaid).toBe("");
  expect(f.state).toBe("raw");
  expect(f.condition).toBe("");
});

test("itemToForm: graded item → graded state + company/grade", () => {
  const f = itemToForm(item({ grading: { company: "PSA", grade: 10 } }));
  expect(f.state).toBe("graded");
  expect(f.gradingCompany).toBe("PSA");
  expect(f.grade).toBe("10");
});

test("formFieldToPatch: price '' clears, '5' → 5", () => {
  expect(formFieldToPatch("pricePaid", "")).toEqual({ pricePaid: null });
  expect(formFieldToPatch("pricePaid", "5")).toEqual({ pricePaid: 5 });
});

test("formFieldToPatch: switching to raw clears grading; graded clears condition", () => {
  expect(formFieldToPatch("state", "raw")).toEqual({ grading: null });
  expect(formFieldToPatch("state", "graded")).toEqual({ condition: null });
});

test("formFieldToPatch: acquiredAt date → ms midnight", () => {
  expect(formFieldToPatch("acquiredAt", "2024-03-01")).toEqual({ acquiredAt: inputDayToMs("2024-03-01") });
});
```

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement**

```ts
// copy-form-mapping.ts
import type { CollectionItem, CopyPatch } from "../../store/userland/types";
import type { CopyFormValues } from "./copy-form-schema";

export function dayMsToInput(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function inputDayToMs(s: string): number {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d).getTime(); // local midnight
}

export function itemToForm(i: CollectionItem): CopyFormValues {
  return {
    acquiredAt: dayMsToInput(i.acquiredAt),
    pricePaid: i.pricePaid == null ? "" : String(i.pricePaid),
    variant: i.variant ?? "",
    notes: i.notes ?? "",
    state: i.grading ? "graded" : "raw",
    condition: i.condition ?? "",
    gradingCompany: i.grading?.company as CopyFormValues["gradingCompany"] ?? "",
    grade: i.grading?.grade == null ? "" : String(i.grading.grade),
  };
}

/** Map a single changed field to a store patch. Caller supplies the form's current
 *  grading sub-values when persisting gradingCompany/grade (see notes in CopyEditForm). */
export function formFieldToPatch(
  field: keyof CopyFormValues,
  value: string,
  ctx?: { gradingCompany?: string; grade?: string },
): CopyPatch {
  switch (field) {
    case "acquiredAt": return { acquiredAt: inputDayToMs(value) };
    case "pricePaid": return { pricePaid: value === "" ? null : Number(value) };
    case "variant": return { variant: value === "" ? null : value };
    case "notes": return { notes: value === "" ? null : value };
    case "condition": return { condition: value === "" ? null : (value as CollectionItem["condition"]) };
    case "state": return value === "raw" ? { grading: null } : { condition: null };
    case "gradingCompany":
    case "grade": {
      const company = (field === "gradingCompany" ? value : ctx?.gradingCompany) ?? "";
      const gradeStr = (field === "grade" ? value : ctx?.grade) ?? "";
      if (company === "") return { grading: null };
      return { grading: { company, grade: gradeStr === "" ? 0 : Number(gradeStr) } };
    }
    default: return {};
  }
}
```

- [ ] **Step 4: Run → pass. Step 5: lint + commit** (`feat(userland): copy form/store mapping`).

> Note for implementer: `Date`/`new Date()` are fine in app code; only the *workflow scripts* ban them. Tests above seed via `inputDayToMs`, avoiding wall-clock coupling.

---

### Task 4: `CopyEditForm` (TanStack Form, save-on-blur)

**Files:** Create `src/components/collection/copy-edit-form.tsx` + `.test.tsx`
**REQUIRED: invoke the `tanstack-form` skill before writing the form.**

Contract: `CopyEditForm({ item: CollectionItem; variants?: string[] })`. One `useForm` seeded from `itemToForm(item)`, validators per field from `copyFormSchema.shape.*` on `onBlur`. Persistence via field `listeners.onBlur`: if the field is valid, `updateCopy(item.id, formFieldToPatch(field, value, { gradingCompany, grade }))`. The `state` radio's `listeners.onChange` persists the cleared branch and switches which controls render (raw → condition `Select`; graded → grader `Select` + grade `Input`). `variant` `Select` options = `variants ?? []` + an "Unspecified" (`""`) item. `notes` → `Textarea`. No submit button. Follow the skill's a11y checklist.

- [ ] **Step 1: Write failing tests** (pin behavior)

```tsx
// copy-edit-form.test.tsx
import { beforeEach, expect, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createIdbRepos } from "../../store/userland/idb-repo";
import { addCopy, resetUserlandForTests, setUserlandRepos, useUserland } from "../../store/userland/userland-store";
import { CopyEditForm } from "./copy-edit-form";

let repos = createIdbRepos();
beforeEach(async () => { repos = createIdbRepos(); await repos.collection.clear(); await repos.goals.clear(); setUserlandRepos(repos); resetUserlandForTests(); });

test("editing price and blurring persists a numeric pricePaid", async () => {
  const item = await addCopy("c");
  render(<CopyEditForm item={useUserland.getState().items[item.id]} />);
  const price = screen.getByLabelText(/price/i);
  fireEvent.change(price, { target: { value: "12.5" } });
  fireEvent.blur(price);
  await waitFor(() => expect(useUserland.getState().items[item.id].pricePaid).toBe(12.5));
});

test("clearing price persists null", async () => {
  const item = await addCopy("c", { pricePaid: 5 });
  render(<CopyEditForm item={useUserland.getState().items[item.id]} />);
  const price = screen.getByLabelText(/price/i);
  fireEvent.change(price, { target: { value: "" } });
  fireEvent.blur(price);
  await waitFor(() => expect(useUserland.getState().items[item.id].pricePaid).toBeNull());
});

test("negative price shows error and does not persist", async () => {
  const item = await addCopy("c");
  render(<CopyEditForm item={useUserland.getState().items[item.id]} />);
  const price = screen.getByLabelText(/price/i);
  fireEvent.change(price, { target: { value: "-3" } });
  fireEvent.blur(price);
  await screen.findByText(/≥ 0|number/i);
  expect(useUserland.getState().items[item.id].pricePaid).toBeNull();
});

test("switching to graded clears condition and reveals grader controls", async () => {
  const item = await addCopy("c", { condition: "NM" });
  render(<CopyEditForm item={useUserland.getState().items[item.id]} />);
  fireEvent.click(screen.getByLabelText(/graded/i));
  await waitFor(() => expect(useUserland.getState().items[item.id].condition).toBeNull());
  expect(screen.getByLabelText(/grader|company/i)).toBeDefined();
});
```

- [ ] **Step 2: Run → fail. Step 3: implement** (per the skill). **Step 4: Run → pass.** **Step 5: lint + commit** (`feat(userland): copy edit form`).

> If a test's label query needs an accessible name, add `<Label htmlFor>`/`aria-label` accordingly — keep the form accessible per the skill.

---

### Task 5: `CopyRow` + `CopyManager`

**Files:** Create `copy-row.tsx`, `copy-manager.tsx` + `copy-manager.test.tsx`

Contracts:
- `CopyRow({ item, variants? })`: collapsed summary (`dayMsToInput(acquiredAt)` · price · condition or `company grade` badge) + expand button → renders `CopyEditForm` + a delete button (`removeCopy(item.id)`; if the copy has any non-null optional, confirm via `window.confirm`).
- `CopyManager({ cardId, variants? })`: `const copies = useOwnedIndex().get(cardId) ?? []`; header `Your copies (${copies.length})`; `[+ Add copy]` → `addCopy(cardId)`; maps copies → `CopyRow`; footer `Remove all copies` → confirm → `removeAllCopiesOfCard(cardId)`.

- [ ] **Step 1: Failing tests**

```tsx
// copy-manager.test.tsx (same beforeEach harness as Task 4)
import { CopyManager } from "./copy-manager";

test("add copy creates a row", async () => {
  await addCopy("c"); // seed 1 so manager shows
  render(<CopyManager cardId="c" />);
  fireEvent.click(screen.getByRole("button", { name: /add copy/i }));
  await waitFor(() => expect(Object.values(useUserland.getState().items).filter(i=>i.cardId==="c")).toHaveLength(2));
});

test("remove all (confirmed) empties the card's copies", async () => {
  await addCopy("c"); await addCopy("c");
  const orig = window.confirm; window.confirm = () => true;
  render(<CopyManager cardId="c" />);
  fireEvent.click(screen.getByRole("button", { name: /remove all/i }));
  await waitFor(() => expect(Object.values(useUserland.getState().items).filter(i=>i.cardId==="c")).toHaveLength(0));
  window.confirm = orig;
});
```

- [ ] **Step 2–5:** run→fail, implement, run→pass, lint + commit (`feat(userland): copy row + manager`).

---

### Task 6: Integrate the grid toggle (non-destructive Dialog)

**Files:** `src/components/collection-toggle/collection-toggle.tsx` + `.test.tsx`

New behavior: unowned → `+` button (`addCopy(card.id)`); owned → button shows `✓{count}` (`useOwnedCount`) and opens a shadcn `Dialog` with `<CopyManager cardId={card.id} variants={card.variants} />`. Remove the `removeAllCopiesOfCard` call. Keep `e.preventDefault()` on click (card-nav guard). Keep the existing class strings.

- [ ] **Step 1: Update the test** (replace the owned-click-removes test):

```tsx
test("owned shows count and opens the manager dialog (never deletes)", async () => {
  await repos.collection.add({ cardId: card.id }); resetUserlandForTests();
  render(<CollectionToggle card={card} />);
  const btn = await screen.findByRole("button", { name: /copies|manage|collection/i });
  fireEvent.click(btn);
  expect(await screen.findByText(/your copies/i)).toBeDefined();
  expect(await repos.collection.list()).toHaveLength(1); // unchanged
});
```
(Keep the unowned "+ adds a copy" test from the foundation.)

- [ ] **Step 2–5:** run→fail, implement (Dialog + count), run→pass, lint + commit (`feat(userland): non-destructive collection toggle with copy manager dialog`).

---

### Task 7: Integrate card detail

**Files:** `src/components/card/card-detail.tsx`

`CollectionButton`: unowned → "＋ Add to collection" (`addCopy(card.id)`); owned → render `<CopyManager cardId={card.id} variants={card.variants} />` inline (no Dialog). Remove the `removeAllCopiesOfCard` call + its import if now unused.

- [ ] **Step 1: implement.** **Step 2:** `bunx tsc -b` (0) + `bun test src/components/card` (if any). **Step 3:** lint + commit (`feat(userland): copy manager in card detail`).

---

### Task 8: Verify + smoke + review

- [ ] **Step 1:** `bunx tsc -b` & `bunx biome check src` & `bun test` (all green) & `bun run check:bundle` (still within budget; note the zod delta).
- [ ] **Step 2: Browser smoke** (`preview_start "vite"`): on a set page, add a card → open the `✓` badge → Dialog manager; set price `12.5`, condition NM, blur; switch to Graded (PSA 10); reload → values persist; delete a copy; confirm the toggle never deletes on a stray click. 0 console errors.
- [ ] **Step 3: Final review** of the diff (`caveman:cavecrew-reviewer`): focus on the save-on-blur validity gating, raw↔graded clearing, and that no destructive path remains on the toggle.

## Self-review checklist
- Spec coverage: manager (T5) ✓, edit form + validation (T2–4) ✓, dependent raw/graded (T3–4) ✓, non-destructive toggle (T6) ✓, card-detail (T7) ✓, deps/shadcn (T1) ✓.
- Type consistency: `CopyFormValues`, `formFieldToPatch`, `itemToForm`, `CopyPatch`, store actions used consistently across tasks.
- No store/repo changes (foundation sufficient).
