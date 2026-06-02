# User-land Layer 7 — Owned / Not-owned Filter — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Filter card lists (set + search pages) by **All / Owned / Not owned**, via the shared list-search + corpus fetcher.

**Design:** approved roadmap Layer 7. A tri-state added to `ListSearch`; the grid's corpus fetcher filters by owned membership.

**Tech Stack:** TanStack Router search params, existing corpus fetcher + userland selectors, shadcn `Select`, Bun test.

---

## Conventions
- Test `bun test <path>`; typecheck `bunx tsc -b` (0); lint `bunx biome check --write <files>`. `git add` explicit paths.

## File structure
| File | Change |
|---|---|
| `src/lib/card-query.ts` | add `owned: OwnedMode` to `ListSearch` |
| `src/lib/list-search.ts` | default + validate + url-serialize `owned` |
| `src/store/corpus/corpus-runtime.ts` | `makeCorpusFetcher(params, ownedFilter?)` |
| `src/components/islands/search-controls.tsx` | owned tri-state `Select` |
| `src/components/islands/card-grid-island.tsx` | thread owned set + mode into the fetcher |

---

### Task 1: list-search `owned` param

**Files:** `card-query.ts`, `list-search.ts` (+ `list-search.test.ts` if present, else add one)

- [ ] **Step 1: types** — in `card-query.ts`: `export type OwnedMode = "all" | "owned" | "missing";` and add `owned: OwnedMode;` to `ListSearch`.

- [ ] **Step 2: list-search** —
  - `LIST_SEARCH_DEFAULTS`: add `owned: "all"`.
  - `validateListSearch`: `owned: search.owned === "owned" || search.owned === "missing" ? search.owned : "all"`.
  - `listSearchToUrl`: `if (s.owned !== undefined) out.owned = s.owned !== "all" ? s.owned : undefined;`

- [ ] **Step 3: test** (`list-search.test.ts`)
```ts
import { expect, test } from "bun:test";
import { validateListSearch, listSearchToUrl } from "./list-search";
test("owned validates + serializes", () => {
  expect(validateListSearch({}).owned).toBe("all");
  expect(validateListSearch({ owned: "owned" }).owned).toBe("owned");
  expect(validateListSearch({ owned: "junk" }).owned).toBe("all");
  expect(listSearchToUrl({ owned: "missing" }).owned).toBe("missing");
  expect(listSearchToUrl({ owned: "all" }).owned).toBeUndefined();
});
```

- [ ] **Step 4: run → pass; tsc 0; lint + commit** (`feat(vault): owned filter search param`).
> Note: adding a required `owned` field to `ListSearch` will surface TS errors anywhere a `ListSearch` literal is built without it — fix those (the route `LIST_SEARCH_DEFAULTS` covers most). Run `bunx tsc -b` and resolve.

---

### Task 2: corpus fetcher owned filter

**Files:** `src/store/corpus/corpus-runtime.ts` (+ append to `corpus-runtime.test.ts`)

- [ ] **Step 1: failing test** (append)
```ts
test("makeCorpusFetcher owned filter keeps only owned / only missing", async () => {
  globalThis.fetch = mock(async () => new Response(gzipOf([
    { id: "base1-1", name: "A", imageUrl:"", imageUrlSmall:"", supertype:"P", setId:"base1", number:"1" },
    { id: "base1-2", name: "B", imageUrl:"", imageUrlSmall:"", supertype:"P", setId:"base1", number:"2" },
  ]), { status: 200, headers: { ETag: '"v2"' } })) as unknown as typeof fetch;
  await loadCorpus();
  const owned = new Set(["base1-1"]);
  const f1 = makeCorpusFetcher({ setId: "base1", relevance: false }, { mode: "owned", ownedCardIds: owned });
  expect((await f1("k-owned", 1, 20)).cards.map((c) => c.id)).toEqual(["base1-1"]);
  const f2 = makeCorpusFetcher({ setId: "base1", relevance: false }, { mode: "missing", ownedCardIds: owned });
  expect((await f2("k-missing", 1, 20)).cards.map((c) => c.id)).toEqual(["base1-2"]);
});
```

- [ ] **Step 2: run → fail. Step 3: implement** — add the optional param + filter:
```ts
export interface OwnedFilter { mode: "owned" | "missing"; ownedCardIds: Set<string>; }

export function makeCorpusFetcher(params: CorpusQuery, owned?: OwnedFilter): CardFetcher {
  return (key, page, pageSize) => {
    const index = useCorpusRuntime.getState().index;
    if (!index) return Promise.resolve({ cards: [], totalCount: 0 });
    let perKey = queryCache.get(index);
    if (!perKey) { perKey = new Map(); queryCache.set(index, perKey); }
    let all = perKey.get(key);
    if (!all) {
      const sets = useStore.getState().sets ?? [];
      const setsById = new Map(sets.map((s) => [s.id, s]));
      all = queryCorpus(index, params, setsById);
      perKey.set(key, all);
    }
    const list = owned
      ? all.filter((c) => (owned.mode === "owned" ? owned.ownedCardIds.has(c.id) : !owned.ownedCardIds.has(c.id)))
      : all;
    return Promise.resolve({ cards: list.slice((page - 1) * pageSize, page * pageSize), totalCount: list.length });
  };
}
```
(The grid's `key` already includes `search.owned`, so cached lists don't bleed across modes.)

- [ ] **Step 4: run → pass; tsc 0; lint + commit** (`feat(vault): owned filter in corpus fetcher`).

---

### Task 3: SearchControls + CardGridIsland

**Files:** `search-controls.tsx`, `card-grid-island.tsx`

- [ ] **SearchControls** — add an owned tri-state next to the search input (a shadcn `Select`): value `value.owned`, options `All cards` / `Owned` / `Not owned` → `onChange({ owned })`. (Map to `OwnedMode`; reuse the `FilterSelect` look or a small inline `Select`.)

- [ ] **CardGridIsland** — read `useOwnedIndex()` (`../../store/userland/selectors`) → `ownedCardIds = new Set(ownedIndex.keys())`; build `ownedFilter = search.owned === "all" ? undefined : { mode: search.owned, ownedCardIds }`; pass it as `makeCorpusFetcher(buildCorpusQuery(search, context), ownedFilter)` (both the page-1 effect and `loadMore`). Add `search.owned` + (when filtering) `ownedCardIds.size` to the memo `queryKey` so toggling the filter / adding a card refetches.

- [ ] **Verify:** `bunx tsc -b` 0 + `bun test` all pass (the existing `card-grid-island.test.tsx` must stay green — `useOwnedIndex` returns empty in tests; owned defaults to "all" → no filtering). Lint. Commit (`feat(vault): owned/not-owned filter control on card lists`).

---

### Task 4: Verify + smoke + review

- [ ] `bunx tsc -b` & `bunx biome check src` & `bun test` & `bun run check:bundle` — green.
- [ ] Browser smoke (`preview_start vite`): Base set page → owned filter = **Owned** → only the owned Alakazam shows; **Not owned** → Alakazam hidden, rest show; **All** → all 102. Search page same. 0 console errors.
- [ ] Review (`caveman:cavecrew-reviewer`): filter correctness (owned vs missing), pagination/total under filter, queryKey includes owned (refetch), no regression to unfiltered grids, no perf trap.

## Self-review
- `owned` param (T1), fetcher filter (T2), control + grid wiring (T3). ✓ Works on set + search pages.
