# Offline Card Detail ("Keep cards on this device") Design

Date: 2026-06-27
Status: Approved (delegate-mode brainstorm), pending implementation plan.

## Overview

An opt-in toggle in the sidebar user menu downloads a small (~2.1 MiB gz) blob of
per-card detail (battle data, rules, flavor text) and keeps it on the device.
When present, the card modal renders the full card detail **instantly from local
memory** with no per-card server round trip, no loading ghost, and it works
offline. Staleness is content-addressed, so the user is told their copy is out of
date only when card data has **actually** changed, not merely because a weekly
corpus rebuild ran.

This is "L1" of a tiered offline story (see Future Work). It is the metadata
layer. Image offline support is a separate, larger sub-project.

### Why this is worth doing

- The corpus is a deliberately slim search index. It omits battle data, so today
  every in-app card open fires `getCardForRouteFn` (an HTTP RPC that, on a cache
  miss, also calls the external pokemontcg.io API). PR #19 made that open feel
  instant via an optimistic corpus mount + prefetch + caching, but the detail
  still arrives over the network.
- Card detail (attacks, abilities, weaknesses, retreat, rules, flavor, artist) is
  **effectively immutable** per printed card. It is a perfect candidate for a
  cached local copy. Only prices drift, and prices stay out of the blob.
- It unlocks a genuine product capability: a fully offline card browser, on brand
  with the local-first pitch ("No ads. No snooping. No landlord. Just your cards.").

## Goals

- One opt-in toggle: download / keep / re-sync / remove the detail blob.
- When the blob is present, the modal's battle data + rules + flavor text render
  instantly from local memory (no RPC, no ghost) and work offline.
- Detect **real** staleness (content change), not rebuild noise.
- Add zero cost for users who do not opt in (default behaviour unchanged).
- Add a `flavorText` section to the card detail view (currently the RPC returns
  it but nothing renders it).

## Non-goals (v1)

- Auto-download / background prefetch of the blob (future: pair with PR #19's
  hover prefetch ideas).
- Per-card manifest or delta sync. On any real change, re-download the whole blob.
- A price-only server function. Prices keep coming from the existing RPC.
- Offline **images** (see Future Work, L2+).
- Chunked blob.

## Assumptions (the decisions made on the user's behalf)

1. Opt-in only, no auto-prefetch in v1.
2. Blob contents = battle data + rules + **flavor text**, no prices. ~2.14 MiB gz
   (measured: trimmed corpus extrapolates to 0.48 MiB vs the actual 0.49 MiB, so
   the extrapolation is trustworthy; full-with-flavor = ~2.14 MiB).
3. Prices stay live. With local detail present, battle data is instant; prices and
   cross-links still come from the existing `getCardForRouteFn` RPC, fired in the
   background (online only) and shown when they arrive. The RPC is off the critical
   path but still fires per open in v1. Offline with no network: battle data shows,
   prices are simply absent.
4. One crawl, two artifacts. Extend `build-corpus.ts` to emit both the slim corpus
   (unchanged) and the detail blob from a single API sweep.
5. Version = `sha256(canonical detail JSON)`, surfaced via `/corpus-detail/version`.
   Robust to gzip/zlib drift (unlike the corpus's gzip-MD5 ETag). Flips only on a
   real battle/rules/flavor change; prices are excluded so it stays stable across
   price churn.
6. No per-card manifest / delta sync in v1. Re-download the whole blob on change.
7. Detail state lives in a dedicated IndexedDB store plus a non-persisted runtime
   store (mirrors the corpus). The enabled flag is `meta.enabled` in that IDB
   store, NOT in the persisted Zustand blob.
8. Staleness checked on app boot (if enabled) and when the user opens the menu. No
   background polling.
9. Single blob, served whole.

## Architecture

### Build (`scripts/build-corpus.ts`)

Crawl once with the extended `select` (today's fields plus `hp, evolvesFrom,
abilities, attacks, rules, weaknesses, resistances, retreatCost, flavorText,
artist`). From each page produce two records per card:

- `trimmed`: today's `CorpusCard` (unchanged; `trimCard` already writes keys in a
  fixed order, which keeps the slim corpus byte-deterministic).
- `detail`: `{ id, ...DetailCard }` (battle fields above; no prices).

Then:

- `corpus.json.gz`: gzip of the trimmed array (unchanged path, byte-stable).
- `corpus-detail.json.gz`: gzip of the detail array, sorted by `id`, fixed key
  order, no embedded timestamp.
- `corpus-detail.meta.json`: `{ version, count, builtAt }`, where
  `version = sha256(JSON.stringify(detailArraySortedById))` computed on the
  **uncompressed canonical** JSON (so the version is independent of the gzip
  toolchain). `builtAt` is informational only and is NOT part of the version hash.

Determinism is load-bearing: the blob must contain only card data, in a fixed
order, with no timestamp, so identical data produces an identical `version`.

### CI (`.github/workflows/build-corpus.yml`)

Upload the two new artifacts to R2 alongside `corpus/latest.json.gz`:
`corpus/detail-latest.json.gz` and `corpus/detail-meta.json`.

### Worker (`worker/src/index.ts`)

Two new routes, mirroring `/corpus`'s CORS + cache handling:

- `GET /corpus-detail`: serve `corpus/detail-latest.json.gz` (octet-stream, ETag,
  same `Cache-Control` policy as `/corpus`). 503 if the object is missing.
- `GET /corpus-detail/version`: serve `corpus/detail-meta.json` (small JSON, short
  cache, CORS). This is the cheap "is it actually stale?" probe.

### Client storage (`src/store/corpus/detail-store.ts`)

idb-keyval store `ptcg-corpus-detail`, holding `gz` (ArrayBuffer) and
`meta: { version, syncedAt, count, enabled }`. Atomic multi-key writes like
`corpus-store` so a crash cannot leave `gz` without `meta`.

### Client runtime (`src/store/corpus/detail-runtime.ts`)

`useDetailRuntime`: a non-persisted Zustand store (like `useCorpusRuntime`):

```ts
interface DetailRuntimeState {
  detailById: Map<string, DetailCard> | null; // null until loaded
  enabled: boolean;
  version: string | null;
  syncedAt: number | null;
  status: "off" | "loading" | "downloading" | "ready" | "stale" | "error";
}
```

Actions:

- `loadDetail()`: on boot: if `enabled`, read IDB gz, gunzip, build the `Map`,
  set `ready`. Idempotent / de-duped like `loadCorpus`.
- `enableOffline()`: fetch `/corpus-detail` -> gunzip -> build Map -> write IDB
  (gz + meta with `enabled: true`) -> `ready`.
- `syncDetail()`: fetch `/corpus-detail/version`; if it differs from the stored
  version, re-run the download; else just bump `syncedAt`.
- `checkStale()`: fetch `/corpus-detail/version`, compare, set `stale` if changed.
- `disableOffline()`: clear IDB + Map, `enabled: false`, `off`.

Boot wiring: call `loadDetail()` where `loadCorpus()` is kicked off (e.g.
`card-grid-island` mount or a root effect), guarded so it is a no-op when disabled.

### Modal integration (`src/lib/card-detail.ts` + `card-overlay.tsx`)

`optimisticCardFromCorpus` gains an optional `detailById` parameter. When the
card's `DetailCard` is present locally, it merges those fields into the returned
`FocusCardData`, producing a **complete** card (everything except prices). The
overlay:

- If local detail is complete: render immediately, `pending = false` (no battle
  ghost). Still fire `getCardDetail` in the background (online) to fill prices and
  cross-links; show a price-panel-only ghost while that is in flight. Offline: skip
  the fetch, render battle data, omit prices.
- If local detail is absent (not opted in, or card missing from the blob): today's
  path unchanged (optimistic corpus mount + `getCardDetail` RPC + full ghosts).

PR #19's optimistic mount thus becomes the **full** render when the blob is
present; the RPC is only a fallback / price source.

### Flavor text rendering (`src/components/card/card-info.tsx`)

Add a flavor-text section (italic story blurb) to `CardInfo`. The RPC mapper
already carries `flavorText` (`apiCardToFocusProps`), so this renders for all
users once added; offline users get it from the local blob. Guard with the
existing `pending` ghost when detail is still loading.

### UI (`src/components/shell/sidebar-user-menu.tsx`)

A new `DropdownMenuGroup` with one status-driven item, plus a "Remove" action when
on. Driven by `useDetailRuntime` (narrow S3 selectors). Copy (no em-dashes):

- off: "Download card details (~2.1 MiB)"
- downloading: "Downloading card details..." with a shimmer indicator
- ready + current: "Card details saved. Synced {relative time}." + "Remove" action
- stale: "Card details updated. Re-sync (~2.1 MiB)."
- error: "Download failed. Retry."

The user sees "updated" only when the content version actually changed, never on a
plain weekly rebuild.

## Data shape

```ts
// In corpus-detail.json.gz: an array sorted by id of { id, ...DetailCard }.
interface DetailCard {
  hp?: string;
  evolvesFrom?: string;
  abilities?: { name: string; text: string; type: string }[];
  attacks?: { name: string; cost?: string[]; damage?: string; text?: string }[];
  rules?: string[];
  weaknesses?: { type: string; value: string }[];
  resistances?: { type: string; value: string }[];
  retreatCost?: string[];
  flavorText?: string;
  artist?: string;
}
```

These are exactly the `CardStats` fields (minus prices/setLogo, which are joined /
fetched separately), so merging a `DetailCard` into the corpus-derived card yields
a `FocusCardData` indistinguishable from the RPC's result, minus prices.

## Staleness model

- `version` is a content hash of the canonical detail data. Identical data -> same
  version -> the client's stored version matches -> "current". Only a real card
  change flips it.
- Check: `GET /corpus-detail/version` (tiny). Compare to the stored version.
- Sync: on mismatch, `GET /corpus-detail` (whole blob), rebuild, store.
- There is no push channel (pokemontcg.io exposes no per-card `updatedAt` or
  webhook), so detection is pull + content-compare at the crawl cadence (weekly).
- Prices are excluded from the blob specifically so price churn never flips the
  version. Prices remain a live concern handled by the RPC.

## Testing

- Build: one crawl yields both arrays; `version` is deterministic (same input data
  -> same sha256); no timestamp leaks into the hashed payload.
- Worker: `/corpus-detail` serves the blob with CORS + ETag + 503-when-missing;
  `/corpus-detail/version` serves the meta JSON.
- detail-store / detail-runtime: load from IDB, enable (download + persist), sync
  (no-op when version unchanged, re-download when changed), stale detection,
  disable (clears IDB + Map). Tests inject a fake fetch; never hit the network.
- Modal join: full render with no battle ghost when detail is present; unchanged
  fallback (RPC + ghosts) when absent; offline path omits prices gracefully.
- Flavor text: renders when present, ghosts while pending, absent cleanly when the
  card has none.
- Toggle status reducer: off -> downloading -> ready -> stale -> ready, error path.
- Zustand consumers follow S3 (per-field selectors in the consuming component).

## Risks and mitigations

- Non-deterministic build would defeat real-staleness detection. Mitigated by
  hashing the canonical sorted JSON with fixed key order and no embedded timestamp
  (the slim corpus's `trimCard` already establishes this discipline).
- Blob growth over time (new sets) gradually increases the download. Acceptable;
  re-evaluate chunking only if it materially exceeds a few MiB.
- The background price RPC still fires per open in v1, so "no network on open" is
  only true for battle data, not prices. Documented; a price-only fn is the future
  fix.

## Future work (explicitly out of scope for L1)

A tiered "Offline mode". L1 (this spec) is the metadata layer. Images are the hard
part: measured per-card webp is ~25 KB (grid thumb) + ~84 KB (focus), so the full
20,359-card catalog is ~0.5 GB (thumbs) to ~2.2 GB (thumbs + detail), impractical
as a single download.

- **L2: Collection images offline (planned next sub-project).** Precache only the
  Vault's card images (small + focus) on an opt-in toggle. ~55 MB for a 500-card
  collection. Requires adding a Service Worker (the app has none today) + the Cache
  Storage API, with `navigator.storage.persist()` to resist eviction. On brand
  ("Just your cards") and bounded in size. This is a separate spec; note here that
  L1's toggle UI should leave room to grow into a tiered "Offline" section.
- **L3: Browse cache (not planned).** SW caches every viewed image automatically.
  Possible later, perhaps gated to paid users.
- **L4: Full catalog images (not planned).** 0.5 to 2.2 GB; quota eviction risk,
  mobile/Safari caps. Possible far-future paid-tier feature only.
