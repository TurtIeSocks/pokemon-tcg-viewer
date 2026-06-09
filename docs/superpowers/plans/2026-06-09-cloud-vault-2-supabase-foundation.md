# Cloud Vault — Plan 2: Supabase cloud foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. **Library APIs move fast** — for any task touching `@supabase/ssr` or `supabase-js`, the implementer MUST verify exact current signatures via context7 (`/supabase/supabase`, `/supabase/ssr`) or the official docs before coding. This plan gives the architecture + the specific functions; it deliberately does not freeze version-specific call shapes.

**Goal:** Sign in (magic link) → the Vault persists in Postgres, RLS-isolated per user; signed-out stays local-first; first sign-in auto-claims the local Vault to the cloud; no env = pure local-first.

**Architecture:** Client-direct Supabase + RLS (mirrors the client-side `idb-repo`). `getRepos()` returns the Supabase bundle when a session exists, else IDB. Cookie-based sessions via `@supabase/ssr` so TanStack Start SSR sees auth. Claim reuses the existing snapshot machinery (`exportAll`→`importAll`).

**Tech Stack:** Supabase (local via Docker/CLI), Postgres + RLS, `@supabase/supabase-js`, `@supabase/ssr`, TanStack Start, Zustand, Bun test.

**Reference:** spec `docs/superpowers/specs/2026-06-09-supabase-cloud-vault-foundation-design.md` (full DDL, decisions, risks). Depends on **Plan 1** (language + grading_cert) already merged into this branch.

**Security (non-negotiable):**
- Only `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` reach the client (anon key is public; RLS is the boundary).
- The **service_role** key must NEVER appear in client code, the bundle, or git. It is not needed for slice A (all access is anon + RLS).
- RLS is the entire security model → the two-user adversarial tests (Task 11) are mandatory, not optional.

---

## File structure

| File | Responsibility |
|---|---|
| `supabase/config.toml` | local stack config — unique `project_id`, shifted ports (coexist with other stacks), magic-link auth |
| `supabase/migrations/0001_cloud_vault.sql` | schema + RLS + triggers + indexes (the spec DDL) |
| `src/lib/supabase/client.ts` | browser client (`createBrowserClient`) + `isCloudEnabled()` |
| `src/lib/supabase/server.ts` | TanStack Start server client (`createServerClient` + cookie adapter) |
| `src/store/userland/supabase-row.ts` | pure row↔domain mappers (the single conversion boundary) |
| `src/store/userland/supabase-repo.ts` | `SupabaseRepo` — the 4 ports via supabase-js |
| `src/store/userland/userland-store.ts` | `getRepos` session swap + `onAuthStateChange` re-hydrate (modify) |
| `src/store/userland/claim.ts` | first-sign-in claim (auto-upload / prompt / profile remap) |
| `src/routes/auth/callback.tsx` | magic-link code exchange route |
| `src/components/auth/*` | sign-in (email→OTP) + sign-out UI |
| `.env.example` | committed local defaults; `.env` (gitignored) gets real values |
| tests | `supabase-row.test.ts` (fast) · `supabase-repo.test.ts` + `rls.test.ts` (integration, local Supabase) · claim tests (fake cloud repo) |

---

## Phase 1 — Local Supabase + schema

### Task 1: Init local stack, coexisting with other Supabase projects

**Files:** Create `supabase/config.toml` (+ scaffolding) via CLI.

- [ ] **Step 1.** In the worktree: `supabase init` (creates `supabase/`).
- [ ] **Step 2.** Edit `supabase/config.toml`: set `project_id = "cardstack-vault"` (unique → unique container names) and **shift every `port` to the 55xxx range** so it never collides with another running stack: `[api] port = 55321`, `[db] port = 55322`, `[studio] port = 55323`, `[inbucket] port = 55324`, `[analytics] port = 55327`, and any `[db.pooler]` / `[realtime]` port present (+1000 from its default). Under `[auth]`: `site_url = "http://localhost:6201"`, add `"http://localhost:6201"` to `additional_redirect_urls`, ensure email OTP/magic-link enabled.
- [ ] **Step 3.** `supabase start`. Verify: `supabase status` shows the 55xxx ports AND the user's other stack is still up (`docker ps` shows both `supabase_db_cardstack-vault` and the other project's containers). If a port is taken, bump it and re-`start`.
- [ ] **Step 4.** Commit `supabase/config.toml` (+ generated scaffolding, minus anything gitignored): `git add supabase/ && git commit -m "chore(supabase): init local stack on 55xxx ports (coexists with other stacks)"`

### Task 2: Schema + RLS migration

**Files:** Create `supabase/migrations/0001_cloud_vault.sql`

- [ ] **Step 1 — write the migration.** Transcribe the spec's DDL verbatim: `set_updated_at()` trigger fn; `stacks` / `binders` / `profiles` tables (snake_case, timestamptz, `price_paid` integer, `language` text default 'en', `grading_company`/`grading_grade`/`grading_cert`, `rules jsonb`, `*_card_ids text[]`); `enable row level security`; `*_owner` policies `using/with check ((select auth.uid()) = user_id)` (profiles: `= id`); `user_id` indexes; `set_updated_at` triggers. Client-minted `uuid` PK (no default). `user_id uuid not null default auth.uid()`.
- [ ] **Step 2 — apply + verify.** `supabase db reset` (re-runs migrations on the local db). Verify via `psql` (port 55322) or a SQL check: all three tables exist, `relrowsecurity = true` for each, each `*_owner` policy present in `pg_policies`.
- [ ] **Step 3 — commit.** `git add supabase/migrations && git commit -m "feat(supabase): cloud vault schema + RLS + triggers (0001)"`

## Phase 2 — Client + auth + SSR

### Task 3: Dependencies

- [ ] **Step 1.** `bun add @supabase/supabase-js @supabase/ssr`.
- [ ] **Step 2.** Commit `package.json` + lockfile: `git commit -m "chore: add @supabase/supabase-js + @supabase/ssr"`.

### Task 4: Clients + cloud-enabled gate

**Files:** Create `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`; `.env.example`; Test `src/lib/supabase/client.test.ts`

- [ ] **Step 1 — VERIFY DOCS.** Confirm current `createBrowserClient` / `createServerClient` signatures + the cookie-adapter shape for a non-Next SSR framework via context7 `/supabase/ssr`. TanStack Start exposes request/response in server context — the cookie adapter reads from the request `Cookie` header and writes `Set-Cookie`.
- [ ] **Step 2 — failing test.** `client.test.ts`: `isCloudEnabled()` is `false` when `VITE_SUPABASE_URL`/`ANON_KEY` are absent, `true` when both set. (Pure env check — stub `import.meta.env`.)
- [ ] **Step 3 — implement.**
  - `client.ts`: `isCloudEnabled(): boolean` (both env vars present); `getBrowserClient()` memoized `createBrowserClient(url, anonKey)`; throws if called when `!isCloudEnabled()`.
  - `server.ts`: `getServerClient(request)` → `createServerClient` with a cookie adapter bound to the TanStack Start request/response.
  - `.env.example`: the local-stack values printed by `supabase start` (`VITE_SUPABASE_URL=http://localhost:55321`, `VITE_SUPABASE_ANON_KEY=<local anon JWT>` — the local demo anon key is a non-secret, safe to commit in the example).
- [ ] **Step 4 — pass + commit.** `bun test src/lib/supabase/client.test.ts`; `git commit -m "feat(supabase): browser/server clients + isCloudEnabled gate"`.

### Task 5: Magic-link auth + callback + UI

**Files:** Create `src/routes/auth/callback.tsx`, `src/components/auth/sign-in.tsx`, sign-out control; Test as feasible (UI smoke).

- [ ] **Step 1 — VERIFY DOCS.** Confirm `signInWithOtp({ email, options: { emailRedirectTo } })`, the magic-link → `exchangeCodeForSession(code)` flow, and `onAuthStateChange` via context7.
- [ ] **Step 2 — implement.**
  - `sign-in.tsx`: email input → `getBrowserClient().auth.signInWithOtp({ email, options: { emailRedirectTo: <origin>/auth/callback } })` → "check your email" state. Rendered only when `isCloudEnabled()`.
  - `callback.tsx` route (`/auth/callback`): on load, `exchangeCodeForSession` from the URL, then redirect to `/vault`. Handle error → friendly message.
  - sign-out control (in the shell/profile menu): `auth.signOut()`.
- [ ] **Step 3 — manual verify.** `supabase start` runs Inbucket (caught mail) on port 55324 — sign in, open the link from Inbucket, confirm session + redirect. (Document in the task; not an automated test.)
- [ ] **Step 4 — commit.** `git commit -m "feat(auth): magic-link sign-in + /auth/callback + sign-out"`.

## Phase 3 — Adapter

### Task 6: Row mappers (pure)

**Files:** Create `src/store/userland/supabase-row.ts`; Test `src/store/userland/supabase-row.test.ts`

- [ ] **Step 1 — failing tests.** For stack/binder/profile, both directions: `rowToStack`/`stackToRow` (+ binder/profile). Assert: camelCase↔snake_case; `ms↔timestamptz` (number ms ↔ ISO string, both ways, round-trip stable); grading `{company,grade,cert}`↔(`grading_company`,`grading_grade`,`grading_cert`) with both-or-neither + cert optional; `rules`↔jsonb; `includeCardIds`/`excludeCardIds`↔`text[]`; `language` passthrough; `pricePaid` integer passthrough; profile id remap is NOT here (it's claim's job — mapper uses the row id as-is). Null discipline preserved.
- [ ] **Step 2 — run FAIL → implement → run PASS.** Pure functions; mirror the centralization style of `money.ts`. `bun test src/store/userland/supabase-row.test.ts`.
- [ ] **Step 3 — commit.** `git commit -m "feat(supabase): row<->domain mappers (pure)"`.

### Task 7: SupabaseRepo

**Files:** Create `src/store/userland/supabase-repo.ts`; Test `src/store/userland/supabase-repo.test.ts` (integration, local Supabase)

- [ ] **Step 1 — VERIFY DOCS.** Confirm supabase-js query builder for insert/select/update/delete + `.select()` return shapes.
- [ ] **Step 2 — failing integration test.** Against local Supabase: sign in a test user (via `auth.signInWithPassword` on a seeded user, or admin-create), then exercise `CollectionRepo` (add/list/bulkAdd/update/remove/removeMany/clear), `BindersRepo`, `ProfileRepo` (upsert-on-save), `BackupRepo` (exportAll/importAll). Assert round-trips via the mapper; `list()` excludes `deleted_at is not null`; `add()` sends client uuidv7 + never `user_id`. Mark this file as the integration lane (needs `supabase start`; guard/skip if not reachable).
- [ ] **Step 3 — implement** the 4 ports over `getBrowserClient()`, delegating all shape conversion to `supabase-row`. Hard-delete in slice A. Profile save = `upsert` on `id`.
- [ ] **Step 4 — run PASS + commit.** `git commit -m "feat(supabase): SupabaseRepo implementing the 4 repo ports"`.

## Phase 4 — Swap + claim

### Task 8: Session swap + re-hydration

**Files:** Modify `src/store/userland/userland-store.ts` (+ `idb-repo.ts` `getRepos` if the factory lives there); Test `userland-store.test.ts`

- [ ] **Step 1 — VERIFY DOCS.** `auth.getSession()` / `onAuthStateChange` event names.
- [ ] **Step 2 — failing test.** With a fake "session present" signal + injected Supabase fake repo, `getRepos()` returns the Supabase bundle; with no session, the IDB bundle. On a simulated auth change, `useUserland` resets and re-hydrates from the now-active repo.
- [ ] **Step 3 — implement.** `getRepos()` (the one swap point) checks `isCloudEnabled() && hasSession()` → Supabase bundle, else IDB. A `subscribeAuth()` wires `onAuthStateChange` → reset `useUserland` + re-run `loadUserland`. Signed-out path unchanged. Keep the `setUserlandRepos`/`usingInjectedRepos` test seam intact.
- [ ] **Step 4 — run PASS + commit.** `git commit -m "feat(userland): getRepos session swap + auth re-hydration"`.

### Task 9: Claim flow

**Files:** Create `src/store/userland/claim.ts`; Test `src/store/userland/claim.test.ts` (fake cloud repo + IDB)

- [ ] **Step 1 — failing tests.** Empty cloud + local has stacks → `exportAll()` local → `importAll(snapshot,"merge")` cloud; ids preserved. Cloud has data + local extras → returns a "prompt" descriptor with the count of local stack ids absent from cloud; dismiss flag (keyed by uid) prevents re-prompt. Profile: local `"me"` fields upserted to cloud keyed by uid (the `"me"` id dropped). Local IDB untouched throughout.
- [ ] **Step 2 — run FAIL → implement → run PASS.** `claimLocalToCloud(localRepos, cloudRepos, uid)` + a `pendingClaimPrompt()` selector; dismiss flag in localStorage `claim-dismissed-<uid>`.
- [ ] **Step 3 — wire** into `subscribeAuth` (run claim on sign-in) — covered by the Task 8 hook.
- [ ] **Step 4 — commit.** `git commit -m "feat(userland): first-sign-in local->cloud claim"`.

## Phase 5 — Config gating + RLS adversarial tests

### Task 10: Cloud-disabled = pure local-first

**Files:** Modify shell/auth entry points; Test a render check.

- [ ] **Step 1 — failing test.** With `isCloudEnabled() === false`: no sign-in UI renders; `getRepos()` always returns IDB; app behaves exactly as today.
- [ ] **Step 2 — implement.** Guard all auth UI + the session swap behind `isCloudEnabled()`. Default (no env) = current behavior, byte-for-byte.
- [ ] **Step 3 — commit.** `git commit -m "feat: gate cloud behind env; no env = pure local-first"`.

### Task 11: RLS adversarial integration tests

**Files:** Create `src/store/userland/rls.test.ts` (integration, local Supabase)

- [ ] **Step 1 — write the adversarial tests.** Create two users (A, B) via local auth admin. As A, insert stacks/binders/profile. As B: `select` returns ZERO of A's rows; `update`/`delete` of A's row ids affect 0 rows; `insert` with `user_id` spoofed to A is rejected by the `with check`. Repeat per table. Anon (no session) sees nothing.
- [ ] **Step 2 — run.** All isolation assertions pass. If ANY of A's data is visible/mutable by B → the policy is wrong; fix the migration before proceeding.
- [ ] **Step 3 — commit.** `git commit -m "test(supabase): RLS adversarial cross-user isolation"`.

## Phase 6 — Verify + finish

### Task 12: Full verification + finish the branch

- [ ] **Step 1 — fast lane:** `bunx tsc -b` (regen `routeTree.gen` first by booting `vite dev` briefly — worktree gotcha); `bun test` (fast lane green); `bunx biome check --config-path=. src`.
- [ ] **Step 2 — integration lane:** with `supabase start` up, run the `supabase-repo` + `rls` integration tests; all green.
- [ ] **Step 3 — preview smoke:** dev server on 6201, sign in via Inbucket link, add a card → confirm it persists in Postgres (Studio on 55323); sign out → local-first intact; sign back in → cloud data returns.
- [ ] **Step 4 — finish.** Invoke `superpowers:finishing-a-development-branch`. This merges **all of sub-project A** (Plan 1 + Plan 2) from `feat/cloud-vault-foundation` into `main`, then removes the worktree + branch. Note for deploy (separate): create a hosted Supabase project, `supabase db push` the migrations, set prod env vars.

---

## Self-review

- **Spec coverage:** architecture/swap ✓(T8) · client-direct+RLS ✓(T2,T7,T11) · SSR session ✓(T4,T5) · schema+RLS+triggers ✓(T2) · magic-link auth ✓(T5) · SupabaseRepo+mapper ✓(T6,T7) · claim ✓(T9) · config no-env=local ✓(T10) · two-lane testing + RLS adversarial ✓(T6 fast, T7/T11 integration) · self-hosting config ✓(T1,T4) · success criteria ✓(T12 smoke). All spec sections mapped.
- **Placeholders:** none — exact files, functions, and test intents per task. Library call-shapes are intentionally deferred to per-task doc-verification (T4/T5/T7/T8 "VERIFY DOCS"), which is correctness practice for version-sensitive integrations, not hand-waving.
- **Type/consistency:** `isCloudEnabled` (T4) gates T5/T8/T10; `supabase-row` mappers (T6) are the sole conversion path used by T7; client-minted `uuidv7` + `user_id default auth.uid()` consistent T2↔T7; hard-delete + `deleted_at is null` filter consistent T2↔T7.
- **Dependency on Plan 1:** schema (T2) + mapper (T6) include `language` + `grading_cert`, which exist in the domain types only after Plan 1 — Plan 1 must be merged into this branch first (it is).
