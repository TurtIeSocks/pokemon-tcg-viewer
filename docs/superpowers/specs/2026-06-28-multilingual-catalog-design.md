# Multilingual Card Catalog — Design

- **Date:** 2026-06-28
- **Status:** Proposed — revised after adversarial spec review (2026-06-28); awaiting your review → writing-plans
- **Owner:** Vault / corpus
- **Supersedes (partially):** `docs/superpowers/specs/2026-05-30-card-corpus-cache-design.md` (data source + image origin change)

## Problem

The research report (`docs/reports/pokemon-tcg-research-report.md`) names **variant and language coverage** as the #1 user pain point. Today the app *records* a card's language (`Stack.language`, ISO 639-1) but the **catalog has no non-English cards to render**: the corpus is crawled English-only from pokemontcg.io, `CorpusCard` has no language axis, and `hydrateCard` ignores `Stack.language`. Net effect is a **latent correctness bug** — the language selector silently no-ops; picking Japanese still shows the English card. We fix this by making the catalog genuinely multilingual. Precisely, v1 makes the catalog *able to render* non-English via a **global display-language switch**; rendering **each owned stack in its own recorded language** regardless of the global setting is a later enhancement (Phase 1.5). Until then the selector is **gated to supported languages** so it can no longer silently no-op.

## How we got here (decision trail)

Two empirical probes (live, 2026-06-28) decided the architecture:

1. **EN parity — TCGdex ≥ pokemontcg.io.** pokemontcg.io: 20,359 cards / 173 sets. TCGdex EN: 23,315 unique cards / 209 sets (20,307 "official" — level; the surplus is secret/alt-art). Newest set ships the **same day** in both (Chaos Rising, 2026-05-22). Switching English to TCGdex **expands** coverage, does not regress it.
2. **ID translation — deterministic, not fuzzy.** Of 173 pokemontcg.io sets, **122 (70.5%)** are verbatim-identical set-id *and* card-id (`swsh3-136` → `swsh3-136`, all of Base→Sword&Shield base + Black Star promos). The 51 divergent sets decompose into: **23** deterministic-regex (zero-pad S&V/Mega set number + `pt5`/`35`→`.5`), **6** subset-fold (gallery pseudo-sets → parent, localId kept), **22** irreducible lookup-table (renamed: `base6`→`lc`, `pgo`→`swsh10.5`, 11× McDonald's, 4× EX trainer kits, `rsv/zsv`→`sv10.5w/b`). Card numbers **never reorder/renumber** — the only per-card difference is zero-padding, killed by a numeric strip.
3. **The one TCGdex weakness — images, not data.** TCGdex lacks the `image` field for **1,295 / 23,315 EN cards (5.6%)** across 59 sets, incl. 3 whole mainline sets (Shining Legends, Dragon Majesty, Unseen Forces Unown), half of Celebrations, ~20% of e-Card crystal holos. pokemontcg.io serves all of those. Sole-TCGdex would regress them to blank.

## Decisions (the calls made — delegate mode)

| # | Decision | Rationale |
|---|---|---|
| D1 | **TCGdex = source of truth** for catalog data, ids, images, multilingual text. | Parity passes; ids deterministically translatable; only free multilingual source; freshness equal. |
| D2 | **pokemontcg.io demoted to a build-time image gap-filler** for **all** cards TCGdex lacks an image for (incl. fringe promos/kits — collector hobby covers everything). Zero runtime dependency; deletable when TCGdex backfills. | Contains the 5.6% image regression. pokemontcg.io image URLs are deterministic (`images.pokemontcg.io/{setId}/{number}[_hires].png`), constructed from the translated id — no extra crawl. |
| D3 | **Pricing removed** (throwaway "we have the info anyway" data — stale snapshot, unlabeled, no history) until a dedicated PriceCharting connector (report MVP#6, **separate effort**). | **NOT because TCGdex lacks prices** — its per-card `/cards/{id}` *does* return a `pricing` object (cardmarket + tcgplayer passthrough). We drop it because (a) it carries the same staleness/no-history problem as today, and (b) the research report flags **price-feed redistribution as the #1 IP/licensing risk**. The TCGdex→`FocusCardData` mapper must therefore *explicitly* drop `pricing`; it does not vanish on its own. No real users to regress. |
| D4 | **Hybrid language model.** Western (fr/de/es/it/pt) = field-level localization over the **shared** EN set/id/number. Asian (ja/ko/zh-cn/zh-tw) = **separate region catalog** (own id namespace, own set tree). | Empirically: Western langs share TCGdex set-id/numbering (only name/image differ); Japanese is a separate namespace (`swsh3-136` 404s in `/ja`), with JP-exclusive cards that have no EN id. |
| D5 | **Migration = deterministic id-crosswalk, hard cut, no fuzzy UI.** | No real users; ids translate by function + a ~22-row table. A best-guess-match UI would be over-built. |
| D6 | **Caching = Option C** — EN base blob + per-language **name-only** overlays, lazy-loaded; image URLs **derived** from the TCGdex path, not stored. | Smallest common case (en-only unchanged at 0.49 MiB; en+1 ≈ 0.69 MiB); reuses the shipped detail-blob pattern verbatim. |
| D7 | **Phase the work:** 1a structural source swap (English-only) → 1b Western overlays → 2 Japanese. **1a+1b ship as ONE release** (1a is a review/commit boundary, not a deploy); 2 is a later release. | Isolates the risky migration from the feature for review, without shipping a strictly-worse intermediate (1a alone removes pricing and leaves the language bug unfixed). |

## Non-goals

Japanese/Asian catalog (Phase 2) · CJK/Thai search tokenization (Phase 2) · cross-language print-group linking ("show this card in all languages") · variant-taxonomy enrichment (1st ed / shadowless — orthogonal) · localized **detail** (battle/flavor) text (Phase 1b+ optional; v1 detail stays EN) · mirroring TCGdex images · live pricing (PriceCharting, separate) · uploaded card images.

---

## Architecture

The existing corpus pipeline (build → R2 → worker → IDB → in-memory index → `hydrateCard` → render) is kept whole. Changes are: **swap the data source**, **add an i18n overlay lane** (modeled on the existing optional **detail** blob), and **migrate ids once**.

### Phase 1a — Source migration to TCGdex (English-only, structural)

**Success criterion:** every card originates from TCGdex, all stored corpus-ids are migrated, image-gap cards fall back to pokemontcg.io, and the pricing UI is dark. **1a is an internal commit/PR boundary, NOT a standalone release** — shipping it alone would be *strictly worse* than today (pricing gone, and the headline language bug still unfixed: the selector + `hydrateCard` stay language-blind until 1b). **1a and 1b ship together as one release;** 1a exists only to isolate the risky structural swap for review.

**Build (`scripts/build-corpus.ts`)**
- Replace the pokemontcg.io crawl (`ORIGIN`, `SELECT`, `fetchPage`, `ApiCard`) with the **TCGdex bulk dataset as the primary source, NOT the per-card REST API**. Rationale: the TCGdex per-set brief returns only `{id, image, localId, name}`; every field the app filters/sorts on (rarity, types, supertype, subtypes, dex numbers, variant booleans) lives only on `/cards/{id}`, so an API crawl would be **~20k individual GETs** — a 100× blow-up over today's ~82 paged requests, and abusive of TCGdex's "be considerate" ask. Build instead from the **`tcgdex/cards-database` repo clone** (MIT, multilingual-per-record) or a **self-hosted `tcgdex/server` Docker** mirror — both already in the research, both yield the full dataset (all languages) in one pass. Keep the ≥95% completeness guard.
- `trimCard` now maps a TCGdex card → `CorpusCard`:
  - `id` = TCGdex id (e.g. `swsh3-136`).
  - `variants` = derived from TCGdex's explicit boolean flags → `['normal','holo','reverse','firstEdition','wPromo'].filter(k => card.variants?.[k])`, **richer than the old tcgplayer-price-key inference**. Test that overlap cards still produce keys existing user collections reference.
  - `imageBase` (**new field**, see below) = the language-invariant TCGdex image tail `{serie}/{set}/{localId}`. The raw TCGdex `image` field is **host-qualified, language-prefixed, and extension-less** (`https://assets.tcgdex.net/en/swsh/swsh3/136`); `trimCard` must strip the host + leading `en/` to get the invariant tail (unit-tested), else `cardImage`'s `${CDN}/${lang}/${imageBase}` double-prefixes the language. `null` when TCGdex has no image.
  - `imageUrl` / `imageUrlSmall` = the **resolved EN** URLs baked at build: TCGdex `…/{imageBase}/high.webp` & `/low.webp` when present; otherwise the **pokemontcg.io fallback** `https://images.pokemontcg.io/{ptcgSetId}/{ptcgNumber}[_hires].png` constructed from `tcgdexCardToPtcg(id)` (D2) — add `ptcgImageUrl(setId, number)` to the crosswalk module. HEAD-probe fallbacks at build and log unresolved (cards in neither source's images → placeholder). **This changes the blob's image origin (pokemontcg.io → TCGdex/webp), a breaking corpus-format change — the stored corpus is rebuilt, not migrated in place.**
- `detailCard` maps TCGdex battle/flavor → `DetailCard` (unchanged shape; EN only in v1).
- Emit a **catalog-gap log** artifact (image-less + unresolved cards) — doubles as the report's wanted "catalog gap log" governance item.

**ID crosswalk (`scripts/id-crosswalk.ts` + a runtime-shared copy)**
A single bidirectional module, the only place that knows the mapping:
```ts
// setId-level: verbatim ∥ regex ∥ fold-rule ∥ ~22-row table
export function ptcgSetToTcgdex(setId: string): string;   // "sv1" -> "sv01", "base6" -> "lc"
export function tcgdexSetToPtcg(setId: string): string;   // inverse
// cardId-level: split "{setId}-{localId}", remap setId, normalize localId width to target convention
export function ptcgCardToTcgdex(id: string): string;     // "sv1-1"  -> "sv01-001"  (migrate existing Stack.cardId)
export function tcgdexCardToPtcg(id: string): string;     // "sv01-001" -> "sv1-1"   (construct pokemontcg.io image fallback)
// ponytail: 22-row RENAMES table is hand-maintained; regex+fold absorb the regular
// S&V-pad and gallery-fold cases. New renamed sets need a table row.
```
Note on zero-padding direction: TCGdex S&V ids are zero-padded (`sv01-001`); pokemontcg.io are not (`sv1-1`). The card-level functions apply the set remap then normalize the localId numeric width to the **target** source's convention. Covered by table-driven unit tests over the sampled sets.

**Worker (`worker/src/index.ts`)**
- Repoint the live `/v2/*` passthrough `fetchOrigin` (`ORIGIN` const, line 8) from pokemontcg.io → `api.tcgdex.net/v2/en` (and `…/v2/{lang}` in 1b). See **Live fetch + sets adaptation** below — the origin swap alone is not enough; the request/response shapes differ.
- `/corpus`, `/corpus-detail`, `/corpus-detail/version` and the R2 keys (`corpus/latest.json.gz`, `corpus/detail-latest.json.gz`, `corpus/detail-meta.json`) are **unchanged** — only the bytes' provenance changes.
- Optionally proxy `assets.tcgdex.net` images through the worker as a thin edge cache (honors TCGdex's "cache locally / be considerate" ask; swappable origin). Image origin can also be hotlinked directly in 1a and proxied later — flagged, not blocking.

**Corpus types (`src/store/corpus/corpus-types.ts`)**
```ts
export interface CorpusCard {
  id: string;                  // TCGdex id
  name: string;                // EN name (overlaid per-language in 1b)
  imageUrl: string;            // resolved EN large (tcgdex high.webp OR pokemontcg.io fallback)
  imageUrlSmall: string;       // resolved EN small
  imageBase: string | null;    // NEW: tcgdex "{serie}/{set}/{localId}"; null => no localized image (use imageUrl)
  rarity?: string;
  subtypes?: string[];
  supertype: string;
  types?: string[];
  setId: string;
  number: string;
  nationalPokedexNumbers?: number[];
  variants?: string[];         // from tcgdex variant booleans
}
```

**Live fetch + sets adaptation (`src/server/card-data-fetch.ts`, `card-mappers.ts`, `src/lib/api-base-client.ts`)**
The corpus build is not the only pokemontcg.io consumer; the live SSR/focus path must be ported too:
- `fetchAllSets()` uses a pokemontcg.io-shaped `/v2/sets?orderBy=releaseDate&select=…` query returning a `{data}` envelope. TCGdex `/v2/en/sets` differs (no top-level `series`; `serie` only on the per-set detail; logos under `set.logo`, extension-less). Rewrite it, deriving series from `set.serie.name`.
- **Critically, `setsById` (built from `fetchAllSets`) must key on TCGdex set ids** (or route through the crosswalk). Otherwise corpus cards (TCGdex ids) won't join their set in `hydrateCard`, breaking `setName`/`setSeries`/`setReleaseDate` and set-tile logos everywhere.
- `fetchCardById()` expects `{data: PokemonApiFocusCard}`; TCGdex returns the card object directly with renamed fields (`illustrator`/`dexId`/`evolveFrom`/`effect`/`description`/`regulationMark`). Rewrite `card-mappers.ts` to the TCGdex shape and **explicitly drop the `pricing` object** (present, not auto-absent — D3). `FocusCardData` loses `tcgplayer`/`cardmarket`.
- `api-base-client.ts` `apiBase()` default also points at pokemontcg.io — repoint it.
- **Pricing UI dark:** `src/lib/price-lines.ts`, `src/components/islands/card-prices.tsx`, `src/components/card/card-pricing-tab.tsx` gated behind a `PRICING_ENABLED = false` flag (kept as the PriceCharting seam, not deleted) — the components render unconditionally today, so each needs an explicit guard.

**Data migration (one-time, all corpus-id references)**
Every stored corpus-id must be remapped via `ptcgCardToTcgdex` / `ptcgSetToTcgdex`, not just `Stack.cardId`:
- `Stack.cardId` (card id)
- `Binder.includeCardIds`, `Binder.excludeCardIds` (card ids)
- `BinderRule.query.setId` (set id)
- `Profile.favoriteSetId` (set id)
- `BinderSnapshot.cards[].cardId` in `share.ts` (card ids) — see Share links below

**Two distinct version axes (do not conflate):**
- **Snapshot schema:** `UserDataSnapshot.schemaVersion` 5 → **6**. Add `6` to `SUPPORTED_VERSIONS`; `backup.ts upgrade()` returns 6 with a v5→v6 remap. The literal `schemaVersion: 5` / `: 5` appears in **`backup.ts` (×2), `types.ts`, and `supabase-repo.ts`** — enumerate and bump all.
- **Live IDB marker:** `CURRENT_DATA_VERSION` in `idb-repo.ts` is currently **4**; bump 4 → **5** and add a v4→v5 block in `migrateUserlandData` (same marker-gated pattern as the cents migration) that remaps live rows once on `loadUserland`. Idempotent; never inside `normalizeStack`.

**Cloud sync (Supabase) — out of scope, consciously.** `supabase-repo.ts` stores the same corpus ids and writes `schemaVersion: 5`. There are no synced users yet (cloud Vault is pre-launch), so cloud-row remapping is **deliberately cut**. If cloud ships before this does, the synced rows need the same crosswalk pass — flagged so it's a decision, not an omission.

**Share links (`share.ts`) — breaking, accepted.** `BinderSnapshot` encodes raw `cardId`s into the share URL; pre-migration links carry pokemontcg.io ids and won't resolve afterward. Acceptable (no users → no live links); we add no decode-time remap. If links must survive, add a heuristic remap in `decodeSnapshot` (pokemontcg.io-shaped id → `ptcgCardToTcgdex`).

Unmappable ids (none expected for existing English data) are logged and left as-is (render falls back to id string, exactly like a missing set today).

**Tests (1a)**
- Crosswalk: table-driven over the sampled sets (verbatim, regex, fold, lookup) + zero-strip; assert round-trip where both sources have the card.
- `trimCard` over TCGdex fixtures: variants from booleans; `imageBase` set; fallback URL chosen when image absent.
- `backup.ts` v5→v6 upgrade: all five id-reference kinds remapped (Stack.cardId, Binder include/exclude, BinderRule.setId, Profile.favoriteSetId); v6 passthrough; v7 rejected.
- `migrateUserlandData` v4→v5: live IDB rows remap once; marker-gated; idempotent on re-run.
- Image fallback construction + a stubbed HEAD probe.
- Pricing UI hidden under the flag.

### Phase 1b — Western-language overlays (the payoff)

Adds fr/de/es/it/pt. Rides entirely on 1a; the query engine is untouched.

**Build:** per language, crawl `api.tcgdex.net/v2/{lang}/cards`, emit `corpus/i18n/{lang}/names.json.gz` = `[{ id, name }]` (sorted by id) + `corpus/i18n/{lang}/meta.json` = `{ version: sha256, count, builtAt }`. Image URLs are **not** stored — derived from the base blob's `imageBase` + the active language.

**Worker:** two additive parametric routes reusing `serveCorpus()` verbatim, with the same SWR cache headers, validating `:lang` against the supported set:
- `GET /corpus-i18n/:lang` → `corpus/i18n/{lang}/names.json.gz`
- `GET /corpus-i18n/:lang/version` → `corpus/i18n/{lang}/meta.json`

**Client i18n lane (`src/store/corpus/i18n-store.ts` + `i18n-runtime.ts`)** — reuses the detail blob's gzip / IDB / content-hash version-probe / SWR **mechanics**, but is structurally different and must **not** inherit detail's enable/disable machinery:
- detail is a single-blob, user-*toggled* offline feature (`enabled` flag, `enableOffline`/`disableOffline`). The i18n lane has **no toggle**: it's a render dependency, **always-on once a non-`en` `displayLanguage` is selected**, and **switch-driven** (an active-language concept).
- IDB store `ptcg-corpus-i18n`, **keyed per language** (`gz:{lang}`, `meta:{lang}`) — not the single `gz`/`meta` keys detail uses.
- `useI18nRuntime` holds the **active** overlay `namesById: Map<string,string> | null` for the current `displayLanguage`, with injectable fetch seams for tests (mirroring `setDetailFetchersForTests`).
- Lifecycle: `loadI18n(lang)` (IDB-first on boot/switch), `downloadI18n(lang)`, `syncI18n(lang)`, `checkStale(lang)`. No `enabled` flag — do not copy detail's enable/disable lifecycle.

**Display language (`Profile.displayLanguage`)**
```ts
// types.ts Profile: + displayLanguage: string;  // ISO 639-1, default 'en'; catalog render language
// ProfilePatch: + "displayLanguage"
// UserDataSnapshot stays v6 (additive optional field, backfilled 'en' on read)
```
A header/setting switcher sets `displayLanguage`; changing it lazy-loads that overlay (download once, then IDB) and re-renders. en-only users never fetch an overlay.

**Hydration (`src/store/corpus/corpus-engine.ts`)**
```ts
export function hydrateCard(
  card: CorpusCard,
  setsById: Map<string, PokemonSet>,
  i18n?: { lang: string; namesById: Map<string, string> | null } | null,
): HoloCardData {
  const name = (i18n?.namesById?.get(card.id)) ?? card.name;     // EN fallback
  const { imageUrl, imageUrlSmall } = cardImage(card, i18n?.lang ?? "en");
  // …rest unchanged
}
```
`i18n` defaults undefined → **all existing call sites compile and behave exactly as today**; only the display-language-aware paths pass it.

**Image derivation (`src/lib/card-image.ts`)**
```ts
const CDN = "https://assets.tcgdex.net";
// en (or no localized image) => the baked imageUrl/Small; else derive per language.
export function cardImage(card: CorpusCard, lang: string): { imageUrl: string; imageUrlSmall: string } {
  if (lang === "en" || !card.imageBase)
    return { imageUrl: card.imageUrl, imageUrlSmall: card.imageUrlSmall };
  const base = `${CDN}/${lang}/${card.imageBase}`;
  return { imageUrl: `${base}/high.webp`, imageUrlSmall: `${base}/low.webp` };
}
```
Known edge: a language may lack a specific image even when EN has it → broken URL. The renderer must gain an `onError` fallback to the baked `card.imageUrl`. **`holo-card.tsx`'s `<picture><source/><img/></picture>` (grid ~L169-179, focus ~L143-161) has no `onError` today** — add `onError={(e) => { e.currentTarget.src = imageUrl; e.currentTarget.onerror = null; }}` to the `<img>` in both renders, covered in `holo-card.test.tsx`. Cheap, no extra data.

**Selector gate (the bug fix):** `Stack.language` options + the display-language switcher offer only catalog-supported languages (1b: `en, fr, de, es, it, pt`). No more "pick Japanese → see English." Dev seed-data (`seed-data.ts`, currently weights `ja`/`zh`) restricts generated `language` to the supported set too. Existing stacks whose language is unsupported render EN (as today). Japanese rejoins the selector in Phase 2.

**Tests (1b):** i18n round-trip + version determinism; `hydrateCard` name selection (overlay hit vs EN fallback); `cardImage` derivation per language; selector gating; lazy-load fires once per language.

### Phase 2 — Japanese / Asian sub-catalog (sketch)

Separate region namespace from TCGdex `data-asia/` (`/v2/ja`, `/v2/ko`, `/v2/zh-tw`, `/v2/zh-cn`): own set ids, own set tree, JP-exclusive cards. New browse routes (`/sets/jp`-style), CJK-aware search tokenization, and an **optional** later print-group link table to show one artwork across languages. Reuses the 1b overlay/cache machinery and the same worker route shape, just a parallel set universe. Detailed in its own spec.

---

## Caching & size (verified)

- EN base blob: **~0.5 MiB gz** (20k cards). `imageBase` adds a small per-card string *on top of* the kept `imageUrl`/`imageUrlSmall` (3 image strings where there were 2), so the blob grows marginally — still ≈0.5 MiB, not a literal wash. (A future optimization could omit `imageUrl`/`imageUrlSmall` when `imageBase` is present and derive even the EN url, making the offset real; not done in v1.)
- Each Western overlay: ≈ **0.2 MiB gz** (names only). en + 1 language ≈ 0.69 MiB; en + all 5 ≈ ~1.5 MiB — only for users who switch.
- Overlays + detail are **opt-in, separately versioned** (own content-hash + `/version` probe), so a single-language fix bumps only that overlay's ETag; the base blob and other languages get cheap 304s.
- Existing ETag conditional-GET, `ptcg-corpus` IDB store, `CorpusMeta`, and `loadCorpus()` are untouched. Overlays are purely additive (new store, new routes).

## Image strategy

Hotlink `assets.tcgdex.net` (derive `high.webp` for the modal, `low.webp` for grids), optionally fronted by the existing CF Worker as a caching proxy. **Do not mirror** — 130k+ images across languages is hundreds of GB of Pokémon-Company IP and the real legal exposure (the MIT license covers TCGdex's *text* only). For the 5.6% of cards TCGdex lacks, the **pokemontcg.io image CDN** fallback is baked at build time via the crosswalk; cards absent from both get a placeholder (logged). Self-host `tcgdex/server` (Docker) is the documented escape hatch if TCGdex ever rate-limits or disappears.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| `imageBase`-derived non-EN image missing while EN present → broken img | `<img onError>` falls back to baked `imageUrl`; no extra data. |
| Crosswalk 22-row table drifts as sets are renamed | Regex + fold rules absorb the regular cases; table is small + unit-tested; build gap-log surfaces new misses. |
| Cards exclusive to one source (image fallback has no target) | Placeholder + gap-log entry; rare, fringe. |
| TCGdex CDN dependency / rate limits | Worker edge-cache proxy + self-host Docker fallback documented. |
| CJK search quality | Deferred to Phase 2 with a per-script tokenizer; 1b is Latin-only. |
| Language-code granularity (`zh` vs `zh-cn`/`zh-tw`) | `Stack.language`/selector use ISO 639-1 (bare `zh`); TCGdex Asian paths are region-tagged (`/v2/zh-tw`, `/v2/zh-cn`). Phase 2 must define the normalization (which `zh` maps where) so the selector-gate and the catalog namespace agree; named now to avoid silent disagreement. |
| Localized **detail** (attacks/flavor) still EN in v1 | TCGdex per-language card endpoint provides it; deferred to a later slice, not blocking the name/image fix. |
| `displayLanguage` vs per-stack language semantics | v1 = one global display language drives rendering; "owned card prefers its own stack language" is a noted Phase-1.5 enhancement, not v1. |

## Assumptions (explicit, delegate mode — reviewer's checkpoint)

1. **Phase 1a is a review/commit boundary, not a standalone release** — it isolates the structural swap for review but ships *together with* 1b (1a alone would be strictly worse: pricing gone, bug unfixed).
2. **All-TCGdex** over dual-source — chosen after parity + id probes; pricing sacrificed (D3) on licensing/staleness grounds (not data-absence), accepted because no real users + pricing was throwaway.
3. **Image fallback covers every gap card incl. fringe** (promos/kits/McDonald's) per the collector-completeness principle.
4. **Hard-cut migration, no fuzzy UI** — relies on zero real users; only your own dev/seed data is remapped by the crosswalk script.
5. **One global `displayLanguage`**, not per-stack rendering, in v1.
6. **Detail/battle text stays English** in v1; only name + image localize.
7. **Western langs are true localizations** over shared EN ids (TCGdex-confirmed); any divergent Western card falls to EN via the gap log.

## Open questions for the reviewer

Resolved during spec review (2026-06-28), left here for visibility:
- **Release boundary** → 1a+1b ship as one release; 1a is a commit/PR boundary only (D7, resolved post-review).
- **Pricing** → kept dark behind `PRICING_ENABLED=false` as the PriceCharting seam (not deleted).
- **Crosswalk table** → build **generates** the full table by set-name+releaseDate matching and **emits it for human review**, seeded by the probe rows in Appendix A.

Still open for you:
- **Image proxy now or later?** Hotlink `assets.tcgdex.net` directly in 1a/1b and add the worker caching-proxy later, or proxy from day one? (Spec leans hotlink-now, proxy-later.)
- **Build source** — `tcgdex/cards-database` repo clone (needs their TS build step to resolve set imports) vs self-hosted `tcgdex/server` Docker (a running mirror)? Both avoid the 20k-GET API crawl; pick one for the plan.

## Appendix A: ID crosswalk (from the 2026-06-28 live probe)

The migration's correctness keystone. `ptcg → tcgdex` set-id resolution, applied in order:

1. **Verbatim (122/173 sets):** identical set-id *and* card-id. All of Base→Sword&Shield base era + Black Star promos. `swsh3-136` → `swsh3-136`.
2. **Regex (23 sets):** zero-pad a single-digit S&V/Mega set number; rewrite a `pt5`/`35` half-set suffix to `.5`. `sv1`→`sv01`, `sv3pt5`→`sv03.5`, `swsh12pt5`→`swsh12.5`, `sm35`→`sm3.5`, `me1`→`me01`.
3. **Subset-fold (6 sets):** ptcg gallery pseudo-sets fold into the parent; localId kept verbatim. `swsh9tg-TG01`→`swsh9-TG01`, `swsh45sv-SV001`→`swsh4.5-SV001`, `swsh12pt5gg-GG01`→`swsh12.5-GG01`.
4. **Renames lookup table (~22 sets):** genuinely renamed. Known rows from the probe (the build derives the complete table and emits it for review):

| pokemontcg.io | TCGdex |
|---|---|
| `base6` | `lc` |
| `hsp` | `hgssp` |
| `pgo` | `swsh10.5` |
| `bp` | `bog` |
| `rsv10pt5` | `sv10.5w` |
| `zsv10pt5` | `sv10.5b` |
| `tk1a` / `tk1b` | `tk-ex-latia` / `tk-ex-latio` |
| `tk2a` / `tk2b` | `tk-ex-p` / `tk-ex-m` |
| `mcd11` / `mcd12` / `mcd14` / `mcd15` / `mcd16` | `2011bw` / `2012bw` / `2014xy` / `2015xy` / `2016xy` |
| `mcd17` / `mcd18` / `mcd19` | `2017sm` / `2018sm` / `2019sm` |
| `mcd21` / `mcd22` | `2021swsh` / `2022swsh` |
| `cel25c` | folds into `cel25` (confirm at build) |

Then on the card-id: split `{setId}-{localId}`, remap the setId, and normalize the localId numeric width to the target convention (strip leading zeros toward ptcg, pad toward tcgdex). Card numbers never reorder. Residual misses land in the build gap log.
