# Supabase Cloud Vault — Foundation (Sub-project A)

**Date:** 2026-06-09 · **Branch:** `feat/cloud-vault-foundation`
**Status:** design approved; ready for implementation plan.

## Context

The Vault (collection + Binders) is local-first and DB-ready after the
[2026-06-08 schema prep](2026-06-08-db-ready-schema-prep-plan.md) (UUIDv7 ids,
cents money, `updatedAt` + `deletedAt` tombstones, snapshot v4). Now we add the
cloud backend.

"The Supabase backend" decomposes into three independent sub-projects, built in
order:

- **A — Cloud Vault foundation (this spec).** Supabase project + Postgres
  schema/RLS + Auth + a `SupabaseRepo` implementing the existing repo ports +
  `getRepos()` swap by session + a one-time local→cloud "claim" reusing the
  snapshot machinery. Outcome: sign in → Vault lives in Postgres.
- **B — Multi-device sync.** Bidirectional offline-first reconciliation (what
  `updatedAt` LWW + `deletedAt` tombstones were added for). Deferred.
- **C — Billing / licensing.** The private `@tcgvault/cloud` plugin, paid-tier
  gating, Stripe. Deferred.

## Goal

When signed out, the app is exactly today's local-first Vault. When signed in
(magic link), the Vault persists in Postgres, isolated per user by RLS. A
local-first user who signs up has their data auto-claimed to the cloud. A
self-hoster with two env vars + the migrations gets the full cloud Vault on their
own Supabase. With no env set, the app is pure local-first with zero backend.

## Locked decisions

| Decision | Choice | Rationale |
|---|---|---|
| Auth method | **Magic link** (passwordless email) | No passwords, no OAuth setup; OAuth drops in later. |
| Data access | **Client-direct + RLS** | Mirrors the client-side `idb-repo`; RLS is the security boundary; least code, realtime-ready. |
| Claim flow | **Auto-claim, cloud-as-truth** | Empty cloud → silent upload; cloud has data → one-time import prompt. Smooth continuity, defers real sync to B. |
| Dev env | **Local Supabase (Docker)** | Docker + `supabase` CLI already installed; migrations as code; link a hosted project at deploy. |
| Open-core boundary | **`SupabaseRepo` + auth + schema in the AGPL core**, config-driven | Self-hosters point at their own Supabase; hosted instance = same code + default config + (later) the private billing layer. |
| v1 stack columns | **+`language`, +`grading_cert`** | `language` = the research report's #1 gap (JP/ZH cards = different physical cards of the same `cardId`); `grading_cert` = slab provenance. Both are columns → cheap now, costly to retrofit. |
| Offline while signed-in | **Online-only in A** | Local cache + write queue is B. |

## Architecture

- **The swap.** `getRepos()` (the existing single swap point) returns the
  Supabase repo bundle when a session exists, else the IDB bundle. Repo ports are
  already all-async, so the network adapter is a drop-in — **no port changes**.
- **Client-direct + RLS.** `SupabaseRepo` calls `supabase-js` from the browser,
  like `idb-repo`. RLS (`(select auth.uid()) = user_id`) is the entire security
  boundary. No server functions for CRUD.
- **SSR session.** TanStack Start renders server-side, so the session must exist
  on both sides → `@supabase/ssr` with **cookie-based** sessions (not
  localStorage). A `/auth/callback` route exchanges the magic-link code for a
  session. This is the one genuinely fiddly integration point.
- **Re-hydration.** `supabase.auth.onAuthStateChange` → on sign-in / sign-out /
  token-refresh, reset `useUserland` and re-run `loadUserland`, which reads from
  the newly-active repo.

### Where code lives (all AGPL core)

- `src/lib/supabase/` — browser + server client factories, session helpers.
- `src/store/userland/supabase-repo.ts` — the adapter (4 ports).
- `src/store/userland/supabase-row.ts` — the row↔domain mapper (the single
  boundary for camel/snake, ms↔timestamptz, grading flatten, etc.), with pure
  unit tests.
- `supabase/migrations/*.sql` — schema, RLS, triggers (versioned, in-repo).
- `src/routes/auth/*` — `/auth/callback` + minimal sign-in UI.
- Config via `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (public).

## Database schema + RLS

snake_case, `timestamptz`, cents `integer`, `jsonb` rules, `text[]` card-id
arrays, flattened grading. Three tables. Client-minted `uuidv7` is the PK (same
id locally and in cloud, so claim-upload preserves ids — no DB extension needed).

```sql
-- shared trigger: bump updated_at on UPDATE
create or replace function public.set_updated_at() returns trigger
  language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;

create table public.stacks (
  id           uuid primary key,                    -- client-minted uuidv7
  user_id      uuid not null default auth.uid()
                 references auth.users(id) on delete cascade,
  card_id      text not null,                       -- corpus id; NOT an FK (corpus is external/edge)
  quantity     integer not null default 1 check (quantity >= 1),
  language     text not null default 'en',          -- en/ja/zh/... distinguishes physical copies of a cardId
  acquired_at  timestamptz not null,                -- user-set
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),  -- trigger-bumped
  deleted_at   timestamptz,                         -- tombstone; reserved for Sub-project B
  label text, price_paid integer, currency text not null default 'USD',
  variant text, notes text,
  condition text check (condition in ('NM','LP','MP','HP','DMG')),
  grading_company text, grading_grade numeric(3,1), grading_cert text,
  source text, storage_location text,
  is_primary boolean not null default false,
  check ((grading_company is null) = (grading_grade is null))  -- both or neither; cert independently optional
);
alter table public.stacks enable row level security;
create policy stacks_owner on public.stacks for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create index stacks_user_id_idx on public.stacks (user_id);
create trigger stacks_set_updated_at before update on public.stacks
  for each row execute function public.set_updated_at();

create table public.binders (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  description text,
  rules jsonb not null default '[]',
  include_card_ids text[] not null default '{}',
  exclude_card_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table public.binders enable row level security;
create policy binders_owner on public.binders for all
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create index binders_user_id_idx on public.binders (user_id);
create trigger binders_set_updated_at before update on public.binders
  for each row execute function public.set_updated_at();

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,  -- id IS the uid
  display_name text not null default 'Collector',
  bio text,
  avatar_preset text not null default 'dusk',
  favorite_set_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table public.profiles enable row level security;
create policy profiles_owner on public.profiles for all
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
```

Notes:
- `user_id default auth.uid()` — client never sends it; DB stamps it, RLS `with
  check` enforces it.
- Timestamps DB-owned (`now()` + trigger), except user-editable `acquired_at`.
  Server-authoritative clocks help B; local IDB keeps minting its own (different
  backend).
- Delete in slice A = **hard delete** (`DELETE`). `deleted_at` stays null until B
  turns on soft-delete + tombstone propagation. `list()` still filters
  `deleted_at is null` (forward-prep, harmless now).
- Profiles **upsert-on-save** (`insert ... on conflict (id) do update`), matching
  the local `ProfileRepo` — no signup trigger needed.

## Auth + session

- `signInWithOtp({ email })` → magic link. `/auth/callback` route calls
  `exchangeCodeForSession`, sets cookies, redirects to the Vault.
- `@supabase/ssr`: `createBrowserClient` (client) + `createServerClient` (TanStack
  Start server, reads/writes the session cookie) so SSR sees the session.
- UI: an email input → "check your email" state; a sign-out button. That is the
  whole auth surface for A.

## SupabaseRepo + row-mapper + swap

- `SupabaseRepo` implements `CollectionRepo` / `BindersRepo` / `BackupRepo` /
  `ProfileRepo` via `supabase-js`, same method shapes as `idb-repo`.
- `supabase-row.ts` is the single conversion boundary: camelCase↔snake_case,
  ms-epoch↔timestamptz, `grading {company,grade,cert}`↔three flat columns,
  `rules`↔jsonb, card-id arrays↔`text[]`, `language` passthrough. Pure, unit-tested.
- `add()` mints the same `uuidv7` and sends it as the row id; never sends
  `user_id`. `list()` filters `deleted_at is null`.
- `getRepos()` returns Supabase when a session exists, else IDB.
- Auth listener resets `useUserland` + re-runs `loadUserland` on auth changes.

## Claim flow (auto, cloud-as-truth)

On sign-in the auth listener checks the cloud Vault:
- **Cloud empty** → `localBackup.exportAll()` → `cloudBackup.importAll(snapshot,
  "merge")`. uuidv7 ids carry over; row-mapper writes Postgres rows; DB stamps
  `user_id`. Hydrate from cloud. Fires once (cloud stops being empty).
- **Cloud has data + local has extras** (local stack ids not present in cloud) →
  one-time prompt "You have N local cards not in your cloud Vault — import them?",
  guarded by a per-account dismiss flag (localStorage, keyed by uid). Yes →
  merge-upload; No → leave local untouched.
- **Profile id remap:** local profile id is `"me"`; cloud profile id *is* the
  uid. Claim upserts the local profile *fields* keyed by `auth.uid()`, dropping
  `"me"`. Stacks/binders need no remap.
- Local IDB is never deleted; sign-out returns to it.

## Config / self-hosting

- `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (public; anon key safe — RLS
  protects).
- **Unset → cloud disabled**: no auth UI, app is today's local-first Vault.
- **Set → cloud available**: auth UI appears; `getRepos()` may return Supabase.
- Self-host: create a Supabase project, run `supabase/migrations/*.sql`
  (`supabase db push`), set the two vars. Documented in the README.

## Local schema additions (pre-adapter, this branch)

`language` + `grading_cert` are added to the **local** schema first so local and
cloud stay aligned (same logic as the cents change, done while pre-adapter):
- `types.ts`: `Stack.language: string`, `CardGrading.cert: string | null`;
  `EditableStackFields += language`.
- `idb-repo.ts`: `fillStack` defaults `language: 'en'`; grading carries `cert`.
  `normalizeStack` backfills `language ?? 'en'` and `grading.cert ?? null` —
  **idempotent**, so NO marker migration (unlike dollars→cents).
- `backup.ts`: `upgrade()` targets snapshot **v5** (backfills language/cert);
  `SUPPORTED_VERSIONS` adds 5.
- `stackIdentityKey` / `DedupeFields`: include `language` (different language =
  different physical card) and `grading_cert`.
- `csv.ts`: add `language` (+ `grading_cert`) columns; `language` aliases map the
  competitor "language" column. Export/import passthrough.
- Stack form: a `language` select (default EN) and a cert input within the graded
  branch.
- `test-utils.tsx`: `makeStack` defaults `language: 'en'`, grading cert null.

## Testing

- **Fast lane (Bun, no network):** `supabase-row` mapper unit tests; claim-flow
  logic against a *fake* cloud repo + local IDB; all existing fake-repo store /
  selector tests keep passing (repo-agnostic). The local-schema-addition tests
  (language/cert in fill/normalize/csv/dedup/backup).
- **Integration lane (local Supabase, on-demand/CI):** `SupabaseRepo` CRUD
  round-trips against real Postgres; **RLS adversarial tests** — sign in as user A
  and user B, assert A cannot read or write B's rows. `supabase start` in CI; not
  run on every save.

## Success criteria

- Signed-out = today's local-first Vault, unchanged.
- Magic-link sign-in → Vault persists in Postgres, RLS-isolated.
- Local-first user signs up → data auto-claims to cloud, ids preserved.
- Self-hoster: 2 env vars + migrations → full cloud Vault on their instance.
- No env → pure local-first, zero backend.

## Out of scope (A)

Offline-while-signed-in; multi-device sync / conflict resolution / tombstone
propagation / realtime (**B**); billing / paid gating / `@tcgvault/cloud` (**C**);
OAuth / password / anonymous auth; wishlist / trade / household / sealed products
(future additive tables); images / object storage; price connectors.

## Risks / open questions

- **RLS correctness is the whole security model** — adversarial two-user tests are
  mandatory, not optional. A missing/loose policy = cross-user data leak.
- **`@supabase/ssr` + TanStack Start** cookie/session wiring is the fiddliest
  integration; budget time for the callback + server-client setup.
- **Magic-link deliverability** in dev — local Supabase uses Inbucket (caught
  mail); production needs SMTP configured.
- **Clock authority** for `updated_at` — DB-owned here; B must decide the
  authoritative clock for cross-device LWW (local IDB mints its own).
- **`language` against an English corpus** — the tag records ownership of a
  non-English copy; the rendered art stays English until a multilingual corpus
  (TCGdex) is adopted. Acceptable for v1; noted for a future catalog upgrade.
