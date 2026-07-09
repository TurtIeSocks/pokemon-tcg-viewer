# Site i18n (UI chrome) — Design

**Date:** 2026-07-08
**Status:** Approved (brainstorming → ready for implementation plan)
**Scope:** Internationalize the *site UI chrome* (nav, buttons, headings, empty states, form labels, toasts, tooltips). The multilingual *card catalog* already exists and is out of scope except as the axis this rides alongside.

## Problem

The app already has rich multilingual **card data** — `profile.displayLanguage`, `?lang=` query param, `ptcg-lang` cookie, region axis (west/asia), TCGdex overlay, 12 supported languages. But the surrounding **UI is 100% hardcoded English**: no i18n library, ~150 user-facing string literals inline across ~67 `.tsx` files. A French or Japanese collector sees English menus around localized cards.

Goal: localize the UI chrome into all 12 catalog languages, without disturbing the card-content language system.

## Decisions (locked during brainstorming)

| Fork | Decision | Rationale |
|---|---|---|
| **Language coupling** | **Separate** `uiLanguage`, independent of card `displayLanguage` | Lets a user run e.g. French chrome while browsing Japanese cards. Costs a second field + selector. |
| **Locale location** | **State + cookie only**, no URL segment | Card `?lang=` stays the content/SEO axis. Zero routing surgery. UI language is personalization, not a URL concern. |
| **Mechanism** | **Paraglide** (inlang), compile-time typesafe | Tree-shakeable, zero runtime lib, typesafe `m.*()`, ICU plurals built in. Fits the codebase's lean, hand-rolled ethos. |
| **v1 language scope** | **All 12** catalog languages | Matches the card catalog's reach: en, fr, de, es, it, pt, ja, ko, zh-tw, zh-cn, th, id. |
| **Translation source** | **Claude-seeded**, tagged machine, reviewed later | Initial 1,650 authored **in-session** by Claude during implementation; `scripts/seed-translations.ts` handles the incremental/CI path for strings added later. |
| **Prerender + first paint** | **Force SSR** on home/series/set | Cookie-only locale can't prerender 12 variants of one path (they'd collide on one output file). Full SSR is the only route to locale-correct first paint. |

## The two-axis model

Two independent language axes that share nothing but the `SUPPORTED_LANGUAGES` list:

- **Axis 1 — Card content language** (exists, untouched): `profile.displayLanguage` + `?lang=` + `ptcg-lang` cookie → corpus region + card-face overlay. The *data* you view.
- **Axis 2 — UI chrome language** (new): `profile.uiLanguage` + `ui-lang` cookie → Paraglide `getLocale()`. The *menus/buttons/labels* around the data.

## Architecture

### Locale resolution & data flow

```
                    profile.uiLanguage  ◄── source of truth (userland store, DB-ready, updatedAt)
                          │  (writes on change)
                          ▼
                    ui-lang cookie      ◄── SSR carrier
                    ┌─────┴─────────────────────────┐
              SERVER (SSR)                     CLIENT
   Paraglide server middleware          getLocale() strategy = cookie (sync read)
   wraps TanStack Start handler:        m.nav_vault() → localized string
     read ui-lang cookie                on uiLanguage change:
       else Accept-Language               persist profile + write cookie
       else baseLocale(en)                + bump localeVersion → tree re-render
     → run render inside                
       AsyncLocalStorage(locale)        
   so getLocale() is per-request        
   <html lang={bcp47(locale)}> dynamic  
```

- **Paraglide compiles** `messages/{locale}.json` → `src/paraglide/` (generated, **gitignored** like `routeTree.gen.ts`). Components call `m.nav_vault()`, `m.owned_count({ count })`.
- **baseLocale = `en`.** Missing keys fall back to English — a safety net, not a load-bearing path (Claude-seed guarantees full coverage; a key-parity test enforces it).
- **Per-request isolation:** without `AsyncLocalStorage`, two concurrent SSR requests in different locales would race on a shared `getLocale()` global. The server middleware scopes locale per request.

### State + persistence

- **New field** `Profile.uiLanguage: string` (ISO 639-1) in `src/store/userland/types.ts`, beside `displayLanguage`. Rides the existing DB-ready Profile machinery (`updatedAt` last-write-wins, tombstone, snapshot) — cloud-sync-ready for free.
- **Default resolution:**
  - Migrating an existing local profile → seed `uiLanguage` from current `displayLanguage` *if UI-supported*, else `"en"`.
  - Fresh anonymous visitor → Accept-Language → `"en"` fallback.
  - **Additive field, safe default** — no destructive migration. Default filled in `normalizeProfile` (live IDB, marker-gated like existing `migrateUserlandData`) and `backup.ts upgrade()` (imports). No snapshot version bump.
- **Cookie:** add `UI_LANG_COOKIE = "ui-lang"` + `writeUiLangCookie()` to `src/lib/loader-region.ts`, mirroring the existing `ptcg-lang` / `writeLangCookie` pattern. Server reads it via a small server fn like the existing `getPreferredRegionFn`.
- **Store action** `setUiLanguage(lang)` on the userland store:
  1. update `profile.uiLanguage` (+ `updatedAt`), await repo persist
  2. `writeUiLangCookie(lang)` — SSR carrier stays in sync
  3. bump `localeVersion` in store → in-place re-render (below)
- **No auth dependency** — userland is local-first; the profile lives in IndexedDB even for logged-out users, so `uiLanguage` persists locally. Cloud sync picks it up when the Supabase adapter lands.
- **Single source of truth** — no separate `ui-lang` store slice; it's one field on the already-loaded Profile.

### SSR + reactivity

- **Server: per-request locale.** Wrap the exported handler in `src/server.ts` (`createStartHandler(defaultStreamHandler)`) with Paraglide's server middleware. Whole render tree runs inside `AsyncLocalStorage(resolvedLocale)`. Strategy chain: `ui-lang` cookie → Accept-Language → `en`.
- **Dynamic `<html lang>`.** `src/routes/__root.tsx` hardcoded `<html lang="en">` → `<html lang={bcp47(getLocale())}>`. A tiny `bcp47()` mapper normalizes internal codes to valid HTML lang tags (`zh-tw → zh-Hant-TW`, `zh-cn → zh-Hans-CN`, rest pass through). ~8 lines.
- **Client: in-place re-localize (no full reload).** Paraglide messages call `getLocale()` internally; a locale change doesn't re-render React by itself (which is why Paraglide's default `setLocale()` hard-reloads). Instead:
  - client `getLocale()` strategy = cookie (synchronous read of `ui-lang`)
  - `setUiLanguage()` writes the cookie + bumps a `localeVersion` counter in the store
  - a `<LocaleBoundary>` at the app root subscribes to `localeVersion` → tree re-renders → every `m.*()` re-reads the cookie → new locale
  - No reload, no remount, component state preserved; synchronous cookie read means no flash.
  - Paraglide's default hard-reload remains the zero-wiring fallback.
- **Prerender → SSR.** `vite.config.ts` prerender filter drops home/series/set → all routes render per-request. TTFB on those 3 moves from static-edge to worker-SSR (acceptable on Cloudflare edge; card/vault/search already SSR). Future perf lever (not v1): edge-cache SSR output keyed on the `ui-lang` cookie (`Vary`).

### String extraction + key conventions

- **The sweep:** ~150 user-facing strings across ~67 files → `messages/en.json` (hand-authored source). Each inline string → one message key; English text moves over verbatim.
- **Key convention** — flat `snake_case`, feature-prefixed (Paraglide flattens to `m.nav_vault()`): `nav_vault`, `nav_scan`, `home_hero_title`, `home_tagline`, `form_price_label`, `stack_condition_unspecified`, `toast_scan_failed`, `binder_print_too_wide`.
- **Interpolation + plurals** — inlang ICU in the source:
  ```json
  "greeting": "Welcome back, {name}",
  "owned_count": "{count, plural, one {# card} other {# cards}}",
  "owned_of_total": "{owned} of {total} owned"
  ```
  Plurals resolve per-locale via CLDR categories (Asian langs collapse to `other`).
- **Number/date/currency formatting:**
  - **In v1:** route locale-sensitive display through `getLocale()` — the ~9 `toLocaleString` calls, calendar month abbreviations, and `Intl.RelativeTimeFormat` ("3 days ago") in `card-database-setting.tsx`. Native `Intl`, SSR-safe.
  - **Out of v1:** `src/store/userland/money.ts` stays deterministic (cents-based, USD-only reserved slot). Localizing currency display belongs with the future currency-picker work.
- **Committed artifacts:** `messages/en.json` (authored) + 11 seeded locale files (committed, human-editable). Only `src/paraglide/` compiled output is gitignored.

### Translation seeding

**Initial batch (v1):** authored **in-session by Claude** during implementation, once `messages/en.json` exists — 11 locales × ~150 keys, applying the glossary + guardrails below directly. No API key needed.

**Incremental / CI path:** `scripts/seed-translations.ts` (Bun, uses existing `@anthropic-ai/sdk`). Reads `messages/en.json`, writes/updates `messages/{locale}.json` — one batched request per locale. Used when `en.json` gains keys later.

**Two-tier glossary (system prompt):**
- **Locked** (never translate): `Vault`, `Binder(s)`, `Stack(s)`, `Cardstack`, `Pokémon`.
- **Localize to official regional term** (do NOT leave English): TCG domain vocab — `Trainer`, `Energy`, category labels — have real official per-locale translations (JP: トレーナー / エネルギー). The prompt maps these per locale.

**Guardrails:**
- **No em-dashes** — brand rule; periods/commas only, every locale.
- **Preserve ICU exactly** — `{placeholders}` and `{count, plural, ...}` untouched; adapt plural categories to the target's CLDR set.

**Metadata:** sidecar `messages/translation-status.json` = `{ fr: "machine", ja: "machine", ... }` at locale granularity. Feeds a future "reviewed" badge; does **not** gate the selector — all 12 stay selectable.

**Idempotent re-runs:** the script fills only *missing* keys by default (never clobbers human-reviewed text); `--force` regenerates all.

**CI safety net:** a `bun test` asserts every locale file's key set exactly equals `en.json` — fails the build on any missing/stale key. This enforces "all 12 complete."

### Selector UI

- **New `UiLanguageControl`** — a select listing all 12 locales by **endonym** (each option in its own language: `日本語`, `Français`, `한국어`), generated via `Intl.DisplayNames` — no hardcoded label table.
- **Placement + confusion risk:** there are now *two* language pickers. Existing `global-language-control.tsx` sets **card** language; this sets **app** language. To prevent conflation:
  - **Canonical home:** Settings page, explicitly labeled **"Interface language"** (vs the card control's "Card language").
  - v1 keeps it to Settings only. Surfacing in the sidebar/account menu later is fine *if* labels stay distinct.

## Component inventory (what gets touched)

| Area | Files | Change |
|---|---|---|
| Message catalogs | `messages/*.json` (new), `messages/translation-status.json` (new) | 12 locale files + status manifest |
| Paraglide config | `project.inlang/` (new), `vite.config.ts` | plugin + compiler config; drop prerender filter |
| Generated | `src/paraglide/` (gitignored) | compiled output |
| Profile schema | `src/store/userland/types.ts`, `normalizeProfile`, `backup.ts` | add `uiLanguage` + default |
| Store action | `src/store/userland/userland-store.ts` | `setUiLanguage()` |
| Cookie helpers | `src/lib/loader-region.ts` | `UI_LANG_COOKIE`, `writeUiLangCookie()` |
| Server | `src/server.ts` | Paraglide server middleware wrap |
| Root | `src/routes/__root.tsx` | dynamic `<html lang>`, `<LocaleBoundary>` |
| BCP-47 mapper | `src/lib/bcp47.ts` (new) | internal code → HTML lang tag |
| Selector | `src/components/settings/…` (new `UiLanguageControl`) | Settings "Interface language" |
| String sweep | ~67 `.tsx` files | inline strings → `m.*()` |
| Formatting | ~9 `toLocaleString` sites, `card-database-setting.tsx` | pass `getLocale()` |
| Seed script | `scripts/seed-translations.ts` (new) | incremental/CI translation |
| Tests | key-parity test (new) | CI enforcement |

## Testing

- **Key-parity test** — every `messages/{locale}.json` key set === `en.json` key set.
- **ICU-preservation test** — placeholder/plural structure identical across locales for interpolated keys.
- **Locale-resolution test** — cookie > Accept-Language > baseLocale precedence; per-request isolation (no cross-request bleed).
- **Store test** — `setUiLanguage()` persists profile + writes cookie; default seeding on migration.
- **No-network guard** — follow the existing corpus pre-seed pattern for any test rendering card grids.

## Risks & mitigations

- **Two-picker confusion** → distinct labels ("Interface language" vs "Card language"), Settings-only in v1.
- **SSR locale bleed** → `AsyncLocalStorage` per request (the core reason for the server middleware).
- **Prerender first-paint in wrong locale** → forced SSR on the 3 affected route groups.
- **Machine-translation quality** → status manifest tracks machine vs reviewed; native review is a per-locale follow-up; brand terms locked, TCG terms use official translations.
- **New strings drifting out of parity** → idempotent seed script + CI key-parity test.

## Phasing (implementation plan will detail)

1. **Pipeline** — Paraglide install/config, `messages/en.json` stub, generated output gitignored, `<html lang>` dynamic, server middleware, `uiLanguage` field + store action + cookie + selector. Ship with `en` only working end-to-end.
2. **String sweep** — extract all ~150 strings to `en.json`, replace inline JSX with `m.*()`, route formatting through `getLocale()`. Parallelizable by area.
3. **Translate** — Claude authors 11 locales in-session; status manifest; key-parity test green.
4. **Seed script + SSR routes** — `scripts/seed-translations.ts` for the incremental path; drop prerender filter; verify locale-correct SSR first paint.

## Out of scope

- URL-based locale / per-locale prerender (rejected: cookie-only).
- Currency/money display localization (tied to future currency-picker work).
- Sidebar/account-menu placement of the selector (Settings-only in v1).
- Native/professional translation review (per-locale follow-up after machine seed).
- RTL languages (none of the 12 are RTL).
