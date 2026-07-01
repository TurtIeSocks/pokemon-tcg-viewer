# Phase 1b — Western-language overlays (execution plan)

Design: `docs/superpowers/specs/2026-06-28-multilingual-catalog-design.md` (§ Phase 1b).
Goal: render the catalog in fr/de/es/it/pt via name overlays + per-language image derivation, gated so the language selector can no longer silently no-op. Rides entirely on the shipped 1a base blob; the query engine is untouched. Ships together with 1a as PR #30.

Languages (1b supported set): `en, fr, de, es, it, pt`.

## Stage A — independent foundations (parallel)

A1. **`src/lib/card-image.ts`** — `cardImage(card: CorpusCard, lang: string): { imageUrl; imageUrlSmall }`. `lang === "en" || !card.imageBase` → return the baked `card.imageUrl/imageUrlSmall`; else derive `${CDN}/${lang}/${imageBase}/high.webp` & `/low.webp` (CDN = `https://assets.tcgdex.net`). Unit tests: en passthrough, missing imageBase passthrough, fr/de derivation.

A2. **Build i18n overlays** — `scripts/build-i18n.ts` (own entry; reuses the mirror at `TCGDEX_BASE`'s host). Per lang in {fr,de,es,it,pt}: crawl `/{lang}/cards` (brief `{id,name}` is enough), write `corpus/i18n/{lang}/names.json.gz` = `[{id,name}]` sorted by id + `corpus/i18n/{lang}/meta.json` = `{version: sha256(sorted), count, builtAt}`. Mirror build-corpus's fetchJson/retry + ≥95% guard. Tests: round-trip + version determinism (same input → same sha).

A3. **Worker routes** — `worker/src/index.ts`: `GET /corpus-i18n/:lang` → R2 `corpus/i18n/{lang}/names.json.gz`; `GET /corpus-i18n/:lang/version` → `corpus/i18n/{lang}/meta.json`. Reuse `serveCorpus()` + SWR headers + caches.default verbatim. Validate `:lang` ∈ supported set (404 otherwise). Worker tests mirror existing /corpus + /corpus-detail tests.

A4. **`Profile.displayLanguage`** — `src/store/userland/types.ts` Profile: `displayLanguage: string` (ISO 639-1, default `"en"`); add to `ProfilePatch`. Snapshot stays v6 (additive optional; backfill `'en'` on read in `backup.ts`). Default profile + tests.

## Stage B — client lane + hydration (depends on A)

B1. **i18n client lane** — `src/store/corpus/i18n-runtime.ts` (+ `i18n-store.ts` for IDB). Reference: `detail-runtime.ts`/`detail-store.ts` for gzip/IDB/content-hash version-probe/SWR mechanics, but NO enable/disable toggle. IDB store `ptcg-corpus-i18n`, keyed per lang (`gz:{lang}`, `meta:{lang}`). `useI18nRuntime` holds active `{ lang, namesById: Map<string,string> | null }`. Lifecycle: `loadI18n(lang)` (IDB-first), `downloadI18n(lang)`, `syncI18n(lang)`, `checkStale(lang)`. Injectable fetch seam (`setI18nFetchersForTests`, mirror `setDetailFetchersForTests`). Switching to `en` clears the overlay. Tests: round-trip, lazy-load once per lang, version-probe staleness, en clears.

B2. **`hydrateCard` i18n param** — `src/store/corpus/corpus-engine.ts`: `hydrateCard(card, setsById, i18n?: { lang; namesById } | null)`. `name = i18n?.namesById?.get(card.id) ?? card.name`; image via `cardImage(card, i18n?.lang ?? "en")`. Default undefined → all existing call sites unchanged. Tests: overlay hit vs EN fallback; image derivation per lang.

## Stage C — render wiring + UX gate (depends on B)

C1. **Display-language switcher** — a small header/settings control listing the supported langs; sets `Profile.displayLanguage` via the profile action; on change, `loadI18n(lang)` (lazy). en-only users never fetch an overlay. (Pre-extract non-component exports per repo rule.)

C2. **Wire render path** — the corpus selectors / card-row builders that call `hydrateCard` read `displayLanguage` + `useI18nRuntime` and pass the `i18n` arg. en (or overlay not loaded) behaves exactly as today.

C3. **holo-card onError reconciliation** — a localized image may 404 where EN exists. onError order: if the failing src is a localized url and differs from the baked EN `imageUrl`, swap to EN (`e.currentTarget.src = imageUrl; onerror=null`); only if EN also fails (or there is no image) fall through to the existing identity empty-state. Must stay loop-safe. Update holo-card tests.

C4. **Selector gate (the bug fix)** — `Stack.language` options + the display-language switcher offer ONLY supported langs. `seed-data.ts` restricts generated `language` to the supported set (currently weights ja/zh). Existing stacks with unsupported language render EN. Tests: gating + seed restriction.

## Stage D — integration + ship

- Build overlays against the local mirror; upload to local R2 (`--local`); restart wrangler (clear cache); verify `/corpus-i18n/fr` serves + a fr name renders in preview.
- Full typecheck + lint + test sweep.
- Commit per stage; push; update PR #30. Final merge per standing autonomous approval once fully green and visually confirmed.

## Acceptance (1b done)
- Switching display language to fr shows French card names + French images where they exist (EN image fallback otherwise), no flashes.
- The language selector and `Stack.language` offer only en/fr/de/es/it/pt; picking a supported non-en language no longer silently shows English.
- en-only users fetch zero overlays; base blob + query engine unchanged.
