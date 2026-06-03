# Search match-mode toggle: Fuzzy (default) vs Exact

**Date:** 2026-06-02
**Status:** Design — awaiting approval

## Problem

Name search is typo-tolerant. Searching `Brock's Rhydon` returns the real card **plus**
`Brock's Rhyhorn` ×2, because the matcher's tier-3 edit-distance pass treats `rhydon`→`rhyhorn`
as a near-miss (Damerau-Levenshtein distance ≤ 2). Great for casual discovery, bad for a
**binder rule**: a rule whose query text is `Brock's Rhydon` silently pulls Rhyhorn copies into
the binder's dynamic membership.

Give users a toggle: **Fuzzy** (default, current behavior) or **Exact** (drop the typo
tolerance). The toggle applies to the live search page **and** is captured into binder rules so
membership is reproducible.

## What "Exact" means (key decision)

`matchName` ([fuzzy.ts](../../../src/store/corpus/fuzzy.ts)) matches in 4 tiers:

| tier | kind | example for query `rhydon` |
|------|------|----------------------------|
| 0 | exact (whole normalized name ===) | `Rhydon` |
| 1 | prefix | `Rhydon ex` |
| 2 | substring (`includes`) | `Brock's Rhydon` |
| 3 | edit-distance fuzzy (≤1 or ≤2) | `Brock's Rhyhorn` |

**Exact mode disables tier 3 only.** Tiers 0–2 still match. So:

- `Brock's Rhydon` (exact) → only `Brock's Rhydon`. Rhyhorn drops. ✅ solves the report.
- `Rhydon` (exact) → still finds `Brock's Rhydon` (substring). Typing part of a name still works.

This is "less fuzzy" (no typo tolerance), **not** "whole-name-only." Whole-name-only (tier-0)
was rejected: it would force users to type the full exact name incl. punctuation/spacing, which is
hostile and not what the report asks for.

## Data model

One boolean, named **`exact`**, threaded through the existing query pipeline. Default `false`
(= fuzzy = today's behavior). Chosen over `fuzzy: true` so the **non-default** value is the one
that appears in URLs/storage — clean URLs for the common case, and additive/back-compatible for
stored binder rules (absent ⇒ `false` ⇒ fuzzy, preserving existing rule membership exactly).

### Pipeline (two consumers, one matcher)

```
                                    ┌─ buildCorpusQuery ─→ CorpusQuery ─┐
  URL params ─ validateListSearch ─→ ListSearch                        ├─→ queryCorpus ─→ matchName(…, exact)
  (?exact=true)                     └─ toSerializedQuery ─→ SerializedQuery (stored in BinderRule)
                                                              └─ toCorpusQuery ─→ CorpusQuery ┘
```

Both the live grid and binder-rule evaluation already converge on `queryCorpus` → `matchName`.
Adding `exact` to that one matcher, plus carrying it through both query-builders, covers every
surface. No new evaluation path.

## Changes (file by file)

**Engine**
- `fuzzy.ts` — `matchName(q, name, tokens, exact = false)`. After the tier-2 `includes` check:
  `if (exact) return null;` (skip the edit-distance block). Default param keeps all existing
  callers/tests unchanged.
- `corpus-engine.ts` — `CorpusQuery` gains `exact?: boolean`. `queryCorpus` passes
  `q.exact ?? false` into `matchName`. (Sort logic unchanged — exact just yields fewer hits.)

**Live-search query**
- `card-query.ts` — `ListSearch` gains `exact: boolean`. `buildCorpusQuery` puts `exact: s.exact`
  on each returned `CorpusQuery`.
- `list-search.ts` — `LIST_SEARCH_DEFAULTS.exact = false`; `validateListSearch` reads
  `search.exact === true || search.exact === "true"`; `listSearchToUrl` emits
  `exact: s.exact ? "true" : undefined` (so default-false is stripped from the URL).

**Binder-rule query (persistence)**
- `types.ts` — `SerializedQuery` gains `exact: boolean`.
- `serialized-query.ts` — `toSerializedQuery` sets `exact: search.exact`. `isRuleCapturable`
  **unchanged** — `exact` alone is not a membership constraint (exact + no text/filters still
  matches nothing useful).
- `binder-progress.ts` — `toCorpusQuery` maps `exact: q.exact === true` (defensive: old stored
  rules lack the key ⇒ `false` ⇒ fuzzy; membership unchanged on upgrade).
- `binder-rule-label.ts` — in the text branch, label `"…" (exact)` when `q.exact && q.text`.
  (Only annotate when text is present; `exact` has no visible effect without a name query.)

**UI**
- New island `match-mode-toggle.tsx` — mirrors the existing `ViewModeToggle` pill pattern
  (Liquid Glass, fieldset + two `aria-pressed` buttons): **Fuzzy | Exact**.
- `search-controls.tsx` — render `<MatchModeToggle value={value.exact} onChange={(exact) =>
  onChange({ exact })} />` on the search-input row (input grows, toggle right-aligned; wraps on
  mobile). Always enabled — no-op without a query, so no need to disable.

The three route sites (`search.tsx`, `$series/$set/index.tsx`, `pokemon/$name.tsx`) and
`CardGridIsland` need **no change**: they pass `value={search}` / call `buildCorpusQuery(search,
…)`, so they inherit the field automatically. `BulkAddMenu` already receives
`ruleQuery={toSerializedQuery(search, …)}`, so captured rules inherit `exact` for free.

## Back-compat / persistence

- **No schema-version bump, no migration.** `exact` is additive. `isValidSnapshot` checks only
  ids/`schemaVersion`, so old backups and old shared snapshots import fine; missing `exact`
  reads as `false` (fuzzy) at `toCorpusQuery`. Existing binders keep identical membership.
- New writes (`toSerializedQuery`) always include `exact`, honoring the codebase's "every key
  present" convention going forward.

## Testing (TDD)

- `fuzzy.test.ts` — `matchName(q,…, exact=true)` returns tiers 0–2, returns `null` for a tier-3
  case that fuzzy would match (`rhydon` vs `rhyhorn`).
- `corpus-engine.test.ts` — `queryCorpus` with `exact:true` excludes fuzzy-only hits (the
  Rhydon/Rhyhorn scenario end-to-end); with `exact:false`/absent, unchanged.
- `list-search.test.ts` — `exact` validate (string `"true"`→`true`, default `false`) + URL
  round-trip + default stripped.
- `card-query.test.ts` (if present) — `buildCorpusQuery` carries `exact` in all three branches.
- `serialized-query.test.ts` — `toSerializedQuery` includes `exact`; `isRuleCapturable` still
  ignores it.
- `binder-progress.test.ts` — `toCorpusQuery` maps `exact`; legacy rule (no key) ⇒ fuzzy.
- `binder-rule-label.test.ts` — `(exact)` suffix appears only with `exact && text`.
- `match-mode-toggle` + `search-controls` — toggle renders, `aria-pressed` reflects value,
  `onChange({ exact })` fires (browser-provider test).

## Out of scope (YAGNI)

- Per-tier configurability or an edit-distance slider — one binary toggle only.
- Changing fuzzy thresholds or the default — Fuzzy stays the default; behavior unchanged unless
  the user opts into Exact.
- Retroactively flagging/altering existing binder rules — they stay fuzzy.

## Assumptions (delegate-mode judgement calls — please confirm or correct)

1. **"Exact" = disable tier-3 edit-distance only; substring/prefix/exact still match.** Not
   whole-name-only. (Primary product decision — see "What Exact means".)
2. **Default stays Fuzzy** for every surface, including newly captured binder rules. The toggle
   is opt-in.
3. **Stored field name `exact: boolean` (default false)**, surfaced in URLs as `?exact=true`.
4. **UI:** a Fuzzy|Exact pill toggle (mirrors `ViewModeToggle`) inside `SearchControls`, shown on
   **every** page that renders search (global search, set, dex). Always enabled.
5. **Binder rule label** shows a `(exact)` suffix on the quoted text so exact rules are
   distinguishable in the binder detail view.
6. **No migration / no `schemaVersion` bump**; legacy data reads as fuzzy.
