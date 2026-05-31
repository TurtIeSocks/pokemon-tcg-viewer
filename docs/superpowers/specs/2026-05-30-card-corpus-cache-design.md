# Local Card Corpus Cache — Design

**Date:** 2026-05-30
**Status:** Approved design, pending implementation plan

## Summary

Make search and browse fast by serving them from a complete, local copy of all
card metadata instead of the slow, rate-limited pokemontcg.io API.

A scheduled **GitHub Action** crawls the entire card corpus once (centrally),
builds a compact gzipped blob, and uploads it to **Cloudflare R2**. The existing
**Cloudflare Worker** gains one route (`/corpus`) that serves the blob with an
`ETag`. The **client** downloads the blob once, stores it in a dedicated
IndexedDB store, decompresses it into memory, and runs an in-memory query engine
that powers **all** browse/search paths (free-text name search, set browsing,
Pokédex browsing, and filters). Search becomes instant and works offline once the
corpus is loaded. Until then, the app falls back to today's live-API path.

## Goals

- All browse/search paths served locally once the corpus is present: instant,
  no per-keystroke network round trip, works offline.
- No per-user crawl of the origin API — each user makes **one** request for a
  prebuilt blob; only CI touches the origin. Zero per-user rate-limit exposure.
- Typo-tolerant ("fuzzy") name search.
- Stay on free tiers: GitHub Actions (build) + Cloudflare Workers/R2 free plans.
  Target **$0/mo**.
- Zero regression while the corpus is absent or stale: live-API path remains the
  fallback.

## Non-goals

- Caching full card *detail* (`FocusCardData`: attacks, prices, etc.). The focus
  view keeps its current per-card fetch. The corpus holds only grid/search/filter
  metadata.
- Real-time freshness. Sets release ~quarterly; a weekly rebuild is ample.
- Lazy-freeing corpus memory when off browse pages (possible later; YAGNI now).

## Decisions (locked during brainstorming)

| Topic | Decision | Rationale |
|-------|----------|-----------|
| What to cache | All ~20.4k cards' grid/search/filter metadata | Enables fully local browse |
| Per-card fidelity | Store image URLs; join set name/series from cached sets list | Derivation breaks for ~13% of cards (different CDN host) |
| Serve model | Edge builds blob; client downloads once (in-memory search) | Instant + offline; one fast fetch vs an 82-request client crawl |
| Build host | GitHub Actions → R2; Worker serves | $0; sidesteps CF free-plan CPU (10 ms) + subrequest (50) limits on the build |
| Scope | All paths local: name + set + Pokédex + filters | One unified local query engine |
| Match quality | Fuzzy / typo-tolerant, custom tiered matcher | Full ranking control, no dependency |
| Freshness | Weekly CI rebuild + client conditional GET (ETag) | Quarterly set cadence; cheap 304s |

## Sizing (measured)

- 20,359 cards. Stored `CorpusCard` shape ≈ **380–390 B/card → ~7.5–8 MB**
  uncompressed, **~2 MB gzipped**. (Measured: full `HoloCardData` 431 B/card =
  8.4 MB; dropping the joined set name/series/releaseDate and adding `types` nets
  ~380–390 B.)
- In-memory: ~20–30 MB heap while loaded. Substring/fuzzy scan over 20k names is
  sub-millisecond.
- IndexedDB quota (hundreds of MB–GB) makes storage a non-issue.

## Architecture

```
GitHub Action (weekly cron + manual dispatch)
  └─ Node script: crawl /v2/cards 82 pages (API key = repo secret)
       → trim → CorpusCard[] → JSON → gzip → version = content hash
       → upload corpus/latest.json.gz + corpus/version to R2 (S3 API; egress free)

Cloudflare Worker (existing proxy + ONE new route)
  └─ GET /corpus:
       read corpus/latest.json.gz from R2 (Cache API in front of R2)
       → 200: gz bytes, Content-Type: application/octet-stream,
              ETag: "<version>", Cache-Control: public, s-maxage=604800
       → If-None-Match matches → 304 Not Modified

Client
  corpus-loader (on idle) ──conditional GET /corpus──┐
       200 → store gz + etag, decompress → memory     │
       304 → load stored gz → memory                  │
       offline/err → load stored gz if present;        │
                     else corpusReady=false (API path) │
                                                        ▼
  corpus-store (IndexedDB, dedicated idb-keyval store) ── gz ArrayBuffer + meta
                                                        │
                                                        ▼
  use-corpus: decompress+parse once → in-memory CorpusCard[] + normalized name idx
       exposes corpusReady + a CardFetcher
                                                        │
  browse-page:  corpusReady ? corpusFetcher : apiFetcher   (same CardFetcher type)
       │
       ▼
  corpus-engine.query(params) → predicates + fuzzy rank + natural sort
       → hydrate to HoloCardData (join setName/series/releaseDate from sets list)
       → page slice
       │
       ▼
  useCards / cardsCache / CardGrid / pagination / virtualization  (UNCHANGED)
```

### Why this leaves the existing client machinery untouched

The corpus path implements the existing `CardFetcher` interface
`(key, page, pageSize) => Promise<{ cards: HoloCardData[]; totalCount: number }>`.
`browse-page` already builds a fetcher closure capturing `query`, `selectedSetId`,
`scope`, and the filters. We swap which fetcher that closure uses based on
`corpusReady`; everything downstream (`useCards`, `cardsCache`, infinite scroll,
virtualization, the SWR/throttle logic) is unchanged. When `corpusReady` flips
true mid-session, the `useCards` effect re-runs (fetcher is in its deps) and
results become instant.

## Data model

```ts
// New: src/store/corpus-types.ts (or src/lib/corpus-types.ts)
interface CorpusCard {
  id: string;
  name: string;
  imageUrl: string;        // large; stored (derivation unreliable)
  imageUrlSmall: string;   // small
  rarity?: string;
  subtypes?: string[];
  supertype: string;
  types?: string[];        // ADDED vs HoloCardData — required for the type filter
  setId: string;
  number: string;          // natural-sort key
  nationalPokedexNumbers?: number[];
  variants?: string[];     // tcgplayer price keys (holo signal)
}
```

`setName` / `setSeries` / `setReleaseDate` are **not** stored. They are joined
from the already-cached sets list (`useStore` → sets) at hydration time to produce
`HoloCardData`. The normalized name used for matching (see below) is computed in
memory at load, not stored.

The GitHub Action's crawl uses the same `select=` field set as today's
`getCardsByQuery` (`id,name,number,images,rarity,subtypes,supertype,set,nationalPokedexNumbers,tcgplayer`)
plus `types`, and trims each card to `CorpusCard`.

## Server: build & serve

### GitHub Action (`.github/workflows/build-corpus.yml` + a Node script)

- Triggers: `schedule` (weekly, e.g. `0 4 * * 1`) + `workflow_dispatch` (manual).
- Steps:
  1. Crawl `GET /v2/cards?...&pageSize=250&page=N` for all 82 pages, using the
     pokemontcg API key from a repo secret. (No subrequest/CPU limits in CI.)
  2. Trim each card to `CorpusCard`.
  3. `JSON.stringify` → gzip → compute `version` = content hash (e.g. sha256 of
     the gz bytes, short form).
  4. Upload to R2 via the S3-compatible API:
     - `corpus/latest.json.gz`
     - `corpus/version` (plain text hash) — or rely solely on the object ETag.
  5. Skip upload if the hash is unchanged (idempotent).
- Secrets: pokemontcg API key, R2 S3 credentials (access key id/secret),
  bucket name, account id.

### Worker route (`worker/src/index.ts`)

Add an R2 bucket binding (`CORPUS` in `wrangler.toml`) and a `/corpus` branch
**before** the `/v2/` proxy logic:

```
GET /corpus:
  cache = caches.default; cacheKey = request
  hit = await cache.match(cacheKey); if hit: return withCors(hit)
  obj = await env.CORPUS.get("corpus/latest.json.gz")
  if !obj: 503
  res = Response(obj.body, {
    headers: {
      "Content-Type": "application/octet-stream",  // prevents fetch auto-inflate
      "ETag": `"${obj.etag}"`,
      "Cache-Control": "public, s-maxage=604800",
    }})
  honor If-None-Match (compare to obj.etag) → 304
  ctx.waitUntil(cache.put(cacheKey, res.clone()))
  return withCors(res)
```

CORS headers reuse the existing `withCors`/`corsHeaders`. The Cache API front
means R2 is read at most once per PoP per version.

## Client

### `corpus-store.ts` (IndexedDB)

- Dedicated idb-keyval store: `createStore("ptcg-corpus", "blob")`.
  **Not** the Zustand-persist store — Zustand re-serializes its whole partialized
  state on every change, so the multi-MB corpus must live outside it.
- Keys:
  - `gz` → `ArrayBuffer` (the compressed blob, ~2 MB).
  - `meta` → `{ etag: string; version: string; fetchedAt: number }`.
- API: `readGz()`, `readMeta()`, `write(gz, meta)`, `clear()`.

### `corpus-loader.ts`

- Runs once on app start, deferred to idle (`requestIdleCallback` fallback
  `setTimeout`).
- Reads stored `meta.etag`; `fetch("/corpus", { headers: etag ? { "If-None-Match": etag } : {} })`.
  - `200` → read `arrayBuffer()`, `corpus-store.write(buf, { etag, version, fetchedAt })`,
    then hand bytes to `use-corpus` to decompress+load.
  - `304` → read stored gz, load it.
  - network error / offline → if stored gz exists, load it (offline works);
    else leave `corpusReady = false` (API fallback).
- Throttle: check at most once per session (and skip if checked < 1 day ago,
  tracked in `meta`/memory).

### `use-corpus.ts`

- On load: `DecompressionStream("gzip")` the gz `ArrayBuffer` → text → `JSON.parse`
  → `CorpusCard[]`. Build an in-memory parallel array of normalized names.
- Holds the corpus + normalized index in a module-level singleton (or a small
  Zustand slice holding only a `ready` flag + a ref; the array itself stays out of
  persisted state).
- Exposes `corpusReady: boolean` and `makeCorpusFetcher(params): CardFetcher`.
- The fetcher memoizes the full sorted match list per cache `key`, returning
  `matchList.slice((page-1)*pageSize, page*pageSize)` and `totalCount = matchList.length`.

### `corpus-engine.ts` (pure)

Query parameters mirror the browse-page state: `{ query, setId, scope, dexNumber,
filters: { types, rarity, supertype, subtypes } }`.

**Predicates** (AND-combined):
- Set: `card.setId === setId` (set / set-scoped paths).
- Pokédex: `card.nationalPokedexNumbers?.includes(dexNumber)`.
- Filters: port `build-filter-clauses` semantics to local predicates over
  `types` / `rarity` / `supertype` / `subtypes`. (Read `src/utils/build-filter-clauses.ts`
  during planning to match exact OR/AND semantics.)
- Name: fuzzy tiered match (below), applied for free-text search (global or
  set-scoped).

**Natural-order comparator** for `number` (verified: the API sorts numerically,
not lexicographically — `1,2,…,10,11`, not `1,10,11,…,2`):
parse leading integer, compare numerically, then compare the full string as a
tiebreaker for alphanumerics (`TG01`, `SWSH001`).

**Ordering per path:**
- Global name search → **relevance order**: match tier asc, then tiebreaks
  (below). *This is an intentional change from today's chronological order* —
  fuzzy results cannot be sorted chronologically and still make sense; closest
  matches must lead. Tied to the fuzzy decision.
- Set browse (no name) → natural(`number`).
- Set-scoped search → keep `number` order (parity with today), filtered by name
  match membership (no relevance reorder).
- Pokédex → release date asc, then natural(`number`) (parity).

### `fuzzy.ts` (pure, custom tiered)

- **Normalize**: lowercase → NFD → strip combining marks → strip all
  non-alphanumerics (handles `Mr. Mime`, `Farfetch'd`, `Type: Null`, `Ho-Oh`,
  `Porygon-Z`, `Flabébé`). Apply identically to query and card name.
- **Tiers** (lower = better), `q` = normalized query, `n` = normalized name:
  - `0` exact: `n === q`
  - `1` prefix: `n.startsWith(q)`
  - `2` substring: `n.includes(q)`
  - `3` fuzzy: Damerau-Levenshtein(`q`, `n`) ≤ `maxDist`, **or** any name token
    within `maxDist` of `q`. `maxDist = q.length <= 4 ? 1 : 2`.
- **Tiebreaks within a tier** (for relevance-ordered paths):
  - tier 3: edit distance asc, then ↓
  - tiers 0–2: name length asc → release date asc → natural(`number`).
- Only run the (more expensive) fuzzy tier when needed; bounded `maxDist` keeps
  noise low. Sub-ms over 20k names regardless.

### Integration (`browse-page.tsx`)

```ts
const { corpusReady, makeCorpusFetcher } = useCorpus();
const apiFetcher = useMemo(() => /* today's fetcher */, [...deps]);
const corpusFetcher = useMemo(
  () => makeCorpusFetcher({ query, setId: selectedSetId, scope, filters }),
  [corpusReady, query, selectedSetId, scope, types, rarity, supertype, subtypes],
);
const fetcher = corpusReady ? corpusFetcher : apiFetcher;
const { cards, loading, loadMore, hasMore } = useCards(cacheKey, fetcher);
```

No other downstream change.

### UX

- Silent by default — search simply gets fast once the corpus loads.
- Optional: a small "Preparing instant search…" pill while loading; remove when
  ready. (Nice-to-have, can ship later.)
- Offline: with a stored corpus, all browse/search works with no network. Card
  *detail* (focus view) still needs network unless separately cached (out of scope).

## Edge cases

- **setId missing from sets list** (brand-new set between sets-list refreshes):
  hydrate with fallback (`setName = setId`, no release date). Rare; self-heals on
  next sets-list refresh.
- **Corpus version bump mid-session**: next idle check returns 200; store + reload
  to memory; `cardsCache` keys reseed naturally. No user disruption.
- **Empty/partial blob or decompress failure**: treat as "no corpus" → API
  fallback; clear the bad store entry.
- **R2 object absent** (first deploy before first CI run): `/corpus` → 503; client
  stays on API path. No error surfaced to user.
- **Cache-key collision between API-sourced and corpus-sourced entries**: same key;
  corpus reseeds the entry (page 1) — acceptable; results just get more complete.

## Testing plan

- **`fuzzy.ts`** (pure): normalization cases (punctuation/accents), tier
  classification, `maxDist` boundaries, typo cases (`charizrd → Charizard`),
  ranking order.
- **`corpus-engine.ts`** (pure): each predicate, filter combinations, natural-order
  comparator (numeric vs alphanumeric), per-path ordering, hydration join +
  missing-set fallback.
- **`corpus-loader.ts`**: mocked `fetch` for 200 / 304 / offline; verifies
  store writes and `corpusReady` transitions.
- **`corpus-store.ts`**: idb roundtrip (uses the project's existing idb test setup).
- **Worker `/corpus`**: R2 stub; asserts headers, ETag, 304 on `If-None-Match`,
  503 when object absent, Cache API put. Extends `worker/src/index.test.ts`.
- **Integration**: one test that `browse-page` uses `corpusFetcher` when ready and
  `apiFetcher` when not, and that results render through the unchanged grid.
- Build script: a small unit test on the trim function (API card → `CorpusCard`).

Follow the project's testing rules: run jsdom/logic tests per step; run the
browser suite once at the end of each task.

## Rollout order

1. Worker `/corpus` route + R2 binding (serves 503 until a blob exists). Deploy.
2. GitHub Action + build script. Run once (manual dispatch) to seed R2.
3. Client `corpus-store`, `corpus-types`.
4. `fuzzy` + `corpus-engine` (pure, fully tested in isolation).
5. `use-corpus` + `corpus-loader`.
6. `browse-page` fetcher swap behind `corpusReady`.
7. Optional UX pill.

Each step is independently shippable; the app behaves exactly as today until
step 6 flips the swap, and even then only when a corpus is present.

## Risks / open items for the plan phase

- **Filter semantics parity**: port `build-filter-clauses.ts` exactly (OR within a
  dimension, AND across dimensions?) — confirm by reading it during planning.
- **Relevance ordering is a visible behavior change** for global name search
  (chronological → relevance). Intentional, tied to the fuzzy decision; confirm it
  reads well in practice.
- **R2 S3 credentials in GitHub Actions** — store as encrypted repo secrets; never
  commit. Scope the R2 token to the single bucket.
- **`number` natural sort** for exotic formats (promos, Trainer Gallery) — covered
  by the leading-integer-then-string comparator, but worth a test fixture.
- **Heap while loaded** (~20–30 MB) — acceptable; revisit lazy-free only if mobile
  profiling shows pressure.
```
