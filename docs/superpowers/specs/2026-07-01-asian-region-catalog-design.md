# Asian region catalog (Phase 2) — design

**Date:** 2026-07-01
**Status:** Approved (delegate/auto mode; owner reviews async)
**Depends on:** Phase 1 multilingual catalog (PR #30, merged into `main` 2026-07-01) and variants_detailed (PR #31, merged).
**Owner decisions (locked):** all 6 TCGdex Asian languages · **full separate-region catalog** · land as a reviewed **draft PR** (no merge — merge fires the prod corpus+deploy CI, a human gate).

---

## 1. Problem

Phase 1 shipped a Western multilingual catalog: one English base corpus (`sv01-001`-style ids) with name overlays for fr/de/es/it/pt. Japanese and the other Asian languages were deliberately excluded (`SUPPORTED_LANGUAGES` stops at `pt`; `languages.ts` says "Japanese / Korean / Chinese rejoin in Phase 2").

Asian Pokémon TCG is **not a localization of the Western sets** — it is a separate release lineage. TCGdex models it that way, and our design must too.

### What the research established (evidence-based, live TCGdex probe)

- **Two disjoint id universes.** Western ids use serie codes `base`/`sv`/`swsh` and card ids like `sv01-001`. Asian/JP-lineage ids use serie codes `PMCG`/`VS`/`web`/`e`/`ADV`/`PCG`/`L`/`S`/`SM`/`SV`/`XY` and card ids like `SV1a-001`. The two code spaces **never overlap**. Cross-resolution fails: `en/cards/SV1a-001` → 404, `ja/cards/sv01-001` → 404. **Card ids are therefore globally unique across regions.**
- **The Asian catalog is ONE catalog with six language faces.** ja/ko/zh-tw/zh-cn/th/id all carry JP-lineage set codes (ko `SV4K`, zh-tw `SC2a`, zh-cn `CSMPiC`, th `SVDs`, id `SV3s`). They are localized faces of overlapping JP-lineage ids, **not** overlays of the Western ids. `ja` is the superset (~13.7k official cards / 172 sets); the other five are subsets. Therefore **choosing a language implies choosing a region** — the two language sets are disjoint.
- **A stored `cardId` identifies the printing; `language` identifies which localized face.** `SV1a-001` resolves in ja/ko/zh-tw/zh-cn/th/id to different faces of the same physical printing. Our existing per-stack `Stack.language` field is exactly this discriminator.
- **Image URL:** `https://assets.tcgdex.net/{lang}/{SERIE}/{SET}/{localId}/high.webp`. `imageBase` = `{SERIE}/{SET}/{localId}` is language-invariant; only the `{lang}` path segment changes. Per-language image availability varies (a given id may 404 in one language).
- **Set logos/symbols are usually null for JA/Asian sets** (EN populates them). Asian browse tiles must degrade gracefully to no-logo.
- **Set ids are case-insensitive on lookup but canonical mixed-case** (`SV1a`). Normalize case when keying.
- **Build risk:** the public API's `set.cards[]` array is frequently empty for JA/Asian sets even when `cardCount.total > 0`. Our build uses the self-hosted `tcgdex/server:edge` Docker mirror (fuller data); we must **validate at build time** that the mirror populates `ja` per-set card lists.

---

## 2. Core idea: region = corpus axis, language = overlay axis

Phase 1 already has exactly the two axes this needs. We generalize them by one region.

| Axis | Phase 1 (Western) | Phase 2 adds (Asian) |
|---|---|---|
| **Region** (which base corpus / id universe / set tree) | `west` — base corpus from `/v2/en` | `asia` — base corpus from `/v2/ja` |
| **Language** (which localized name/image face over the region base) | base `en`; overlays `fr de es it pt` | base `ja`; overlays `ko zh-tw zh-cn th id` |

Key consequences that keep this small:

1. **Language ⇒ region.** A single `LANGUAGE_REGION: Record<Lang, "west" | "asia">` map drives everything. The user never toggles "region" directly — they pick a display language, and the region follows. The existing language controls (sidebar + per-page) are the region switcher.
2. **One active overlay at a time, exactly as today.** Each region's base language (`en`, `ja`) needs no overlay (names are baked into the base corpus). Only non-base languages use an overlay blob. So at most one overlay is ever loaded — no multi-overlay machinery.
3. **Card ids are globally unique**, so a merged `byId` across both loaded corpora hydrates any owned card regardless of region. No `Stack.region` field, no id-namespacing, no migration.
4. **No mirrored route tree.** Routes keep their shape; `?lang` carries the region (as it already carries Western language). The nav-tree, slug index, and corpus-reading server functions become region-parameterized by `lang → region`.

---

## 3. Architecture

### 3.1 Build (scripts + CI)

**`scripts/build-corpus.ts` — add a region/base-lang parameter.**
- Today `TCGDEX_BASE` defaults to `https://api.tcgdex.net/v2/en` and is used verbatim. Generalize: `buildCorpus(baseLang = "en")` derives the per-region base URL (`{TCGDEX_ROOT}/v2/{baseLang}`), following the `langBase()` pattern already in `build-i18n.ts`.
- `asia` build: `baseLang = "ja"`. Emits `corpus.asia.json.gz` + `corpus-detail.asia.json.gz` + meta, uploaded to `corpus/region/asia/latest.json.gz` etc.
- The `trimCard` / `detailCard` derivations are language-invariant (share `tcgdex-card-fields.ts`) — no change.
- **ptcg.io overlay (`ptcg-overlay.ts` + `merge-overlay.ts`) is Western-only** and is skipped for `asia` (JP-lineage cards have no pokemontcg.io counterpart; there is no crosswalk). Asian rarity therefore comes straight from TCGdex (coarse; holo detection leans on `variants`/`variants_detailed`). This is an accepted quality gap for v1, noted for the future PriceCharting/holo work.
- **Build validation gate:** after the `asia` crawl, assert the stub count is within a sane band of `Σ cardCount.total` for ja sets. If the mirror returns empty `set.cards[]`, fail loudly rather than shipping an empty Asian corpus.

**`scripts/build-i18n.ts` — extend `I18N_LANGS`.**
- Add `ko`, `zh-tw`, `zh-cn`, `th`, `id`. These crawl `/v2/{lang}` and naturally emit JP-lineage `id → name` maps (the Asian ids), written to the existing `corpus/i18n/{lang}/names.json.gz` path. `ja` is NOT an overlay (it is the Asian base).
- Coverage numbers for the new languages are computed and logged as today.

**`.github/workflows/build-corpus.yml` — extend the matrix/loop.**
- After building the EN/west corpus and its overlays, build the `asia` corpus (`baseLang=ja`) and its 5 overlays, uploading all new R2 keys. The Docker mirror already serves every language endpoint.

### 3.2 Serve (Cloudflare Worker)

`worker/src/index.ts`:
- **New base-corpus routes**, mirroring `/corpus` and `/corpus-detail`:
  - `GET /corpus-region/asia` → R2 `corpus/region/asia/latest.json.gz`
  - `GET /corpus-region/asia/version` → R2 `corpus/region/asia/meta.json`
  - `GET /corpus-region/asia/detail` → R2 `corpus/region/asia/detail-latest.json.gz`
  - Same ETag / conditional-GET / SWR handling as `serveCorpus`.
  - Generalize with a `/^\/corpus-region\/([a-z-]+)(\/version|\/detail)?$/` matcher gated to a `SUPPORTED_REGIONS = ["asia"]` allow-list (future regions are additive).
- **Extend the `/corpus-i18n/{lang}` overlay gate** to include the five Asian *overlay* languages `ko zh-tw zh-cn th id`. `ja` is a supported display language but ships **no** overlay blob (its names are the Asian base corpus), so it is deliberately **omitted from the overlay gate** — a `/corpus-i18n/ja` request 404s, which the client never issues because it treats a region-base language as needing no overlay.
- `/v2/*` proxy is unchanged and already passes `/v2/ja/...` through — Asian **detail** text (abilities/attacks/flavor) works today via the live per-card fetch.

### 3.3 Client corpus runtime

**Region-indexed corpus state.** `useCorpusRuntime` currently holds a single `index: CorpusIndex | null`. Generalize to hold a map keyed by region while keeping a cheap "active region" pointer:

```ts
interface CorpusRuntimeState {
  indices: Partial<Record<Region, CorpusIndex>>; // { west, asia? }
  activeRegion: Region;                           // derived from display language
  // ...loading flags per region
}
```

- `loadCorpus(region)` fetches `/corpus` (west) or `/corpus-region/asia` (asia), gunzips, `buildIndex`, and stores under `indices[region]`. IDB-cached per region in a keyed store (mirror `corpus-store.ts`; key by region), with the same 304 revalidation.
- **`west` loads eagerly** (today's behavior — the default catalog). **`asia` loads lazily**, triggered by either:
  1. the active display language switching to an Asian language, or
  2. the collection containing at least one owned stack whose `cardId` does not resolve in the `west` index (or whose `language` ∈ Asian) — so a returning user's owned Asian cards render without a manual switch.
- A **merged `byId`** helper (`resolveCard(cardId)` → checks `indices[activeRegion]` then all loaded indices) backs cross-region hydration. Because ids are unique, order doesn't matter.

**Query/browse are region-scoped.** `queryCorpus`, the slug index (`buildSlugIndex`), and the nav tree operate on the **active region's** index. Server functions (`getSetCardsFn`, `searchCardsFn`, `getDexCardsFn`, `getCardForRouteFn`, `getPokedexFn`) gain a `region` (or `lang`, from which region is derived) parameter and select the region's corpus via a region-aware `queryCorpusServer(region)`; the server loader memoizes one index **per region**.

**Sets / nav tree are region-scoped and live-fetched.** `fetchAllSets()` hardwires `/v2/en/sets`. Parameterize to `fetchAllSets(baseLang)` — `en` for west, `ja` for asia — reusing the identical list-then-per-set-detail path through the worker proxy (serie + releaseDate come from the per-set detail). No baked sets index. `getNavTreeFn(region)` memoizes per region. Missing JA logos/symbols fall through to the existing "no logo" tile rendering.

### 3.4 Routing

Routes keep their shape (`/$series/$set/$card`, the card overlay, `$card_/manage`). Region rides on `?lang`:
- `validateSearch` already maps `?lang` to a supported language; extend the accepted set to the 6 Asian languages.
- Loaders derive `region = LANGUAGE_REGION[lang]` and resolve slugs / fetch cards against that region's index + nav tree.
- **Slug collisions across regions are handled by the `?lang`-selected region**: `/scarlet-violet/151/charizard?lang=ja` resolves against `asia`; the same path without an Asian `?lang` resolves against `west`. Shared Asian links carry `?lang` (the masked overlay + `validateSearch` already preserve it). A stripped Asian link degrades to a west lookup → graceful not-found, no crash.

### 3.5 Userland (Vault)

- **No schema change.** `Stack.cardId` already holds a globally-unique TCGdex id; `Stack.language` already records the localized face. No `region` field, no snapshot bump, no IDB migration. Additive only.
- **Language selector** (`stack-form-schema.ts`) is gated to `SUPPORTED_LANGUAGES`; extending that constant adds the 6 Asian options for free. Present them grouped ("Asian catalog") in the picker.
- **Cross-region hydration.** `joinOwnedViews` / `buildCardRows` / `tallyOwnedBySet` / `binderMembers` currently look up `index.byId` (one index) and silently skip misses (`if (!cc) continue`) — which today makes an owned Asian card **silently vanish**. Change these join points to resolve against the merged `byId` (all loaded indices). This is the one correctness-critical userland change.
- **Owned-card face language.** Render each owned card with: the active display language **if it belongs to that card's region**, else the card's **region base** (`en` for west, `ja` for asia). Consequences: a Western card under an Asian display language renders its English face; a Japanese card under a Western display language renders its Japanese base face. This keeps exactly one overlay active (the display language's) and never tries to fetch a non-existent face. Determining a card's region: derive from its serie-code lineage (or tag cards with their region at `buildIndex` time — cheaper and explicit).
- **Binders are single-region for v1.** A binder's rules execute against one region's index (the region of the binder's set/query context, defaulting to the active region). Cross-region binders are out of scope; note it.

### 3.6 `languages.ts` (single source of truth)

Extend the existing module (do not fork it):
- `SUPPORTED_LANGUAGES` gains `ja ko zh-tw zh-cn th id`.
- `LANGUAGE_LABELS` gains endonyms (日本語, 한국어, 繁體中文, 简体中文, ไทย, Bahasa Indonesia).
- New `type Region = "west" | "asia"`, `LANGUAGE_REGION: Record<SupportedLanguage, Region>`, `REGION_BASE_LANGUAGE: Record<Region, SupportedLanguage>` (`{ west: "en", asia: "ja" }`), and `regionForLanguage(lang)`.
- `NAME_TRANSLATING_LANGUAGES`: all six Asian languages translate names (unlike es/it/pt which print English), so add them.
- `toSupportedLanguage` no longer force-normalizes `ja` → `en` (ja is now first-class). Verify no stored `Stack.language` was destructively mutated ja→en by a Phase-1 migration; if it was, that is pre-existing unrecoverable loss we simply stop inflicting going forward.
- The worker keeps its own copy of the lang/region allow-lists (it cannot import app code); keep the two in sync (a shared JSON or a comment cross-reference).

---

## 4. Data flow (end to end)

1. **Build (CI, weekly + manual):** Docker mirror → `buildCorpus("en")` → west blobs; `buildCorpus("ja")` → asia blobs; `build-i18n` for fr/de/es/it/pt (west overlays) + ko/zh-tw/zh-cn/th/id (asia overlays). Upload all to R2.
2. **Serve:** Worker serves `/corpus` (west), `/corpus-region/asia` (asia base), `/corpus-i18n/{lang}` (overlays), `/v2/*` (live detail proxy).
3. **Browse:** user picks display language → `region = LANGUAGE_REGION[lang]` → ensure that region's corpus + nav tree are loaded → browse tree, set pages, search all resolve against that region's index; card names/images use the region base or the active overlay.
4. **Detail:** `/$series/$set/$card?lang=ja` → `getCardForRouteFn({..., lang})` resolves the id via the asia slug index → live `/v2/ja/cards/{id}` for detail text (existing path) → render.
5. **Collection:** Vault ensures `west` (+ `asia` if the user owns Asian cards) are loaded → owned stacks hydrate against merged `byId` → each renders in its region-appropriate face.

---

## 5. Error handling & degradation

- **Asian corpus not built / unavailable:** `/corpus-region/asia` 503s. Client keeps `west` active, disables Asian language options with a "catalog updating" hint, and any owned Asian cards fall back to an identity/placeholder (existing holo-card `onError` path). No crash.
- **Missing per-language image (id 404s in that lang):** `cardImage` already falls back through `imageBase` → baked URL → identity card. Asian cards inherit this.
- **Missing JA set logo/symbol:** tiles render without a logo (existing behavior for logo-less sets).
- **Empty `set.cards[]` from the mirror at build:** build fails the validation gate (§3.1) rather than shipping an empty catalog.
- **Owned card in a region not yet loaded:** the lazy-load trigger loads `asia`; until it resolves, the card shows a loading/placeholder rather than vanishing.

---

## 6. Testing strategy

- **Pure unit (bun/jsdom):** `languages.ts` region mapping; region-parameterized `buildSlugIndex`/nav-tree; merged-`byId` hydration (owned Asian card resolves); face-language selection rule (west card under asia lang → en face; asia card under west lang → ja face); `build-corpus` `baseLang` URL derivation; worker route matching for `/corpus-region/*` and extended `/corpus-i18n` langs (worker test harness).
- **Userland:** owned Asian stack renders in `useOwnedCardRows`/`useOwnedCountBySet`; binder progress against the asia index; no migration side-effects on existing west data.
- **Build scripts:** `build-corpus.test.ts` extended for `baseLang=ja` fixtures; validation-gate failure path.
- **Browser provider (end of each TDD task only):** language switch flips the browse tree to JP sets; card overlay opens a JP card; Vault shows a mixed EN+JP collection. Pre-seed the corpus per the project's no-network test rule (`useCorpusRuntime.setState({ indices: ... })`).
- **Local R2 smoke test** (per the documented procedure): build a small asia corpus, `wrangler r2 object put --local`, boot `vite dev`, verify JP browse + detail + owned rendering in Claude Preview before opening the PR.

---

## 7. Scope boundaries (YAGNI)

**In scope:** all 6 Asian languages as a browsable separate-region catalog (sets, series, cards, detail), owning Asian cards in the Vault, language-driven region switching, cross-region collection rendering.

**Out of scope for v1 (noted, not built):**
- Cross-region binders (a binder spans one region).
- ptcg.io rarity/foil overlay for Asian cards (no crosswalk exists) — Asian holo/rarity is coarse.
- Pricing (already deferred pending PriceCharting; TCGdex Asian pricing is EUR/Cardmarket only and not per-printing accurate).
- Per-stack-language faces beyond the region-base/active-overlay rule (e.g. rendering a Korean-owned card in Korean while the display language is Japanese) — the region-base fallback covers correctness; finer faces are a later polish.
- A dedicated `/asia` route namespace (the `?lang`-derived region is sufficient and reuses all routing).

---

## 8. Assumptions (delegate-mode calls made on the owner's behalf)

1. **Region is driven by display language, not a separate toggle.** Adding a distinct region switcher was rejected as redundant since the language sets are disjoint. The language picker groups "Western catalog" vs "Asian catalog" to make the catalog switch legible.
2. **`ja` is the Asian base corpus language** (it is the id superset). ko/zh-tw/zh-cn/th/id ship as name overlays over the ja base. There is no English face for JP-lineage cards, so the Asian catalog is inherently non-English; a user viewing it always sees a native Asian face.
3. **No `Stack.region` field and no migration.** Card ids are globally unique, so a merged `byId` is sufficient. This was the biggest simplification the research unlocked.
4. **Lazy-load the Asian corpus** (on Asian display language or on detecting owned Asian cards). Eager double-loading was rejected to keep the common (Western-only) user's cold start cheap.
5. **Routes keep their shape**; `?lang` carries region. A mirrored `/asia/...` route tree was rejected as unnecessary duplication.
6. **Asian rarity/holo is coarse for v1** (no ptcg overlay). Accepted gap.
7. **Land as a reviewed draft PR** based on `main`; do not merge (prod corpus+deploy CI is a human gate).

---

## 9. Files touched (map, not exhaustive)

- Build: `scripts/build-corpus.ts` (+test), `scripts/build-i18n.ts`, `.github/workflows/build-corpus.yml`.
- Serve: `worker/src/index.ts` (+test), `worker/wrangler.toml` (no new binding — same R2 bucket, new keys).
- Corpus runtime: `src/store/corpus/corpus-runtime.ts`, `corpus-runtime-store.ts`, `corpus-store.ts` (region-keyed IDB), `corpus-engine.ts` (region tag on cards + merged resolve), `src/server/corpus-loader.ts`, `src/server/corpus-server.ts`, `src/server/nav-tree.ts` + `src/lib/nav-tree.ts`, `src/server/card-data-fetch.ts` (`fetchAllSets(baseLang)`).
- Routing/UI: `src/routes/$series/**`, `src/components/islands/{global-language-control,card-language-control,card-overlay}.tsx`, `src/lib/card-route.ts`, `src/lib/slug.ts`.
- Languages: `src/lib/languages.ts`.
- Userland: `src/store/userland/{selectors,card-rows,binder-progress}.ts`, `src/components/collection/stack-form-schema.ts`.

---

## 10. Rollout

Single branch off `main`, subagent-driven TDD, kept green at each step. Draft PR at the end with the build/serve/client/userland changes. The prod Asian corpus only materializes when CI runs on merge (human gate) — so the PR is reviewable and green without a prod rebuild. A reviewer merges to trigger the first Asian corpus build + deploy.
