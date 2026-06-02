# User-land Layer 4 — Card Grid + Multi-sort + Primary Copy — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** `/vault/cards` becomes the sortable "all my cards" grid — per-card tiles with a **×N copies** badge, sorted by Set→#, Date acquired, Price paid, or Year (asc/desc). Per-copy sort keys use a **primary** copy the user can designate (in the Copy Manager modal opened by clicking a tile).

**Design:** approved roadmap Layer 4. Reuses the Copy Manager (Layer 1) as the click-through modal.

**Tech Stack:** React 19, existing userland store/selectors/corpus, shadcn/ui (select/button/dialog), Bun test + RTL.

---

## Conventions
- Test `bun test <path>`; typecheck `bunx tsc -b` (0); lint `bunx biome check --write <files>`. IDB-injected repo harness in tests. `git add` explicit paths.

## File structure
| File | Change |
|---|---|
| `src/store/userland/types.ts` | add `isPrimary?: boolean` to `CollectionItem`; widen `CopyPatch` to include it |
| `src/store/userland/userland-store.ts` | add `setPrimaryCopy(cardId, copyId)` |
| `src/store/userland/card-rows.ts` (new) | `buildCardRows` + `sortCardRows` (pure) + types |
| `src/store/userland/selectors.ts` | add `useOwnedCardRows({key,dir})` |
| `src/components/collection/copy-row.tsx` | primary ★ indicator + "Set as primary" button |
| `src/components/vault/owned-card-tile.tsx` (new) | card + ×N badge + click→Copy Manager Dialog |
| `src/components/vault/owned-cards-grid.tsx` | sort controls + grouped grid via rows/tiles |

---

### Task 1: Model + `setPrimaryCopy`

**Files:** `types.ts`, `userland-store.ts` (+ `userland-store.test.ts`)

- [ ] **Step 1: types** — add to `CollectionItem`: `isPrimary?: boolean;` (optional; absent = not primary; import-safe). Widen the patch:
```ts
export type CopyPatch = Partial<EditableCopyFields & Pick<CollectionItem, "isPrimary">>;
```
(`idb-repo` `update` already spreads `{...existing, ...patch}` — no adapter change.)

- [ ] **Step 2: failing test** (append to `userland-store.test.ts`)
```ts
import { setPrimaryCopy } from "./userland-store";

test("setPrimaryCopy marks one copy primary and clears its siblings", async () => {
  const a = await addCopy("c");
  const b = await addCopy("c");
  await setPrimaryCopy("c", b.id);
  expect(useUserland.getState().items[b.id].isPrimary).toBe(true);
  expect(useUserland.getState().items[a.id].isPrimary).toBe(false);
  await setPrimaryCopy("c", a.id);
  expect(useUserland.getState().items[a.id].isPrimary).toBe(true);
  expect(useUserland.getState().items[b.id].isPrimary).toBe(false);
});
```

- [ ] **Step 3: implement** (append to `userland-store.ts`)
```ts
export async function setPrimaryCopy(cardId: string, copyId: string): Promise<void> {
  const copies = Object.values(useUserland.getState().items).filter((i) => i.cardId === cardId);
  await Promise.all(
    copies.map((c) => activeRepos().collection.update(c.id, { isPrimary: c.id === copyId })),
  );
  useUserland.setState((s) => {
    const items = { ...s.items };
    for (const c of copies) items[c.id] = { ...items[c.id], isPrimary: c.id === copyId };
    return { items };
  });
}
```

- [ ] **Step 4: run → pass. Step 5: lint + commit** (`feat(vault): isPrimary copy flag + setPrimaryCopy`).

---

### Task 2: `card-rows` (group + sort, pure) + `useOwnedCardRows`

**Files:** create `src/store/userland/card-rows.ts` (+ `.test.ts`); append `useOwnedCardRows` to `selectors.ts`

- [ ] **Step 1: failing tests** (`card-rows.test.ts`)
```ts
import { expect, test } from "bun:test";
import { buildCardRows, sortCardRows } from "./card-rows";
import { buildIndex } from "../corpus/corpus-engine";
import type { CorpusCard } from "../corpus/corpus-types";
import type { PokemonSet } from "../../server/card-mappers";
import type { CollectionItem } from "./types";

function item(id: string, cardId: string, over: Partial<CollectionItem> = {}): CollectionItem {
  return { id, cardId, acquiredAt: 0, createdAt: 0, pricePaid: null, variant: null, notes: null, condition: null, grading: null, ...over };
}
function cc(id: string, setId: string, number: string): CorpusCard {
  return { id, name: id, imageUrl: "", imageUrlSmall: "", supertype: "Pokémon", setId, number };
}
const sets = new Map<string, PokemonSet>([
  ["base1", { id: "base1", name: "Base", series: "Base", releaseDate: "1999-01-09", total: 102, images: { symbol: "", logo: "" } }],
  ["xy1", { id: "xy1", name: "XY", series: "XY", releaseDate: "2014-02-05", total: 146, images: { symbol: "", logo: "" } }],
]);
const index = buildIndex([cc("base1-4", "base1", "4"), cc("base1-58", "base1", "58"), cc("xy1-1", "xy1", "1")]);

test("buildCardRows: one row per card, primary = isPrimary else earliest createdAt, count", () => {
  const rows = buildCardRows([
    item("i1", "base1-4", { createdAt: 100 }),
    item("i2", "base1-4", { createdAt: 50, isPrimary: true }),
  ], index, sets);
  expect(rows).toHaveLength(1);
  expect(rows[0].count).toBe(2);
  expect(rows[0].primary.id).toBe("i2"); // explicit primary
});

test("buildCardRows: default primary = earliest createdAt when none flagged", () => {
  const rows = buildCardRows([item("i1", "base1-4", { createdAt: 100 }), item("i2", "base1-4", { createdAt: 50 })], index, sets);
  expect(rows[0].primary.id).toBe("i2");
});

test("sortCardRows by set→number, year, price (nulls last), acquired", () => {
  const rows = buildCardRows([
    item("a", "xy1-1", { pricePaid: 5, acquiredAt: 300 }),
    item("b", "base1-58", { pricePaid: null, acquiredAt: 100 }),
    item("c", "base1-4", { pricePaid: 20, acquiredAt: 200 }),
  ], index, sets);
  expect(sortCardRows(rows, "set", "asc").map((r) => r.card.id)).toEqual(["base1-4", "base1-58", "xy1-1"]);
  expect(sortCardRows(rows, "year", "asc").map((r) => r.card.setId)[0]).toBe("base1");
  // price asc: 5,20 then null last
  expect(sortCardRows(rows, "price", "asc").map((r) => r.primary.pricePaid)).toEqual([5, 20, null]);
  expect(sortCardRows(rows, "acquired", "desc").map((r) => r.primary.acquiredAt)).toEqual([300, 200, 100]);
});
```

- [ ] **Step 2: run → fail. Step 3: implement** (`card-rows.ts`)
```ts
import type { HoloCardData } from "../../components/holo-card";
import type { PokemonSet } from "../../server/card-mappers";
import { type CorpusIndex, hydrateCard } from "../corpus/corpus-engine";
import { compareCardNumber } from "../corpus/natural-compare";
import type { CollectionItem } from "./types";

export type SortKey = "set" | "acquired" | "price" | "year";
export type SortDir = "asc" | "desc";
export interface CardRow { card: HoloCardData; copies: CollectionItem[]; primary: CollectionItem; count: number; }

export function buildCardRows(items: CollectionItem[], index: CorpusIndex, setsById: Map<string, PokemonSet>): CardRow[] {
  const byCard = new Map<string, CollectionItem[]>();
  for (const it of items) {
    const arr = byCard.get(it.cardId);
    if (arr) arr.push(it); else byCard.set(it.cardId, [it]);
  }
  const rows: CardRow[] = [];
  for (const [cardId, copies] of byCard) {
    const cc = index.byId.get(cardId);
    if (!cc) continue;
    const primary = copies.find((c) => c.isPrimary) ?? copies.reduce((a, b) => (b.createdAt < a.createdAt ? b : a));
    rows.push({ card: hydrateCard(cc, setsById), copies, primary, count: copies.length });
  }
  return rows;
}

export function sortCardRows(rows: CardRow[], key: SortKey, dir: SortDir): CardRow[] {
  const sign = dir === "asc" ? 1 : -1;
  const cmp = (a: CardRow, b: CardRow): number => {
    switch (key) {
      case "set": {
        if (a.card.setId !== b.card.setId) return a.card.setId.localeCompare(b.card.setId) * sign;
        return compareCardNumber(a.card.cardNumber, b.card.cardNumber) * sign;
      }
      case "year": return (a.card.setReleaseDate ?? "").localeCompare(b.card.setReleaseDate ?? "") * sign;
      case "acquired": return (a.primary.acquiredAt - b.primary.acquiredAt) * sign;
      case "price": {
        const pa = a.primary.pricePaid, pb = b.primary.pricePaid;
        if (pa == null && pb == null) return 0;
        if (pa == null) return 1;   // nulls always last
        if (pb == null) return -1;
        return (pa - pb) * sign;
      }
    }
  };
  return [...rows].sort(cmp);
}
```

- [ ] **Step 4: `useOwnedCardRows`** (append to `selectors.ts`)
```ts
import { buildCardRows, type CardRow, type SortDir, type SortKey, sortCardRows } from "./card-rows";

export function useOwnedCardRows(key: SortKey, dir: SortDir): CardRow[] {
  useEnsureUserland();
  const items = useUserland((s) => s.items);
  const index = useCorpusRuntime((s) => s.index);
  const sets = useStore((s) => s.sets);
  return useMemo(() => {
    if (!index || !sets) return [];
    const setsById = new Map(sets.map((s) => [s.id, s]));
    return sortCardRows(buildCardRows(Object.values(items), index, setsById), key, dir);
  }, [items, index, sets, key, dir]);
}
```

- [ ] **Step 5: run → pass. lint + commit** (`feat(vault): card-row grouping + sort selector`).

---

### Task 3: Copy Manager — primary indicator + "Set as primary"

**Files:** `src/components/collection/copy-row.tsx` (+ update `copy-manager.test.tsx`)

- [ ] **Step 1: failing test** (append to `copy-manager.test.tsx`)
```tsx
import { setPrimaryCopy } from "../../store/userland/userland-store";
test("Set as primary marks the copy primary", async () => {
  await addCopy("c"); const b = await addCopy("c");
  render(<CopyManager cardId="c" />);
  const btns = screen.getAllByRole("button", { name: /set as primary/i });
  fireEvent.click(btns[btns.length - 1]); // last row
  await waitFor(() => expect(Object.values(useUserland.getState().items).some((i) => i.isPrimary)).toBe(true));
});
```

- [ ] **Step 2–4:** add to `CopyRow`: if `item.isPrimary` show a ★ "Primary" badge; else a "Set as primary" button → `void setPrimaryCopy(item.cardId, item.id)`. Run → pass. lint + commit (`feat(vault): set-primary control in copy manager`).

---

### Task 4: `/vault/cards` — sort controls + grouped grid

**Files:** create `src/components/vault/owned-card-tile.tsx`; rewrite `src/components/vault/owned-cards-grid.tsx` (+ test updates)

- [ ] **Step 1: `OwnedCardTile({ row })`** — renders the card (`HoloCardIsland`/`HoloCard`) + a `×{row.count}` badge (only when `count>1`); the tile is a button that opens a shadcn `Dialog` containing `<CopyManager cardId={row.card.id} variants={row.card.variants} />` (mirror the toggle's controlled-Dialog pattern + `DialogTitle`/`DialogDescription` for a11y).

- [ ] **Step 2: rewrite `OwnedCardsGrid`** — local state `const [key,setKey]=useState<SortKey>("set"); const [dir,setDir]=useState<SortDir>("asc")`; `const rows = useOwnedCardRows(key,dir)`; trigger `loadCorpus`/`loadSets` (as before). Render: a sort bar (shadcn `Select` for key: "Set & number"/"Date acquired"/"Price paid"/"Year released" + a Button toggling asc/desc with an arrow), then the grid of `<OwnedCardTile row>`; empty state unchanged.

- [ ] **Step 3: tests** — `owned-cards-grid.test.tsx`: keep empty-state test (pre-seed empty corpus index — the Layer-2/3 isolation pattern); add: with an owned card + a seeded corpus index containing it + sets, the grid renders the tile (and a ×2 badge when 2 copies). Mock/seed corpus via `useCorpusRuntime.setState({ index: buildIndex([cc]) })` + `useStore.setState({ sets })` so no network. `owned-card-tile.test.tsx`: ×N badge shows when count>1; click opens a dialog with "Your copies".

- [ ] **Step 4:** run → pass; `bunx tsc -b` 0; lint; commit (`feat(vault): sortable grouped card grid with copy-manager modal`).

---

### Task 5: Verify + smoke + review

- [ ] `bunx tsc -b` & `bunx biome check src` & `bun test` & `bun run check:bundle` — green.
- [ ] Browser smoke (`preview_start vite`): `/vault/cards` shows the owned card; add a 2nd copy of it (via the modal) → tile shows ×2; change sort key/dir → order updates; open modal → "Set as primary" on a copy → primary ★ moves; sort by Price/Date reflects the primary. 0 console errors.
- [ ] Review (`caveman:cavecrew-reviewer`): `setPrimaryCopy` one-per-card invariant; sort correctness (nulls-last, set→#, dir); primary default; no regressions to the manager/toggle.

## Self-review
- Model+action (T1), group/sort selector (T2), manager set-primary (T3), grid+sort+modal (T4). ✓
- `isPrimary` optional + import-safe; `CopyPatch` widened; idb adapter unchanged (generic spread).
