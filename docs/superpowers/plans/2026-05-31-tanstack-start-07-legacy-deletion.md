# TanStack Start Migration — Plan 07: Legacy SPA Deletion

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all orphaned legacy SPA code (old `pages/`, `root-layout.tsx`, `api.ts`, legacy hooks/components/slices) and uninstall `react-router`, leaving only the live TanStack Start app — with the build green and every route still serving at each step.

**Architecture:** Severs first, deletes second. The live app reaches `api.ts`/`react-router`/legacy hooks only through a handful of thin links (per the import-graph investigation): two type imports, `apiBase` in the corpus runtime, the `CardFetcher` type, and the unused `api-cache`/`pack-cards` store slices. Each sever is a behavior-preserving redirect to the already-existing server seam. Once severed, the orphan set is provably unreferenced and deletes cleanly; `react-router` then has zero importers.

**Tech Stack:** Bun, TypeScript. Reuses `src/server/card-mappers.ts` (types), `src/server/card-data.ts` (`getSetsFn`, `apiBase`). No new features.

---

## Why this is safe (from the import-graph investigation)

- **Zero live files import `react-router`** — all 13 importers are orphans. Uninstall unblocked once they're deleted.
- Live code touches `api.ts` only via: `apiBase` (corpus-runtime), `PokemonSet`/`PokemonListEntry` types (corpus-engine, store/index), and the `api-cache-slice`/`pack-cards-slice` (composed into `store/index` but their fetcher methods are never called by live code).
- `corpus-runtime` reads `useStore.getState().sets` to hydrate corpus results with set names → we keep a **slimmed sets-only slice** repointed to `getSetsFn` (a client-callable server fn) rather than degrade set names to ids.

---

## Severs (Tasks 1–3) then Deletions (Tasks 4–6)

### Task 1: Re-point type imports off `api.ts`

**Files:**
- Modify: `src/store/corpus/corpus-engine.ts`
- Modify: `src/store/index.ts`
- Modify: `src/store/corpus/corpus-engine.test.ts`

- [ ] **Step 1: Re-point `PokemonSet` in corpus-engine.** `src/store/corpus/corpus-engine.ts` line 1: change `import type { PokemonSet } from "../../api";` → `import type { PokemonSet } from "../../server/card-mappers";`

- [ ] **Step 2: Re-point types in store/index.** `src/store/index.ts` line 3: change `import type { PokemonListEntry, PokemonSet } from "../api";` → `import type { PokemonListEntry, PokemonSet } from "../server/card-mappers";`

- [ ] **Step 3: Re-point the corpus-engine test import.** `src/store/corpus/corpus-engine.test.ts`: any `from "../../api"` → `from "../../server/card-mappers"`.

- [ ] **Step 4: Typecheck** — `bun run typecheck` → 0. (`card-mappers` exports both types — verified.)

- [ ] **Step 5: Commit**

```bash
git add src/store/corpus/corpus-engine.ts src/store/index.ts src/store/corpus/corpus-engine.test.ts
git commit -m "refactor(store): source PokemonSet/PokemonListEntry types from server seam"
```

---

### Task 2: Extract `apiBase` (client) + `CardFetcher` type off legacy modules

**Files:**
- Create: `src/lib/api-base-client.ts`
- Modify: `src/store/corpus/corpus-runtime.ts`

- [ ] **Step 1: Create `src/lib/api-base-client.ts`** with the client-side base-URL logic (mirrors `api.ts`'s `VITE_API_BASE` variant — the corpus runs in the browser, so it uses the public env var, NOT `process.env`).

```ts
// Client-side API base (browser). The corpus is fetched client-side, so it uses
// the Vite public env var. Server code uses src/server/card-data.ts:apiBase
// (process.env.API_BASE) instead.
const RAW = import.meta.env.VITE_API_BASE as string | undefined;
const API_BASE = RAW ? RAW.replace(/\/$/, "") : "https://api.pokemontcg.io";

export function apiBase(): string {
	return API_BASE;
}
```

- [ ] **Step 2: Re-point corpus-runtime's `apiBase` import + inline the `CardFetcher` type.** In `src/store/corpus/corpus-runtime.ts`:
  - line 2: `import { apiBase } from "../../api";` → `import { apiBase } from "../../lib/api-base-client";`
  - line 4 (`import type { CardFetcher } from "../../hooks/use-cards";`): remove it and add the type locally (it's a 4-line function type). Add near the top:
```ts
export type CardFetcher = (
	key: string,
	page: number,
	pageSize: number,
) => Promise<{ cards: HoloCardData[]; totalCount: number }>;
```
(`HoloCardData` is already imported in corpus-runtime; confirm and reuse.)

- [ ] **Step 3: Typecheck + corpus tests** — `bun run typecheck` → 0; `bun test src/store/corpus/` → pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/api-base-client.ts src/store/corpus/corpus-runtime.ts
git commit -m "refactor(corpus): client apiBase + local CardFetcher type (off legacy modules)"
```

---

### Task 3: Slim the store — drop unused slices, keep sets repointed

**Files:**
- Modify: `src/store/index.ts`
- Create: `src/store/sets-slice.ts`
- Delete: `src/store/api-cache-slice.ts`, `src/store/api-cache-slice.test.ts`, `src/store/pack-cards-slice.ts`, `src/store/pack-cards-slice.test.ts`
- Modify: `src/store/index.test.ts` (if it asserts removed slice state)

- [ ] **Step 1: Create a minimal sets slice** `src/store/sets-slice.ts` repointed to the server fn (client-callable). This is the ONLY piece of `api-cache-slice` live code needs (corpus set-name hydration).

```ts
import type { StateCreator } from "zustand";
import { getSetsFn } from "../server/card-data";
import type { PokemonSet } from "../server/card-mappers";
import { shouldRefetch } from "./freshness";

export interface SetsSlice {
	sets: PokemonSet[] | null;
	setsFetchedAt: number | null;
	setsLoading: boolean;
	loadSets: () => Promise<void>;
}

export const createSetsSlice: StateCreator<SetsSlice> = (set, get) => ({
	sets: null,
	setsFetchedAt: null,
	setsLoading: false,
	loadSets: async () => {
		const { setsLoading, setsFetchedAt } = get();
		if (setsLoading) return;
		if (!shouldRefetch({ lastFetchedAt: setsFetchedAt, kind: "sets" })) return;
		set({ setsLoading: true });
		try {
			const sets = await getSetsFn();
			set({ sets, setsFetchedAt: Date.now(), setsLoading: false });
		} catch (e) {
			console.error(e);
			set({ setsLoading: false });
		}
	},
});
```

- [ ] **Step 2: Rewrite `src/store/index.ts`** to compose only the live slices: `SetsSlice`, `CollectionSlice`, `CardsSlice`. Drop `ApiCacheSlice` and `PackCardsSlice`. Update `AppStore`, `PersistedStore`, `partialize`, and `composed`. Bump `STORAGE_VERSION` and add a migration that strips the removed fields.

Read the current `index.ts` first, then produce the slimmed version:
- `AppStore = SetsSlice & CollectionSlice & CardsSlice`
- `PersistedStore` keeps: `sets`, `setsFetchedAt`, `owned`, `cardsCache`, `cardsCacheOrder`. Drop: `pokemonList*`, `types*`, `rarities*`, `supertypes*`, `subtypes*`, `packCards*`.
- `partialize` returns only the kept fields.
- `composed` spreads `createSetsSlice`, `createCollectionSlice`, `createCardsSlice`.
- Bump `STORAGE_VERSION` to `7`; add `if (version < 7) next = { ...next, /* drop removed keys implicitly by not carrying them */ }` — simplest: on `version < 7`, reset to a clean shape preserving `owned` + `cardsCache`:
```ts
			if (version < 7)
				next = {
					sets: null,
					setsFetchedAt: null,
					owned: (next as { owned?: unknown }).owned ?? {},
					cardsCache: {},
					cardsCacheOrder: [],
				} as Partial<AppStore>;
```

- [ ] **Step 3: Delete the dropped slices + their tests.**

```bash
git rm src/store/api-cache-slice.ts src/store/api-cache-slice.test.ts src/store/pack-cards-slice.ts src/store/pack-cards-slice.test.ts
```

- [ ] **Step 4: Fix `src/store/index.test.ts`** if it references removed slices/fields (pokemonList, types, packCards). Keep assertions for the surviving shape (sets, owned, cardsCache). If the test heavily tested removed behavior, trim those cases.

- [ ] **Step 5: Typecheck + store tests + build** — run in parallel: `bun run typecheck` (0), `bun test src/store/` (pass), `bun run build` (exit 0 — confirms no remaining importer of the deleted slices).

- [ ] **Step 6: SSR-smoke the collection + a corpus search still work** (the two live store consumers):
```bash
node .output/server/index.mjs & SERVER_PID=$!
sleep 3
curl -s -o /dev/null -w "collection=%{http_code}\n" http://localhost:3000/collection
curl -s -o /dev/null -w "search=%{http_code}\n" "http://localhost:3000/search?q=charizard"
kill $SERVER_PID
```
Expected: both 200.

- [ ] **Step 7: Commit**

```bash
git add src/store/sets-slice.ts src/store/index.ts src/store/index.test.ts
git commit -m "refactor(store): slim to sets+collection+cards slices (drop unused api-cache/pack-cards)"
```

---

### Task 4: Delete orphaned source files

**Files:** (all deletions — the orphan set from the investigation)

- [ ] **Step 1: Delete orphaned pages, layout, legacy api, hooks.**

```bash
git rm \
  src/api.ts \
  src/root-layout.tsx \
  src/pages/browse-page.tsx \
  src/pages/card-error-page.tsx \
  src/pages/card-loader.ts \
  src/pages/card-prefetch.ts \
  src/pages/collection-page.tsx \
  src/pages/holo-debug-page.tsx \
  src/pages/holo-debug-page.css \
  src/pages/home.tsx \
  src/hooks/use-cards.ts \
  src/hooks/use-filter-values.ts \
  src/hooks/use-pokemon-list.ts \
  src/hooks/use-sets.ts \
  src/hooks/use-url-selection.ts
```

- [ ] **Step 2: Delete orphaned components.**

```bash
git rm \
  src/components/app-shell/about-dialog.tsx \
  src/components/app-shell/repo-link.tsx \
  src/components/app-shell/toolbar.tsx \
  src/components/card-dialog/card-dialog.tsx \
  src/components/card-dialog/price-lines.ts \
  src/components/card-grid.tsx \
  src/components/card-grid.css \
  src/components/cross-link-overlay/cross-link-overlay.tsx \
  src/components/cross-link-overlay/index.ts \
  src/components/install-prompt/install-prompt.tsx \
  src/components/install-prompt/install-prompt.css \
  src/components/install-prompt/index.ts \
  src/components/offline-indicator/offline-indicator.tsx \
  src/components/offline-indicator/offline-indicator.css \
  src/components/offline-indicator/index.ts \
  src/components/pack-dialog/pack-dialog.tsx \
  src/components/pokemon-filter.tsx \
  src/components/pokemon-filter.css \
  src/components/pokemon-timeline/pokemon-timeline.tsx \
  src/components/pokemon-timeline/pokemon-timeline.css \
  src/components/pokemon-timeline/group-cards-by-era.ts \
  src/components/pokemon-timeline/index.ts \
  src/components/search-bar/filter-select.tsx \
  src/components/search-bar/scope-toggle.tsx \
  src/components/search-bar/search-bar.tsx \
  src/components/search-bar/search-input.tsx \
  src/components/series-sidebar/series-sidebar.tsx \
  src/components/series-sidebar/series-sidebar-item.tsx \
  src/components/view-mode-toggle/view-mode-toggle.tsx \
  src/components/view-mode-toggle/index.ts \
  src/components/booster-pack/booster-pack.tsx \
  src/components/booster-pack/index.ts
```
Note: KEEP `src/components/booster-pack/booster-pack.css` — it's imported by `src/components/shell/set-tile.tsx`. Verify it is NOT in the `git rm` list above (it isn't).

- [ ] **Step 3: Delete the now-orphaned recents? NO — `recents.ts` is used by Plan 06's home + card route.** Confirm: `grep -rl "store/recents" src --include=*.tsx --include=*.ts | grep -v test` should list `home-recents.tsx` and `$card.tsx`. If so, KEEP `recents.ts`. (The investigation listed it orphaned, but Plan 06 added live consumers — verify and keep.)

- [ ] **Step 4: Typecheck + build to surface any missed importer** — `bun run typecheck` 2>&1; `bun run build` 2>&1. Expected: BOTH exit 0. If either reports a missing import, that file was NOT actually orphaned — STOP, report the exact error + the importer, and re-evaluate (do not delete more to mask it).

- [ ] **Step 5: Commit**

```bash
git commit -m "refactor(migrate): delete orphaned legacy SPA source (pages, layout, api, hooks, components)"
```
(All deletions were staged via `git rm`.)

---

### Task 5: Delete orphaned test files

**Files:** (test deletions for deleted subjects)

- [ ] **Step 1: Delete tests whose subjects were removed.**

```bash
git rm \
  src/app.test.tsx \
  src/sanity.test.tsx \
  src/components/booster-pack/booster-pack.test.tsx \
  src/components/card-dialog/card-dialog.test.tsx \
  src/components/card-grid.test.tsx \
  src/components/cross-link-overlay/cross-link-overlay.test.tsx \
  src/components/install-prompt/install-prompt.test.tsx \
  src/components/offline-indicator/offline-indicator.test.tsx \
  src/components/pack-dialog/pack-dialog.test.tsx \
  src/components/pokemon-timeline/pokemon-timeline.test.tsx \
  src/components/pokemon-timeline/group-cards-by-era.test.ts \
  src/hooks/use-cards.test.tsx \
  src/hooks/use-filter-values.test.tsx \
  src/hooks/use-url-selection.test.tsx \
  src/pages/browse-page.test.tsx \
  src/pages/card-error-page.test.tsx \
  src/pages/card-prefetch.test.ts \
  src/pages/collection-page.test.tsx \
  src/pages/home.test.tsx
```
Note: check each path exists first (`ls`), since some test files may not exist. Use `git rm --ignore-unmatch` for any that 404, OR list only the ones `git ls-files` shows. KEEP: `src/components/collection-toggle/collection-toggle.test.tsx`, `src/store/index.test.ts`, `src/store/corpus/*.test.ts` (live subjects). Also check `src/components/booster-pack/booster-pack.test.tsx` imports — if it tests only the deleted `.tsx`, delete it (done above).

- [ ] **Step 2: Run the full test suite** — `bun test`. Expected: all remaining pass, with the orphan suites gone. Report the new total. If a remaining test fails because it imported a deleted module, that test needs deletion too (or it was testing live code that broke — investigate).

- [ ] **Step 3: Commit**

```bash
git commit -m "test(migrate): delete tests for removed legacy modules"
```

---

### Task 6: Uninstall `react-router` + final gate

**Files:**
- Modify: `package.json`, `bun.lock`

- [ ] **Step 1: Confirm zero importers remain.**

```bash
grep -rln 'from "react-router"' src --include='*.ts' --include='*.tsx'
```
Expected: NO output. If anything prints, STOP — that file must be migrated or deleted first; report it.

- [ ] **Step 2: Uninstall.**

```bash
bun remove react-router
```

- [ ] **Step 3: Full gate (parallel):** `bun run typecheck` (0), `biome check --config-path=. src` (clean), `bun test` (all pass), `bun run build` (exit 0).

- [ ] **Step 4: SSR-smoke every route** (regression guard after mass deletion):
```bash
node .output/server/index.mjs & SERVER_PID=$!
sleep 3
for p in "/" "/sword-shield" "/sword-shield/brilliant-stars" "/search?q=charizard" "/pokemon/charizard" "/collection"; do
  printf "%s -> " "$p"; curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000${p}"
done
# a real card link:
curl -s http://localhost:3000/sword-shield/brilliant-stars | grep -oE '/sword-shield/brilliant-stars/[a-z0-9-]+' | head -1
kill $SERVER_PID
```
Expected: all routes 200; a card link present. Report each status.

- [ ] **Step 5: Commit**

```bash
git add package.json bun.lock
git commit -m "build(migrate): uninstall react-router (zero importers remain)"
```

---

## Self-review

- **Spec coverage:** `map.md` "Dropped" section — `browse-page`, legacy hooks, `api-cache-slice`, `use-url-selection`, `main.tsx` (already gone P01), `basename` (gone P01), `api.ts`, `root-layout.tsx`, `react-router`. All addressed. `pack-cards-slice` + legacy components beyond the map's explicit list also removed (they're orphaned by the same cutover).
- **Placeholders:** none — every deletion is an explicit `git rm`; every sever shows the code.
- **Safety ordering:** severs (T1–3) make the orphan set provably unreferenced BEFORE deletion (T4–6); typecheck+build gate after each deletion batch catches any missed live import immediately.
- **Type consistency:** `SetsSlice` (T3) replaces `ApiCacheSlice`'s live subset; `AppStore`/`PersistedStore` updated together; `STORAGE_VERSION` bumped with a migration. `apiBase`/`CardFetcher` relocated (T2) before their legacy homes are deleted (T4).
- **Risk:** the store migration (v6→v7) resets server-data caches but preserves `owned` (collection) — users keep their collection across the upgrade. The `recents.ts` keep-check (T4.3) prevents deleting a Plan-06-live module. Build-after-each-batch is the safety net.

## Carried forward

- **Plan 08:** PWA service worker under SSR (the old `install-prompt`/`offline-indicator` were deleted — PWA is re-introduced fresh against Nitro/SSR), nginx server block, systemd unit, GitHub Actions self-hosted runner deploy.
- README rewrite (already queued as a spawned task).
- Optional: absorb the CF Worker into Start server routes (move corpus + key on-box).
