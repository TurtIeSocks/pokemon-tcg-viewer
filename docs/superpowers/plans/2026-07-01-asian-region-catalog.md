# Asian Region Catalog (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full separate-region Asian card catalog (ja/ko/zh-tw/zh-cn/th/id) that users can browse, view, and own in the Vault — built on the Phase 1 region(corpus) + language(overlay) two-axis infrastructure.

**Architecture:** A second base corpus (`asia`, built from TCGdex `/v2/ja`, the id superset) is served as a new R2 blob and lazy-loaded client-side into a region-keyed index map. The five non-base Asian languages (ko/zh-tw/zh-cn/th/id) reuse the existing i18n name-overlay lane. Region is derived from the active display language (the two language sets are disjoint), so browse/search/nav-tree/slug-index become region-parameterized; routes keep their shape and `?lang` carries the region. Card ids are globally unique across regions, so the Vault hydrates cross-region owned cards via a merged `byId` with no schema change or migration.

**Tech Stack:** TanStack Start (React 19, TanStack Router), Zustand, IndexedDB (`fake-indexeddb` in tests), Cloudflare Worker + R2, Bun test runner (happy-dom), Biome, TCGdex REST API (self-hosted `tcgdex/server:edge` Docker mirror at build time).

## Global Constraints

- **Spec authority:** `docs/superpowers/specs/2026-07-01-asian-region-catalog-design.md`. Every task implicitly inherits its decisions and Assumptions (§8).
- **Two disjoint id universes; card ids globally unique.** Never namespace a `cardId`. Never add a `Stack.region` field. No userland migration — all changes are additive.
- **`language ⇒ region`** via `LANGUAGE_REGION`. Region base languages: `{ west: "en", asia: "ja" }`. Base-language names live in the base corpus; only non-base languages use overlay blobs.
- **Optional fields are `null`, never `undefined`** (userland). Money in minor units (cents). Userland ids are UUIDv7. (Unchanged here — no userland persistence changes.)
- **Tests must not hit the network.** Any test rendering a card grid must pre-seed the corpus runtime (`useCorpusRuntime.setState({ ... })`) so `loadCorpus` early-returns. Never let a live corpus leak into the shared `fake-indexeddb`.
- **Manual `useMemo`/`useCallback` are intentional** (React Compiler is on; codebase memoizes by hand). Do not strip them.
- **The worker cannot import app code** — it keeps its own copy of the lang/region allow-lists. Keep them in sync with `src/lib/languages.ts` (cross-reference by comment).
- **Verification cadence:** run lint + typecheck + the touched spec in parallel after each task. Full suite only at phase boundaries / before the PR. Background any command >5s.
- **Commit after every task.** Biome check the touched files: `bunx biome check --write --config-path=. <files>`.
- **No em-dashes in user-facing copy** (labels, hints). Code/comments unaffected.
- **End state:** reviewed **draft** PR based on `main`. Do NOT merge (prod corpus+deploy CI is a human gate).

---

## File Structure (decomposition)

**Build / CI**
- `scripts/build-corpus.ts` — add `baseLang` param; region-aware output filenames + asset prefix.
- `scripts/build-i18n.ts` — extend `I18N_LANGS` with the five Asian overlay languages.
- `.github/workflows/build-corpus.yml` — build + upload the asia corpus, detail, and five overlays.

**Serve**
- `worker/src/index.ts` — `/corpus-region/:region(/version|/detail)` routes; extend the `/corpus-i18n` overlay-language gate.

**Languages (single source of truth)**
- `src/lib/languages.ts` — `Region`, `LANGUAGE_REGION`, `REGION_BASE_LANGUAGE`, `regionForLanguage`; extend `SUPPORTED_LANGUAGES`, `LANGUAGE_LABELS`, `NAME_TRANSLATING_LANGUAGES`.

**Client corpus runtime**
- `src/store/corpus/corpus-store.ts` — region-keyed IDB read/write.
- `src/store/corpus/corpus-runtime-store.ts` — `indices: Partial<Record<Region, CorpusIndex>>` + `activeRegion`.
- `src/store/corpus/corpus-runtime.ts` — `loadCorpus(region)`, lazy asia trigger, `useEnsureRegionCorpus`.
- `src/store/corpus/corpus-engine.ts` / `corpus-types.ts` — `region` tag on `CorpusCard` (at build/index time) + `resolveCardAcrossRegions` merged lookup.
- `src/server/corpus-loader.ts` — memoize one index per region.
- `src/server/corpus-server.ts` — thread `region`/`lang` into the server fns.

**Browse / routing**
- `src/server/card-data-fetch.ts` — `fetchAllSets(baseLang)`.
- `src/server/nav-tree.ts` / `src/lib/nav-tree.ts` — per-region nav tree.
- `src/lib/slug.ts` — slug index built per region (no signature change; called per region).
- `src/routes/$series/**` — loaders derive region from `lang`; `validateSearch` accepts the six Asian langs.
- `src/components/islands/{global-language-control,card-language-control}.tsx` — grouped Western/Asian language picker.

**Userland**
- `src/store/userland/selectors.ts`, `card-rows.ts`, `binder-progress.ts` — merged `byId` + face-language rule.
- `src/components/collection/stack-form-schema.ts` — inherits the extended language set (verify grouped UI).

---

## Phase A — Foundations (languages, worker, build)

### Task A1: Region model in `languages.ts`

**Files:**
- Modify: `src/lib/languages.ts`
- Test: `src/lib/languages.test.ts` (create if absent)

**Interfaces:**
- Produces:
  - `type Region = "west" | "asia"`
  - `SUPPORTED_LANGUAGES` extended to `["en","fr","de","es","it","pt","ja","ko","zh-tw","zh-cn","th","id"]`
  - `type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]`
  - `LANGUAGE_REGION: Record<SupportedLanguage, Region>`
  - `REGION_BASE_LANGUAGE: Record<Region, SupportedLanguage>` = `{ west: "en", asia: "ja" }`
  - `regionForLanguage(lang: string): Region` (unknown → `"west"`)
  - `ASIAN_LANGUAGES: readonly SupportedLanguage[]` (`ja ko zh-tw zh-cn th id`) — for grouped UI
  - `LANGUAGE_LABELS`, `NAME_TRANSLATING_LANGUAGES` extended
  - `isSupportedLanguage`, `toSupportedLanguage` unchanged in signature; `toSupportedLanguage` no longer maps `ja`→`en` (ja is first-class now).

- [ ] **Step 1: Write failing tests**

```ts
// src/lib/languages.test.ts
import { describe, expect, it } from "bun:test";
import {
  LANGUAGE_REGION, REGION_BASE_LANGUAGE, regionForLanguage,
  SUPPORTED_LANGUAGES, isSupportedLanguage, toSupportedLanguage, ASIAN_LANGUAGES,
} from "./languages";

describe("region model", () => {
  it("classifies every supported language into a region", () => {
    for (const l of SUPPORTED_LANGUAGES) {
      expect(LANGUAGE_REGION[l]).toBeDefined();
    }
  });
  it("maps Asian langs to asia, Western to west", () => {
    expect(regionForLanguage("ja")).toBe("asia");
    expect(regionForLanguage("zh-tw")).toBe("asia");
    expect(regionForLanguage("en")).toBe("west");
    expect(regionForLanguage("fr")).toBe("west");
  });
  it("unknown language falls back to west", () => {
    expect(regionForLanguage("xx")).toBe("west");
  });
  it("region base languages are en and ja", () => {
    expect(REGION_BASE_LANGUAGE.west).toBe("en");
    expect(REGION_BASE_LANGUAGE.asia).toBe("ja");
  });
  it("ja is now a first-class supported language (not normalized to en)", () => {
    expect(isSupportedLanguage("ja")).toBe(true);
    expect(toSupportedLanguage("ja")).toBe("ja");
  });
  it("ASIAN_LANGUAGES lists exactly the six Asian languages", () => {
    expect([...ASIAN_LANGUAGES].sort()).toEqual(
      ["id","ja","ko","th","zh-cn","zh-tw"]);
  });
});
```

- [ ] **Step 2: Run to verify fail** — `bun test src/lib/languages.test.ts` → FAIL (exports missing).

- [ ] **Step 3: Implement.** Extend `src/lib/languages.ts`:
  - Append the six Asian codes to `SUPPORTED_LANGUAGES`.
  - Add labels (endonyms): `ja: "日本語", ko: "한국어", "zh-tw": "繁體中文", "zh-cn": "简体中文", th: "ไทย", id: "Bahasa Indonesia"`.
  - Add `ASIAN_LANGUAGES = ["ja","ko","zh-tw","zh-cn","th","id"] as const`.
  - Add `type Region`, `LANGUAGE_REGION` (en/fr/de/es/it/pt → `west`; the six → `asia`), `REGION_BASE_LANGUAGE`, `regionForLanguage` (`isSupportedLanguage(lang) ? LANGUAGE_REGION[lang] : "west"`).
  - Add all six to `NAME_TRANSLATING_LANGUAGES` (they translate names).
  - Remove the `ja → en` normalization from `toSupportedLanguage` (now `ja` is supported so the existing `isSupportedLanguage` guard already keeps it).
  - Update `LANGUAGE_COVERAGE`: add placeholder `1` for `ja` and `0` for the five overlays (regenerated by `build-i18n` later; a comment says so). Keep the record total so `tsc` stays happy.

- [ ] **Step 4: Run to verify pass** — `bun test src/lib/languages.test.ts` → PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
bunx tsc -b
bunx biome check --write --config-path=. src/lib/languages.ts src/lib/languages.test.ts
git add src/lib/languages.ts src/lib/languages.test.ts
git commit -m "feat(asian-catalog): region model + Asian languages in languages.ts"
```

> **Note for the implementer:** extending `SUPPORTED_LANGUAGES` will ripple: `stack-form-schema.ts` (language enum), `validateSearch` on the card route, and any exhaustive `Record<SupportedLanguage, …>` will now demand the six new keys. `tsc -b` will list every site. Fix the *type-completeness* sites in this task (add the keys); defer *behavioral* wiring to its owning task. If a site needs real behavior not yet built, add the key with the safe default and leave a `// asian-catalog: wired in Task X` comment.

---

### Task A2: Worker region-corpus routes + overlay-language gate

**Files:**
- Modify: `worker/src/index.ts`
- Test: `worker/src/index.test.ts`

**Interfaces:**
- Produces worker routes: `GET /corpus-region/asia`, `/corpus-region/asia/version`, `/corpus-region/asia/detail` → R2 keys `corpus/region/asia/latest.json.gz`, `.../meta.json`, `.../detail-latest.json.gz`. Same ETag/SWR/CORS as `/corpus`.
- `/corpus-i18n/{lang}` gate extended to accept `ko zh-tw zh-cn th id` (NOT `ja` — no overlay).

- [ ] **Step 1: Write failing tests** (mirror existing `/corpus-i18n` tests). Add cases:
  - `GET /corpus-region/asia` when R2 has the object → 200 + `ETag` + CORS + `Cache-Control` with `s-maxage=3600`.
  - `GET /corpus-region/asia` when R2 empty → 503.
  - `GET /corpus-region/asia/version` → serves `corpus/region/asia/meta.json` as JSON.
  - `GET /corpus-region/xx` (unsupported region) → 404.
  - `GET /corpus-i18n/ko` with object → 200; `GET /corpus-i18n/ja` → 404 (ja not in overlay gate).
  - Conditional GET: matching `If-None-Match` on `/corpus-region/asia` → 304.
  Use the existing test's R2 mock/harness shape.

- [ ] **Step 2: Run to verify fail** — `bun test worker/src/index.test.ts` → FAIL.

- [ ] **Step 3: Implement** in `worker/src/index.ts`:
  - Add `const SUPPORTED_REGIONS = ["asia"] as const;` + `isSupportedRegion`.
  - Add a matcher before the `/v2/` fallthrough:
    ```ts
    const regionMatch = url.pathname.match(/^\/corpus-region\/([a-z-]+)(\/version|\/detail)?$/);
    if (regionMatch) {
      const [, region, suffix] = regionMatch;
      if (!isSupportedRegion(region)) return notFound(env);
      const key = suffix === "/version"
        ? `corpus/region/${region}/meta.json`
        : suffix === "/detail"
          ? `corpus/region/${region}/detail-latest.json.gz`
          : `corpus/region/${region}/latest.json.gz`;
      // version → JSON headers (like /corpus-detail/version); else octet-stream + ETag + serveCorpus()
    }
    ```
    Reuse `serveCorpus`, `corsHeaders`, and the existing header shapes. The base blob route should use the same `caches.default` edge-cache pattern as `/corpus` (optional but preferred for parity).
  - Change the `/corpus-i18n` gate: introduce `const OVERLAY_LANGS = ["fr","de","es","it","pt","ko","zh-tw","zh-cn","th","id"] as const;` and use it for `isSupportedLang` in the i18n routes (rename to `isOverlayLang` for clarity). Add a comment: `// keep in sync with src/lib/languages.ts (worker cannot import app code)`.

- [ ] **Step 4: Run to verify pass** — `bun test worker/src/index.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
bunx biome check --write --config-path=. worker/src/index.ts worker/src/index.test.ts
git add worker/src/index.ts worker/src/index.test.ts
git commit -m "feat(asian-catalog): worker region-corpus routes + Asian overlay gate"
```

---

### Task A3: `build-corpus.ts` — region/base-lang parameter

**Files:**
- Modify: `scripts/build-corpus.ts`
- Test: `scripts/build-corpus.test.ts`

**Interfaces:**
- Produces: `buildCorpus(opts?: { baseLang?: string; out?: string })` (or an env `TCGDEX_BASE_LANG`) — default `baseLang="en"` preserves today's behavior exactly. Derives the per-region base URL as `${TCGDEX_ROOT}/v2/${baseLang}` (extract the root from the existing `TCGDEX_BASE`, mirroring `langBase()` in `build-i18n.ts`).
- CLI: `bun run scripts/build-corpus.ts <out.json.gz> [--base-lang ja]`. When `--base-lang ja`, writes `corpus.asia.json.gz` (or the given out), `corpus-detail.asia.json.gz`, meta; the asset prefix follows the lang (`https://assets.tcgdex.net/${baseLang}/`).

- [ ] **Step 1: Read `scripts/build-corpus.ts` fully** (esp. the `TCGDEX_BASE` const, `ASSET_PREFIX`, the sets-list crawl at ~line 289, per-set enumeration ~line 318, the ptcg overlay call, and the `Bun.write` outputs ~line 453). This task threads `baseLang` through those.

- [ ] **Step 2: Write failing test** in `scripts/build-corpus.test.ts`: a unit test for the URL-derivation helper (extract it as `baseUrlFor(baseLang)`), asserting `baseUrlFor("en")` ends `/v2/en` and `baseUrlFor("ja")` ends `/v2/ja`, and that the asset prefix for `ja` is `https://assets.tcgdex.net/ja/`. If the file mocks fetch to build a tiny corpus, add a case that `--base-lang ja` fetches from the `/v2/ja` sets endpoint (assert on the mock's recorded URL).

- [ ] **Step 3: Run to verify fail.**

- [ ] **Step 4: Implement.** Extract `baseUrlFor(baseLang)` + `assetPrefixFor(baseLang)`; thread `baseLang` from CLI/env into the sets crawl, per-set enumeration, per-card detail fetch, and output filenames. **Skip the ptcg overlay when `baseLang !== "en"`** (guard the `merge-overlay`/`ptcg-overlay` call). Add the **build-validation gate**: after the asia crawl, if `stubs.length < 0.5 * Σ cardCount.total`, `throw new Error("asia corpus crawl returned too few cards — mirror set.cards[] likely empty")`.

- [ ] **Step 5: Run to verify pass.**

- [ ] **Step 6: Commit**

```bash
bunx biome check --write --config-path=. scripts/build-corpus.ts scripts/build-corpus.test.ts
git add scripts/build-corpus.ts scripts/build-corpus.test.ts
git commit -m "feat(asian-catalog): build-corpus base-lang param + asia validation gate"
```

---

### Task A4: `build-i18n.ts` — extend overlay languages

**Files:**
- Modify: `scripts/build-i18n.ts`
- Test: `scripts/build-i18n.test.ts`

- [ ] **Step 1: Write failing test** asserting `I18N_LANGS` includes `ko`, `zh-tw`, `zh-cn`, `th`, `id` (and still `fr de es it pt`), and NOT `ja`.
- [ ] **Step 2: Run to verify fail.**
- [ ] **Step 3: Implement** — extend `I18N_LANGS = ["fr","de","es","it","pt","ko","zh-tw","zh-cn","th","id"]`. The `langBase()` derivation and blob output paths are unchanged (these overlay whatever ids `/v2/{lang}` returns — JP-lineage ids for the Asian langs). Add a comment noting ja is the asia base (no overlay).
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** — `feat(asian-catalog): build-i18n Asian overlay languages`.

---

### Task A5: CI workflow — build + upload asia artifacts

**Files:**
- Modify: `.github/workflows/build-corpus.yml`

**Interfaces:** consumes A3 (`--base-lang ja`) and A4 (extended overlays) and A2 (R2 keys).

- [ ] **Step 1: Read the current workflow** (the Docker mirror step, the EN build + i18n loop, the wrangler upload steps).
- [ ] **Step 2: Add steps** after the EN corpus + overlays:
  - `bun run scripts/build-corpus.ts corpus.asia.json.gz --base-lang ja` (with the same Docker-mirror env: `MAX_WORKERS=2`, `TCGCSV_USER_AGENT=x`, `SKIP_PTCG_OVERLAY` implied for non-en).
  - Upload `corpus.asia.json.gz` → `corpus/region/asia/latest.json.gz`, detail → `corpus/region/asia/detail-latest.json.gz`, meta → `corpus/region/asia/meta.json` via `wrangler r2 object put`.
  - The five new overlays are already produced by the extended A4 loop; ensure their upload loop covers `ko zh-tw zh-cn th id` (it iterates `I18N_LANGS`, so it may already).
- [ ] **Step 3: Validate** the YAML locally (`bunx --yes yaml-lint` or a `python -c` yaml load) — no runtime test in CI. This task has no unit test; its deliverable is the workflow diff.
- [ ] **Step 4: Commit** — `ci(asian-catalog): build + upload asia corpus and overlays`.

> **Phase A gate:** run `bun test` (full) + `bunx tsc -b` + `bunx biome check --config-path=. .` in parallel (background). All green before Phase B. Fix any type-completeness fallout from A1.

---

## Phase B — Client corpus runtime (region-indexed)

### Task B1: Region-keyed corpus IDB store

**Files:**
- Modify: `src/store/corpus/corpus-store.ts`
- Test: `src/store/corpus/corpus-store.test.ts`

**Interfaces:**
- Produces: read/write helpers keyed by region. Extend existing put/get to take a `region` (default `"west"` for back-compat with the existing `ptcg-corpus` store/key). Suggested: store rows under key `gz:{region}` + `etag:{region}` in the same object store, so an existing `west` blob is re-keyed or read via a back-compat alias. Keep signatures: `readCorpusBlob(region): Promise<{gz, etag} | null>`, `writeCorpusBlob(region, gz, etag): Promise<void>`.

- [ ] **Step 1: Read `corpus-store.ts` + its test** to match the existing IDB wrapper style (`fake-indexeddb` preloaded).
- [ ] **Step 2: Write failing tests:** write `asia` blob → read `asia` blob returns it; `west` and `asia` do not clobber each other; reading an unset region returns `null`.
- [ ] **Step 3: Run to verify fail.**
- [ ] **Step 4: Implement** region keying (default `"west"`; preserve the existing `west` key name so no client-side migration of the cached EN blob is needed — alias `west` to the current key).
- [ ] **Step 5: Run to verify pass.**
- [ ] **Step 6: Commit** — `feat(asian-catalog): region-keyed corpus IDB store`.

---

### Task B2: Region indices in the runtime store

**Files:**
- Modify: `src/store/corpus/corpus-runtime-store.ts`
- Test: `src/store/corpus/corpus-runtime.test.ts` (or a new `corpus-runtime-store.test.ts`)

**Interfaces:**
- Produces new state shape:
  ```ts
  interface CorpusRuntimeState {
    indices: Partial<Record<Region, CorpusIndex>>;
    activeRegion: Region;
    loading: Partial<Record<Region, boolean>>;
    setIndex(region: Region, index: CorpusIndex): void;
    setActiveRegion(region: Region): void;
  }
  ```
- **Back-compat:** keep a `index` getter/selector that returns `indices[activeRegion] ?? indices.west ?? null` so existing call sites (`useCorpusRuntime.getState().index`, tests that do `setState({ index })`) keep working during the migration. Provide `setState({ index })` compatibility by mapping a bare `index` set to `indices.west` (a small `setIndex` shim), OR update the few test call sites — prefer the compatibility getter to minimize churn.

- [ ] **Step 1: Read `corpus-runtime-store.ts`** (it is the leaf store that holds `CorpusIndex | null`).
- [ ] **Step 2: Write failing tests:** `setIndex("west", idx)` then `getState().index === idx`; `setActiveRegion("asia")` + `setIndex("asia", jaIdx)` → `getState().index === jaIdx`; setting asia doesn't drop west.
- [ ] **Step 3: Run to verify fail.**
- [ ] **Step 4: Implement** the region map + compatibility `index` selector. Follow the zustand-subscription-patterns skill (per-field selectors in consumers; do not prop-drill the whole store).

> **Before writing any Zustand change in B2–B4 and C/D, invoke the `zustand-subscription-patterns` skill** (hard trigger per project rules).

- [ ] **Step 5: Run to verify pass.**
- [ ] **Step 6: Commit** — `feat(asian-catalog): region-indexed corpus runtime store`.

---

### Task B3: `loadCorpus(region)` + lazy asia trigger

**Files:**
- Modify: `src/store/corpus/corpus-runtime.ts`, `src/store/corpus/use-ensure-corpus.ts`
- Test: `src/store/corpus/corpus-runtime.test.ts`

**Interfaces:**
- Produces: `loadCorpus(region: Region = "west"): Promise<void>` — fetches `/corpus` (west) or `/corpus-region/asia` (asia), 304-revalidates, IDB-caches (B1), `buildIndex`, `setIndex(region, …)`. Idempotent per region (early-return if loaded and fresh), de-dupes concurrent calls (mirror the i18n-runtime dedupe).
- Produces: `useEnsureRegionCorpus(region)` hook + an imperative `ensureRegionForLanguage(lang)`.
- Lazy trigger helper: `ensureRegionsForOwned(ownedCardIds: Iterable<string>)` — if any id is unresolved in the `west` index, call `loadCorpus("asia")`. (Called from the Vault; see D1.)

- [ ] **Step 1: Read `corpus-runtime.ts` + `use-ensure-corpus.ts`** (esp. `loadCorpus`, the fetch/304 path, `makeCorpusFetcher`).
- [ ] **Step 2: Write failing tests** (pre-seed fetch via a mock so no network): `loadCorpus("asia")` fetches `/corpus-region/asia`, gunzips a fixture, and populates `indices.asia`; second call is a no-op; `loadCorpus("west")` still hits `/corpus`.
- [ ] **Step 3: Run to verify fail.**
- [ ] **Step 4: Implement** the region parameter through `loadCorpus` and the URL selection (`region === "asia" ? "/corpus-region/asia" : "/corpus"`). Reuse the existing gunzip/buildIndex/IDB path with the region key.
- [ ] **Step 5: Run to verify pass.**
- [ ] **Step 6: Commit** — `feat(asian-catalog): loadCorpus(region) + lazy asia load`.

---

### Task B4: Region tag on cards + merged cross-region resolve

**Files:**
- Modify: `src/store/corpus/corpus-types.ts` (add `region?: Region` to `CorpusCard` — optional so fixtures need no churn), `src/store/corpus/corpus-engine.ts` (`buildIndex` stamps `region`; add `resolveCardAcrossRegions`)
- Test: `src/store/corpus/corpus-engine.test.ts`

**Interfaces:**
- Produces: `buildIndex(cards, region: Region = "west")` stamps each card's `region` (default west). `resolveCardAcrossRegions(cardId, indices): CorpusCard | undefined` — checks each loaded index's `byId`. Because ids are globally unique, first hit wins.
- Region can also be **derived** from a card's `setId` serie-lineage if needed, but the stamp at `buildIndex` time is the authoritative source (cheaper, explicit).

- [ ] **Step 1: Read `corpus-engine.ts`** (`buildIndex`, `hydrateCard`).
- [ ] **Step 2: Write failing tests:** `buildIndex([...], "asia")` stamps `region: "asia"` on every card; `resolveCardAcrossRegions("SV1a-001", { west, asia })` finds it in asia when absent from west; returns `undefined` when in neither.
- [ ] **Step 3: Run to verify fail.**
- [ ] **Step 4: Implement.** Add optional `region` to `CorpusCard`; `buildIndex(cards, region)` maps `{...card, region}`. Add `resolveCardAcrossRegions`. Do NOT change `hydrateCard`'s signature yet (D2 handles face-language).
- [ ] **Step 5: Run to verify pass.**
- [ ] **Step 6: Commit** — `feat(asian-catalog): region tag + cross-region card resolve`.

---

### Task B5: Server corpus loader/fns per region

**Files:**
- Modify: `src/server/corpus-loader.ts`, `src/server/corpus-server.ts`
- Test: `src/server/corpus-server.test.ts` (or the loader's test)

**Interfaces:**
- Produces: `queryCorpusServer(query, setsById, region = "west")` — memoize one index **per region** (a `Map<Region, Promise<CorpusIndex>>`). `region === "asia"` fetches `${apiBase()}/corpus-region/asia`.
- Server fns (`getSetCardsFn`, `searchCardsFn`, `getDexCardsFn`, `getSupertypeCardsFn`, `getCardForRouteFn`, `getPokedexFn`) accept a `lang`/`region` input and pass the derived region to `queryCorpusServer`. Region derivation: `regionForLanguage(input.lang ?? "en")`.

- [ ] **Step 1: Read `corpus-loader.ts` + `corpus-server.ts`** (the memoization + the fn `validator` inputs; most already accept `lang`).
- [ ] **Step 2: Write failing test:** `queryCorpusServer(q, sets, "asia")` fetches the asia endpoint and memoizes separately from west (mock fetch; assert both endpoints hit once across two calls).
- [ ] **Step 3: Run to verify fail.**
- [ ] **Step 4: Implement** the per-region memo map + region param threading. Where a fn already takes `lang`, derive region from it; where it doesn't, add an optional `lang` input (default en → west) so existing callers are unaffected.
- [ ] **Step 5: Run to verify pass.**
- [ ] **Step 6: Commit** — `feat(asian-catalog): per-region server corpus loader + fns`.

> **Phase B gate:** full `bun test` + `tsc -b` + biome (parallel, background). Green before Phase C.

---

## Phase C — Browse / routing region-scoping

### Task C1: `fetchAllSets(baseLang)` + per-region nav tree

**Files:**
- Modify: `src/server/card-data-fetch.ts` (`fetchAllSets`), `src/server/nav-tree.ts` (`getNavTreeFn`, `loadNavTree`)
- Test: `src/server/card-data-fetch.test.ts`, nav-tree test if present

**Interfaces:**
- Produces: `fetchAllSets(baseLang = "en")` — lists `${base}/v2/${baseLang}/sets` then resolves each set's detail (serie + releaseDate). `getNavTreeFn({ region })` (or `{ lang }`) → memoize nav tree per region; `loadNavTree(region)` uses `fetchAllSets(REGION_BASE_LANGUAGE[region])`.

- [ ] **Step 1: Read `card-data-fetch.ts`** (`fetchAllSets` at ~line 76; the per-set detail resolve at ~line 87) and `nav-tree.ts`.
- [ ] **Step 2: Write failing test:** `fetchAllSets("ja")` requests `/v2/ja/sets` (mock fetch; assert URL); nav tree for `asia` is memoized separately from `west`.
- [ ] **Step 3: Run to verify fail.**
- [ ] **Step 4: Implement** the `baseLang` param + per-region nav-tree memo. Missing JA logos/symbols pass through unchanged (tiles already tolerate absent logos — verify in C4).
- [ ] **Step 5: Run to verify pass.**
- [ ] **Step 6: Commit** — `feat(asian-catalog): region-scoped nav tree + fetchAllSets(baseLang)`.

---

### Task C2: Per-region slug index + region-aware card route

**Files:**
- Modify: `src/store/corpus/corpus-runtime.ts` (`useSlugIndex`), `src/lib/card-route.ts`
- Test: `src/lib/slug.test.ts` (region cases), `src/lib/card-route` test if present

**Interfaces:**
- `useSlugIndex()` builds the slug index from the **active region's** index + that region's sets. `cardRouteParams`/`cardModalLinkPropsFor`/`cardManageLinkPropsFor` carry the active `lang` so generated links include `?lang` when the active region is asia (so a shared link re-selects the region).

- [ ] **Step 1: Read `slug.ts`, `card-route.ts`, `useSlugIndex` in `corpus-runtime.ts`.**
- [ ] **Step 2: Write failing tests:** slug index built from an asia index resolves an asia set slug; `cardModalLinkPropsFor` for an asia card includes `search: { lang: "ja" }` (or the active Asian lang); for a west card under en it omits lang (today's behavior).
- [ ] **Step 3: Run to verify fail.**
- [ ] **Step 4: Implement.** Thread active region/lang into slug-index construction and link builders. Keep west link output byte-identical when lang is en (avoid churn/regressions).
- [ ] **Step 5: Run to verify pass.**
- [ ] **Step 6: Commit** — `feat(asian-catalog): region-aware slug index + card links`.

---

### Task C3: Route loaders derive region from `?lang`

**Files:**
- Modify: `src/routes/$series/index.tsx`, `src/routes/$series/$set/index.tsx`, `src/routes/$series/$set/$card.tsx` (and `$card_/manage` if present), `src/components/islands/card-overlay.tsx`
- Test: existing route/loader tests; add region cases where feasible

**Interfaces:**
- `validateSearch` on the card route accepts the six Asian langs (already funnels through `toSupportedLanguage`). Loaders call the region-aware server fns with `lang` so the correct region's corpus/nav-tree is queried. The card overlay passes the active `lang` into `getCardDetail`/`getCardForRouteFn` (it already injects active i18n lang — verify it now covers Asian langs).

- [ ] **Step 1: Read the three route files + `card-overlay.tsx`.**
- [ ] **Step 2: Write/extend a loader test** (or a focused unit test on the region-derivation used in the loader) proving `?lang=ja` routes to the asia nav tree/set fetch. If loaders are hard to unit-test, cover the derivation helper and rely on the Phase-E browser test for the integration.
- [ ] **Step 3: Run to verify fail (or write the helper test first).**
- [ ] **Step 4: Implement** region derivation in each loader + `validateSearch` extension. Ensure cold-load `$card` (shared link) reads `?lang` and selects the region.
- [ ] **Step 5: Run to verify pass** + `tsc -b`.
- [ ] **Step 6: Commit** — `feat(asian-catalog): route loaders derive region from lang`.

---

### Task C4: Grouped Western/Asian language picker + tile logo fallback

**Files:**
- Modify: `src/components/islands/global-language-control.tsx`, `src/components/islands/card-language-control.tsx`
- Verify: `src/components/shell/set-tile.tsx` tolerates missing logo (no code change expected; add a guard only if it breaks)
- Test: component tests if present; otherwise Phase-E browser coverage

**Interfaces:** the pickers render two labeled groups — "Western catalog" (en/fr/de/es/it/pt) and "Asian catalog" (ja/ko/zh-tw/zh-cn/th/id) — using `ASIAN_LANGUAGES` + `LANGUAGE_REGION`. Selecting a language sets `Profile.displayLanguage` / the `?lang` param as today; the region follows automatically. Copy must avoid em-dashes.

- [ ] **Step 1: Read both control components** (shadcn `SelectGroup`/menu structure; the existing subtype-groups facet is a grouping precedent).
- [ ] **Step 2: Write a test** asserting the control renders both group headings and all twelve options (if the component is unit-testable), else note deferral to Phase E.
- [ ] **Step 3: Implement** the grouping. Keep the existing selection behavior. Add a short hint that switching to an Asian language changes the catalog (no em-dash).
- [ ] **Step 4: Verify** `set-tile.tsx` with a logo-less set (pre-seed an asia set without `logo`) renders without crashing; add a fallback only if needed.
- [ ] **Step 5: Commit** — `feat(asian-catalog): grouped language picker (Western/Asian catalogs)`.

> **Phase C gate:** full `bun test` + `tsc -b` + biome. Green before Phase D.

---

## Phase D — Userland cross-region

### Task D1: Merged `byId` in Vault join points

**Files:**
- Modify: `src/store/userland/selectors.ts`, `src/store/userland/card-rows.ts`, `src/store/userland/binder-progress.ts`
- Test: `src/store/userland/selectors.test.ts` (or the card-rows/binder tests)

**Interfaces:**
- Join points resolve owned `cardId`s against **all loaded region indices** (via `resolveCardAcrossRegions` from B4), not just the active index. Signatures gain an `indices`/resolver argument or read `useCorpusRuntime.getState().indices`. `useOwnedCardRows`/`useOwnedCountBySet`/`useBinderProgress` ensure the asia corpus is loaded when the collection contains unresolved ids (call `ensureRegionsForOwned` from B3).

- [ ] **Step 1: Read `selectors.ts`, `card-rows.ts`, `binder-progress.ts`** (the `index.byId.get(cardId); if (!cc) continue` misses).
- [ ] **Step 2: Write failing test:** with `indices = { west, asia }` and an owned stack whose `cardId` is only in `asia`, `buildCardRows` includes it (today it is silently dropped); `tallyOwnedBySet` counts its set.
- [ ] **Step 3: Run to verify fail** (proves the current silent-drop bug).
- [ ] **Step 4: Implement** merged resolution across loaded indices. Wire the lazy `ensureRegionsForOwned` trigger in the owned selectors so a returning user's Asian cards load without a manual region switch.
- [ ] **Step 5: Run to verify pass.**
- [ ] **Step 6: Commit** — `fix(asian-catalog): hydrate owned cards across regions (no more silent drop)`.

---

### Task D2: Owned-card face-language rule

**Files:**
- Modify: `src/store/corpus/corpus-engine.ts` (`hydrateCard` face-language), `src/lib/card-image.ts` (already lang-parameterized — verify), the Vault selectors that call `hydrateCard`
- Test: `src/store/corpus/corpus-engine.test.ts`

**Interfaces:**
- Produces a face-language resolver: `faceLanguageFor(card: CorpusCard, activeLang: SupportedLanguage): SupportedLanguage` = `regionForLanguage(activeLang) === card.region ? activeLang : REGION_BASE_LANGUAGE[card.region ?? "west"]`. `hydrateCard` uses it to pick the overlay/name + `cardImage(card, faceLang)`.

- [ ] **Step 1: Write failing tests:**
  - west card + activeLang `en` → face `en` (unchanged).
  - west card + activeLang `ja` → face `en` (region base, not ja).
  - asia card + activeLang `en` → face `ja` (region base).
  - asia card + activeLang `ko` → face `ko` (matches region).
- [ ] **Step 2: Run to verify fail.**
- [ ] **Step 3: Implement** `faceLanguageFor` + use it in `hydrateCard`. Ensure the one active overlay is applied only when it matches the card's region; otherwise use base names (no overlay). Confirm `cardImage` builds `assets.tcgdex.net/{faceLang}/{imageBase}/...`.
- [ ] **Step 4: Run to verify pass.**
- [ ] **Step 5: Commit** — `feat(asian-catalog): region-aware face language for hydration`.

---

### Task D3: Stack language options (grouped) + schema verify

**Files:**
- Verify/Modify: `src/components/collection/stack-form-schema.ts`, the stack edit form's language field
- Test: `src/components/collection/stack-form-schema.test.ts` if present

**Interfaces:** the per-stack language select is gated to `SUPPORTED_LANGUAGES` (so A1 already adds the six options). Present them grouped like C4. No persistence change.

- [ ] **Step 1: Read `stack-form-schema.ts`** + the form field.
- [ ] **Step 2: Write/extend a test** asserting the schema accepts `ja`/`ko`/`zh-tw`/`zh-cn`/`th`/`id` as valid `language` values.
- [ ] **Step 3: Run to verify fail** (if the enum was hard-coded rather than derived — fix to derive from `SUPPORTED_LANGUAGES`).
- [ ] **Step 4: Implement** grouped options in the form field; ensure the schema derives from `SUPPORTED_LANGUAGES`.
- [ ] **Step 5: Commit** — `feat(asian-catalog): Asian language options in stack form`.

> **Phase D gate:** full `bun test` + `tsc -b` + biome. Green before Phase E.

---

## Phase E — Verify, smoke test, draft PR

### Task E1: Local R2 asia smoke test (Claude Preview)

**Files:** none (operational).

- [ ] **Step 1:** Build a small asia corpus locally. If a full Docker-mirror build is too heavy, hand-craft a tiny `corpus.asia.json.gz` fixture with 2-3 real JP-lineage cards (`SV1a-001` etc.) + a matching asia sets response, OR run the mirror for one serie. Follow the local-R2 procedure in `project_multilingual_catalog` memory: `wrangler r2 object put pokemon-tcg-corpus/corpus/region/asia/latest.json.gz --file=... --local` (+ detail + meta), clear `worker/.wrangler/state/v3/cache`, restart wrangler via `nohup`.
- [ ] **Step 2:** Boot `vite dev` (port 6201) + the worker; in Claude Preview: switch display language to Japanese, verify the browse tree shows JP sets, open a JP card (detail via `/v2/ja/cards/{id}`), and confirm an owned JP card renders in the Vault alongside an EN card.
- [ ] **Step 3:** Capture a screenshot for the PR. Record findings in the phase2 memory.

### Task E2: Full verification + self-review + draft PR

- [ ] **Step 1:** Run the full suite + `tsc -b` + `bunx biome check --config-path=. .` in parallel (background). All green.
- [ ] **Step 2:** Adversarial whole-branch self-review (founders-review style, or a `code-review` pass): focus on the silent-drop fix (D1), the face-language rule (D2), region memoization correctness (B5), and worker route/gate parity (A2). Fix findings, re-verify.
- [ ] **Step 3:** Update the `project_asian_catalog_phase2` memory to "implemented, draft PR open" with the PR URL + any deferred follow-ups.
- [ ] **Step 4:** Push `feat/asian-region-catalog`; open a **draft** PR based on `main` with a summary (what shipped, what CI does on merge, the accepted gaps from spec §7). Do NOT merge.

---

## Self-Review (plan vs spec)

- **Spec §3.1 build** → A3/A4/A5. **§3.2 serve** → A2. **§3.3 client runtime** → B1–B5. **§3.4 routing** → C2/C3. **§3.5 userland** → D1/D2/D3. **§3.6 languages** → A1. **§4 data flow** → covered across phases. **§5 error handling** → A3 gate, D1 lazy-load, C4 logo fallback, existing `cardImage`/holo-card fallbacks (no new task needed). **§6 testing** → per-task tests + E1 smoke + E2 suite. **§7 scope** → binders single-region (D1 note), no ptcg overlay (A3 guard), no `/asia` routes (C3). **§8 assumptions** → encoded in Global Constraints. No spec requirement is unmapped.
- **Placeholders:** none — each task has concrete files, interfaces, and test assertions. Code shown literally where the file is known verbatim (A1 tests, A2 route sketch); elsewhere the implementer reads the cited file and writes code via TDD (per project rule against pre-baked blocks).
- **Type consistency:** `Region`, `LANGUAGE_REGION`, `REGION_BASE_LANGUAGE`, `regionForLanguage` (A1) are used identically in B2/B4/B5/C1/D2. `resolveCardAcrossRegions` (B4) consumed in D1. `loadCorpus(region)`/`ensureRegionsForOwned` (B3) consumed in D1. `faceLanguageFor` (D2) self-contained. `fetchAllSets(baseLang)` (C1) consistent with `REGION_BASE_LANGUAGE`.

---

## Risks & mitigations (carried from spec)

- **Empty `set.cards[]` from the mirror (build):** A3 validation gate fails loudly.
- **IDB/memory of two corpora:** lazy asia load (B3); region-keyed store (B1). ~0.9 MiB gz / ~11 MiB RAM worst case — acceptable.
- **Slug collisions across regions:** disambiguated by `?lang`-derived region (C2/C3); stripped Asian links degrade gracefully.
- **Asian rarity/holo coarse:** accepted (spec §7); no ptcg overlay for asia (A3 guard).
- **Worker/app allow-list drift:** cross-referenced by comment (A2 Global Constraint).
