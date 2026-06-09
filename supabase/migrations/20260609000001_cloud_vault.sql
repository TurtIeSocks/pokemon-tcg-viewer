-- Cloud Vault foundation — stacks, binders, profiles + RLS.
-- Mirrors the local IndexedDB schema (src/store/userland/types.ts). Client-minted
-- uuidv7 is the PK; user_id is stamped by `default auth.uid()`; RLS is the entire
-- security boundary. card_id is plain text (the card corpus lives outside Postgres).

-- Shared trigger: bump updated_at on every UPDATE (server-authoritative clock).
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── stacks ───────────────────────────────────────────────────────────────────
create table public.stacks (
  id           uuid primary key,                                   -- client-minted uuidv7
  user_id      uuid not null default auth.uid()
                 references auth.users(id) on delete cascade,
  card_id      text not null,                                      -- corpus id; NOT an FK
  quantity     integer not null default 1 check (quantity >= 1),
  language     text not null default 'en',                         -- distinguishes physical copies of a card_id
  acquired_at  timestamptz not null,                               -- user-set
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),                 -- trigger-bumped
  deleted_at   timestamptz,                                        -- tombstone; reserved for sync (sub-project B)
  label             text,
  price_paid        integer,                                       -- minor units (cents); null = unknown
  currency          text not null default 'USD',
  variant           text,
  notes             text,
  condition         text check (condition in ('NM','LP','MP','HP','DMG')),
  grading_company   text,
  grading_grade     numeric(3,1),
  grading_cert      text,                                          -- slab cert/serial; independent of grade
  source            text,
  storage_location  text,
  is_primary        boolean not null default false,
  constraint stacks_grading_pair
    check ((grading_company is null) = (grading_grade is null))    -- both or neither; cert optional within graded
);

alter table public.stacks enable row level security;

create policy stacks_owner on public.stacks
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create index stacks_user_id_idx on public.stacks (user_id);

create trigger stacks_set_updated_at
  before update on public.stacks
  for each row execute function public.set_updated_at();

-- ── binders ──────────────────────────────────────────────────────────────────
create table public.binders (
  id           uuid primary key,
  user_id      uuid not null default auth.uid()
                 references auth.users(id) on delete cascade,
  name         text not null,
  description  text,
  rules            jsonb not null default '[]',
  include_card_ids text[] not null default '{}',
  exclude_card_ids text[] not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

alter table public.binders enable row level security;

create policy binders_owner on public.binders
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create index binders_user_id_idx on public.binders (user_id);

create trigger binders_set_updated_at
  before update on public.binders
  for each row execute function public.set_updated_at();

-- ── profiles ─────────────────────────────────────────────────────────────────
-- id IS the auth uid (no separate user_id column). Upsert-on-save from the app.
create table public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  display_name    text not null default 'Collector',
  bio             text,
  avatar_preset   text not null default 'dusk',
  favorite_set_id text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

alter table public.profiles enable row level security;

create policy profiles_owner on public.profiles
  for all
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();
