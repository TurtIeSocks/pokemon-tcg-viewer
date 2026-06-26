-- supabase/migrations/20260619000001_billing.sql
-- Phase C billing. RLS is the boundary. NEITHER subscriptions NOR stripe_customers
-- has any INSERT/UPDATE/DELETE policy → no client write path exists. Only the
-- webhook RPC (service_role, bypasses RLS) writes these rows. Read-own SELECT lets
-- the client render plan + period-end (cosmetic only).
-- reuses public.set_updated_at() from 20260609000001_cloud_vault.sql

-- ── stripe_customers ────────────────────────────────────────────────────────
create table public.stripe_customers (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text not null unique,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
alter table public.stripe_customers enable row level security;
create policy stripe_customers_read_own on public.stripe_customers
  for select using ((select auth.uid()) = user_id);
-- NO write policy. Webhook writes via service_role only.
create trigger stripe_customers_set_updated_at
  before update on public.stripe_customers
  for each row execute function public.set_updated_at();

-- ── subscriptions ───────────────────────────────────────────────────────────
-- PK = the Stripe subscription id. Upsert-on-conflict-id makes the webhook
-- idempotent + convergent against at-least-once, possibly out-of-order delivery.
create table public.subscriptions (
  id                   text primary key,                 -- Stripe subscription id (sub_…)
  user_id              uuid not null references auth.users(id) on delete cascade,
  stripe_customer_id   text not null,
  status               text not null,                    -- active|trialing|past_due|canceled|incomplete|incomplete_expired|unpaid|paused
  plan                 text not null default 'plus',     -- forward-compat tier name (free = absence of an active row)
  price_id             text,                             -- Stripe Price id → maps to tier; multi-tier ready (display only at launch)
  current_period_end   timestamptz not null,             -- written from subscription.items.data[].current_period_end (max)
  cancel_at_period_end boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
alter table public.subscriptions enable row level security;
create index subscriptions_user_id_idx on public.subscriptions (user_id);
create policy subscriptions_read_own on public.subscriptions
  for select using ((select auth.uid()) = user_id);
-- NO write policy. This absence is what makes entitlement unforgeable from the client.
create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- ── stripe_events (idempotency ledger) ──────────────────────────────────────
create table public.stripe_events (
  id           text primary key,                          -- Stripe event id (evt_…)
  type         text not null,
  received_at  timestamptz not null default now()
);
alter table public.stripe_events enable row level security;  -- no policies → service_role only
-- Belt + suspenders: even with RLS (no policy) blocking it, strip any client write
-- grant the permissive baseline handed out. Only service_role writes the ledger.
revoke all on public.stripe_events from anon, authenticated;

-- ── billing config flag (server truth for "is hosted billing on?") ──────────
create table public.billing_config (
  id              boolean primary key default true check (id),  -- single-row guard
  billing_enabled boolean not null default false
);
insert into public.billing_config (id, billing_enabled) values (true, false);
alter table public.billing_config enable row level security;
create policy billing_config_read on public.billing_config
  for select using (true);   -- world-readable: client needs it to render CTAs
-- No write policy. The hosted deploy flips it via a service_role seed.
-- Belt + suspenders: clients read the flag but can never write it (RLS blocks
-- writes too, but strip the grant the permissive baseline handed out).
revoke all on public.billing_config from anon, authenticated;
grant select on public.billing_config to anon, authenticated;

-- ── explicit table grants (R14): no write grant ever exists ─────────────────
revoke all on public.subscriptions    from anon, authenticated;
revoke all on public.stripe_customers from anon, authenticated;
grant select on public.subscriptions    to authenticated;
grant select on public.stripe_customers to authenticated;
-- stripe_events: no grants at all (service_role only).

-- ── entitlement helpers ─────────────────────────────────────────────────────
-- Is hosted billing even configured? Default-ALLOW everything when not.
create or replace function public.billing_on()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select billing_enabled from public.billing_config where id = true), false);
$$;

-- Entitlement. R4: trust STATUS for active/trialing (no period-end check → no renewal-blip
-- lockout of a healthy paying customer). past_due honored only within a 7-day dunning margin.
create or replace function public.is_pro(uid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select
    (not public.billing_on())
    or exists (
      select 1 from public.subscriptions s
      where s.user_id = uid
        and (
          s.status in ('active', 'trialing')                              -- trust Stripe status; no period gate
          or (s.status = 'past_due'                                       -- dunning grace, bounded
              and s.current_period_end > now() - interval '7 days')
        )
    );
$$;

-- R8: keep is_pro(uuid) + billing_on() server-internal — revoked from clients so no
-- one can probe an ARBITRARY uid's pay status. (A SECURITY DEFINER function still
-- runs its OWN body as the owner, so is_pro_self() below can call them even though
-- the calling role can't.)
revoke all on function public.billing_on()  from public, anon, authenticated;
revoke all on function public.is_pro(uuid)  from public, anon, authenticated;

-- Self-only entitlement check for use INSIDE policies. SECURITY DEFINER so its body
-- runs as the owner (can call the revoked is_pro); auth.uid() still reads the CALLER's
-- jwt. Safe to grant to authenticated: it reveals only your own status (which you can
-- already read from your own subscriptions row) — never an arbitrary uid's.
-- NOTE: a policy that calls a function evaluates it as the CALLING role, which must
-- therefore hold EXECUTE — that is why this is granted while is_pro(uuid) is not.
create or replace function public.is_pro_self()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_pro((select auth.uid()));
$$;
revoke all on function public.is_pro_self() from public, anon;
grant execute on function public.is_pro_self() to authenticated;

-- ── per-command policies: read + edit + delete are owner-only (a lapsed user keeps
--    full control of EXISTING rows); only INSERT (net-new state) requires entitlement.
--    WITH CHECK on UPDATE would otherwise re-gate every edit, locking lapsed users
--    out of their own data — so UPDATE is deliberately NOT entitlement-gated.
drop policy stacks_owner on public.stacks;
create policy stacks_select on public.stacks
  for select using ((select auth.uid()) = user_id);
create policy stacks_insert on public.stacks
  for insert with check (
    (select auth.uid()) = user_id
    and (select public.is_pro_self())                          -- net-new requires entitlement (or billing off)
  );
create policy stacks_update on public.stacks
  for update using ((select auth.uid()) = user_id)             -- owner edits/soft-deletes existing rows, lapsed or not
  with check ((select auth.uid()) = user_id);
create policy stacks_delete on public.stacks
  for delete using ((select auth.uid()) = user_id);

drop policy binders_owner on public.binders;
create policy binders_select on public.binders
  for select using ((select auth.uid()) = user_id);
create policy binders_insert on public.binders
  for insert with check (
    (select auth.uid()) = user_id
    and (select public.is_pro_self())
  );
create policy binders_update on public.binders
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy binders_delete on public.binders
  for delete using ((select auth.uid()) = user_id);

-- ── atomic webhook apply RPC (service_role only) ────────────────────────────
-- R2: ledger + entitlement upsert in ONE transaction. The ledger is a dup optimization;
-- the upsert idempotency on the sub-id PK is the correctness boundary.
create or replace function public.process_stripe_event(
  p_event_id text, p_event_type text, p_payload jsonb
) returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.stripe_events (id, type) values (p_event_id, p_event_type);
  -- unique_violation below short-circuits the whole txn → nothing partial commits.

  if (p_payload ? 'customer') then
    insert into public.stripe_customers (user_id, stripe_customer_id)
    values ((p_payload->>'user_id')::uuid, p_payload->>'customer')
    on conflict (user_id) do update set stripe_customer_id = excluded.stripe_customer_id,
                                        updated_at = now();
  end if;

  if (p_payload ? 'subscription_id') then
    insert into public.subscriptions
      (id, user_id, stripe_customer_id, status, plan, price_id, current_period_end, cancel_at_period_end)
    values (
      p_payload->>'subscription_id', (p_payload->>'user_id')::uuid, p_payload->>'customer',
      p_payload->>'status', coalesce(p_payload->>'plan','plus'), p_payload->>'price_id',
      (p_payload->>'current_period_end')::timestamptz, coalesce((p_payload->>'cancel_at_period_end')::boolean, false))
    on conflict (id) do update set
      status = excluded.status, plan = excluded.plan, price_id = excluded.price_id,
      current_period_end = excluded.current_period_end,
      cancel_at_period_end = excluded.cancel_at_period_end, updated_at = now();
  end if;
exception
  when unique_violation then return;  -- event already processed → no-op, caller returns 200
end;
$$;
revoke all on function public.process_stripe_event(text, text, jsonb) from public, anon, authenticated;
-- The webhook calls this as service_role; grant it explicitly so the revoke-from-public
-- above can't strip the only caller's execute right. Never granted to anon/authenticated.
grant execute on function public.process_stripe_event(text, text, jsonb) to service_role;
