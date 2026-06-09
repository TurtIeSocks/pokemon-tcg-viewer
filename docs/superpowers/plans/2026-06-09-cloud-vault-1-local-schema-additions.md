# Cloud Vault — Plan 1: Local schema additions (`language` + `grading_cert`)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `language` (text, default `'en'`) and a graded-card cert number (`CardGrading.cert` → cloud `grading_cert`) to the local Vault schema, so local matches the v1 cloud schema before the Supabase adapter lands.

**Architecture:** Same pattern as the 2026-06-08 cents change, but simpler — these are **idempotent default backfills**, so `normalizeStack` handles them on read with **no marker migration**. Snapshot bumps v4→v5. `language` joins the stack identity/dedup key (different language = different physical card); the graded **cert** also joins it (each slab is unique). Boundaries: forms + CSV are the user-facing edges.

**Tech Stack:** TypeScript, Zustand, idb-keyval, TanStack Form, Zod, Papa Parse, Bun test (happy-dom + fake-indexeddb), Biome.

**Reference:** spec `docs/superpowers/specs/2026-06-09-supabase-cloud-vault-foundation-design.md` → "Local schema additions" section. Prior art to mirror: the cents change in `git show` of the `schema/db-ready-prep` merge.

**Conventions (from CLAUDE.md):** optional fields are `null` never `undefined`; tests must pre-seed corpus / not hit network; manual memo is intentional; lint via `bunx biome check --write <files> --config-path=.`; typecheck `bunx tsc -b`; tests `bun test`.

---

## File structure

| File | Change |
|---|---|
| `src/store/userland/types.ts` | `Stack.language: string`; `CardGrading.cert: string \| null`; `EditableStackFields += "language"`; `UserDataSnapshot.schemaVersion: 5` |
| `src/store/userland/idb-repo.ts` | `fillStack` (default `language`, normalize grading cert); `normalizeStack` (idempotent backfill of both) |
| `src/store/userland/backup.ts` | `upgrade()` → v5 (backfill language/cert); `SUPPORTED_VERSIONS` add `5` |
| `src/store/userland/userland-store.ts` | `stackIdentityKey` + `DedupeFields` include `language` + grading `cert` |
| `src/store/userland/csv.ts` | `CSV_COLUMNS` + `ALIASES` + `rowValues` + `rowToNewStack`: `language`, `grading_cert` |
| `src/components/collection/stack-form-schema.ts` | `StackFormValues += language, gradingCert`; zod fields |
| `src/components/collection/stack-form-mapping.ts` | `itemToForm` / `formToPatch` / `formFieldToPatch`: language + cert |
| `src/components/collection/stack-edit-form.tsx` | `language` `<select>` (default EN) + cert `<input>` in the graded branch |
| `src/test-utils.tsx` | `makeStack` defaults `language: 'en'`; grading fixtures get `cert: null` |
| various `*.test.ts(x)` | add `language: 'en'` / `cert: null` to inline `Stack`/`CardGrading` fixtures |

---

## Task 1: Types

**Files:** Modify `src/store/userland/types.ts`

- [ ] **Step 1 — failing test.** In `src/store/userland/types.test.ts` (create if absent) add a compile-level test asserting the shapes: a `Stack` literal requires `language: string`; a `CardGrading` literal requires `cert: string | null`. (A `satisfies`-based test or a `makeStack`-consuming test that fails to typecheck without the field.) Simplest: rely on Task 7's fixtures + `tsc` as the failing signal — note that here and proceed.
- [ ] **Step 2 — implement.**
  - `CardGrading` gains `cert: string | null; // slab cert/serial; null = unrecorded`.
  - `Stack` gains `language: string; // ISO 639-1, default 'en'; distinguishes physical copies of a cardId` (place near `variant`).
  - `EditableStackFields`: add `| "language"`.
  - `NewStack`: unchanged (language flows via `Partial<EditableStackFields>`).
  - `UserDataSnapshot.schemaVersion: 5`; update the envelope doc comment (v5 = language + grading cert).
- [ ] **Step 3 — typecheck.** `bunx tsc -b` → expect errors ONLY in fixtures that build `Stack`/`CardGrading` without the new fields (addressed in later tasks). Confirm `types.ts` itself is clean.
- [ ] **Step 4 — commit.** `git add src/store/userland/types.ts && git commit -m "feat(userland): add Stack.language + CardGrading.cert to types (snapshot v5)"`

## Task 2: Repo fill + normalize

**Files:** Modify `src/store/userland/idb-repo.ts`; Test `src/store/userland/idb-repo.test.ts`

- [ ] **Step 1 — failing test.** Add to `idb-repo.test.ts`:
  - `add({cardId})` → `language === "en"`.
  - `add({cardId, language: "ja"})` → `language === "ja"`.
  - `add({cardId, grading: {company:"PSA", grade:10, cert:"123"}})` round-trips cert.
  - Extend the existing `normalizeStack` legacy test: a legacy row (cast `as unknown as Stack`) missing `language` → `"en"`; a legacy grading `{company,grade}` (no cert) → `cert === null`; assert **idempotent** (normalize twice = same).
- [ ] **Step 2 — run, expect FAIL.** `bun test src/store/userland/idb-repo.test.ts`
- [ ] **Step 3 — implement.**
  - `fillStack`: `language: input.language ?? "en"`; `grading: input.grading ? { ...input.grading, cert: input.grading.cert ?? null } : null`.
  - `normalizeStack`: add `language: raw.language ?? "en"` and `grading: raw.grading ? { ...raw.grading, cert: raw.grading.cert ?? null } : null`. (Both idempotent — only fill absent values.)
- [ ] **Step 4 — run, expect PASS.** `bun test src/store/userland/idb-repo.test.ts`
- [ ] **Step 5 — commit.** `git add -A && git commit -m "feat(userland): fill/normalize language + grading cert in idb-repo"`

## Task 3: Backup upgrade → v5

**Files:** Modify `src/store/userland/backup.ts`; Test `src/store/userland/backup.test.ts`

- [ ] **Step 1 — failing test.** In `backup.test.ts`: a v4 snapshot (no language) → `parseSnapshot` yields `schemaVersion: 5`, `collection[0].language === "en"`, graded item `cert === null`; a v5 snapshot passes through (language preserved). Update the `good` fixture → v5 with `language: "en"` + grading cert where present. `isValidSnapshot` accepts 1–5, rejects 6.
- [ ] **Step 2 — run, expect FAIL.** `bun test src/store/userland/backup.test.ts`
- [ ] **Step 3 — implement.** `SUPPORTED_VERSIONS` add `5`. `upgrade()`: backfill `language: typeof c.language === "string" ? c.language : "en"`; normalize grading to include `cert ?? null`. Output `schemaVersion: 5`. `upgradeProfile` unchanged.
- [ ] **Step 4 — run, expect PASS.**
- [ ] **Step 5 — commit.** `git add -A && git commit -m "feat(userland): backup upgrade to snapshot v5 (language + grading cert)"`

## Task 4: Identity / dedup key

**Files:** Modify `src/store/userland/userland-store.ts`; Test `src/store/userland/userland-store.test.ts`

- [ ] **Step 1 — failing test.** Two stacks identical except `language` ("en" vs "ja") must NOT merge on `importStacks(merge=true)` / `mergeDuplicateStacks`. Two graded stacks with different `grading.cert` must NOT merge. Same language + same cert (or both null) → merge as before.
- [ ] **Step 2 — run, expect FAIL.**
- [ ] **Step 3 — implement.** `DedupeFields`: add `"language"` (grading already present). `stackIdentityKey`: append `f.language` and the grading cert (extend the grading segment to `${company}/${grade}/${cert ?? ""}`).
- [ ] **Step 4 — run, expect PASS.**
- [ ] **Step 5 — commit.** `git add -A && git commit -m "feat(userland): language + grading cert in stack identity key"`

## Task 5: CSV columns

**Files:** Modify `src/store/userland/csv.ts`; Test `src/store/userland/csv.test.ts`

- [ ] **Step 1 — failing test.** Export includes `language` + `grading_cert` columns (header matches `CSV_COLUMNS`). `rowToNewStack({language:"ja"})` → `language:"ja"`; missing → `"en"`. `detectColumns(["Language"])` maps to `language`. A graded row with a cert imports `grading.cert`.
- [ ] **Step 2 — run, expect FAIL.**
- [ ] **Step 3 — implement.**
  - `CSV_COLUMNS`: add `"language"` (after `variant`) and `"grading_cert"` (after `grading_grade`).
  - `ALIASES`: `language: ["language","lang"]`, `grading_cert: ["grading_cert","cert","certification","cert_number","serial"]`.
  - `rowValues`: `language: s.language`, `grading_cert: s.grading?.cert ?? ""`.
  - `rowToNewStack`: `language: row.language?.trim() || "en"`; build grading with `cert: row.grading_cert?.trim() || null`.
- [ ] **Step 4 — run, expect PASS.** Update the round-trip test fixture via the `stack()` helper.
- [ ] **Step 5 — commit.** `git add -A && git commit -m "feat(userland): language + grading_cert CSV columns"`

## Task 6: Form fields

**Files:** Modify `stack-form-schema.ts`, `stack-form-mapping.ts`, `stack-edit-form.tsx`; Test `stack-form-mapping.test.ts`

- [ ] **Step 1 — failing test.** In `stack-form-mapping.test.ts`: `itemToForm(stack({language:"ja"}))` → `f.language === "ja"`; `itemToForm` of a graded stack with cert → `f.gradingCert` set. `formToPatch({...base, language:"de"})` → `language:"de"`. `formFieldToPatch("language","fr")` → `{language:"fr"}`. `formFieldToPatch("gradingCert", ...)` folds into the grading object alongside company/grade.
- [ ] **Step 2 — run, expect FAIL.**
- [ ] **Step 3 — implement.**
  - `stack-form-schema.ts`: `StackFormValues += language: z.string()`, `gradingCert: z.string()`. Export a `LANGUAGES` const (`["en","ja","zh","fr","de","it","es","pt","ko"]` — extend later).
  - `stack-form-mapping.ts`: `itemToForm` → `language: i.language ?? "en"`, `gradingCert: i.grading?.cert ?? ""`. `formToPatch`/`formFieldToPatch`: include `language`; build grading with `cert: gradingCert.trim() || null` (thread `gradingCert` through the grading `ctx` like company/grade). Keep `formToPatch` returning `Omit<EditableStackFields,"currency">` (currency still form-less) — add `language` to its output.
  - `stack-edit-form.tsx`: a `language` `<select>` (default `"en"`, options from `LANGUAGES`) in the main fields; a `gradingCert` text `<input>` inside the graded branch next to company/grade. Follow the existing TanStack-Form render-prop field pattern.
- [ ] **Step 4 — run, expect PASS.** `bun test src/components/collection/stack-form-mapping.test.tsx`
- [ ] **Step 5 — commit.** `git add -A && git commit -m "feat(collection): language select + grading cert field in stack form"`

## Task 7: Fixtures + full-suite fallout

**Files:** Modify `src/test-utils.tsx`; sweep inline fixtures in `csv.test.ts`, `backup.test.ts`, `idb-repo.test.ts`, `stack-form-mapping.test.ts`, `share.test.ts`, `stack-row.test.tsx`, any other file constructing a full `Stack` or `CardGrading` literal.

- [ ] **Step 1 — find them.** `grep -rln "pricePaid:" src --include="*.test.ts*"` (the cents change touched the same set — those inline `Stack` literals now need `language`). Also `grep -rln "grade:" src` for `CardGrading` literals needing `cert`.
- [ ] **Step 2 — implement.** `test-utils.tsx` `makeStack`: add `language: "en"`. Each inline `Stack` fixture: add `language: "en"`. Each `CardGrading` literal (`{company, grade}`): add `cert: null`.
- [ ] **Step 3 — typecheck + full suite.** Run in parallel: `bunx tsc -b`; `bun test`. Expected: tsc clean; suite green (no NEW failures vs the known-green baseline).
- [ ] **Step 4 — lint.** `bunx biome check --write --config-path=. <all touched files>`.
- [ ] **Step 5 — commit.** `git add -A && git commit -m "test: backfill language + grading cert in stack fixtures"`

## Task 8: Verify + finish

- [ ] **Step 1 — full verification (parallel):** `bunx tsc -b` · `bun test` · `bunx biome check --config-path=. src`. All clean/green.
- [ ] **Step 2 — manual smoke (preview):** add a card, set language=JA + a PSA cert, confirm it renders + persists across reload; export CSV and confirm the two new columns; re-import and confirm round-trip. (Per the preview verification workflow.)
- [ ] **Step 3 — finish the branch increment.** Leave on `feat/cloud-vault-foundation` (Plan 2 continues here). Do NOT merge to main yet — Plan 2 (Supabase) builds on this; merge the whole sub-project A when both plans land. (Or, if you want this shippable alone, cut a `schema/language-cert` branch + merge — decide at execution.)

---

## What comes next (Plan 2 — separate doc, after Plan 1 lands)

Supabase cloud foundation, detailed against current `@supabase/ssr` + `supabase-js` docs: project init + `supabase/migrations` (the spec's DDL, RLS, triggers) → client/auth/SSR + `/auth/callback` + sign-in UI → `SupabaseRepo` + `supabase-row` mapper → `getRepos()` swap + re-hydration + claim flow → config gating (no-env=local) + RLS adversarial tests.

## Self-review

- **Spec coverage (Local schema additions section):** types ✓(T1) · fill/normalize ✓(T2) · backup v5 ✓(T3) · identity key ✓(T4) · CSV ✓(T5) · form ✓(T6) · test-utils ✓(T7). All mapped.
- **Placeholders:** none — each task names exact files + signatures + test intents. (Code bodies intentionally left to TDD per CLAUDE.md, not placeholders.)
- **Type consistency:** `language: string` / `CardGrading.cert: string | null` used identically across T1–T7; `gradingCert` (form string) ↔ `grading.cert` (domain `string|null`) mapped in T6; snapshot literal `5` consistent T1/T3.
