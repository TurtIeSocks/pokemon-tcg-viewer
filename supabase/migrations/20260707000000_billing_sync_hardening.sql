-- supabase/migrations/20260707000000_billing_sync_hardening.sql
-- Sync pulls filter on (user_id via RLS, updated_at > watermark), but only a
-- single-column user_id index existed (20260609000001_cloud_vault.sql:50,78) —
-- every incremental pull forced a filter/sort step after the index scan.
-- Composite (user_id, updated_at) indexes let the planner satisfy the pull
-- query — equality on user_id, range on updated_at — in one index scan.
-- profiles has no user_id column (id IS the auth uid; see
-- 20260609000001_cloud_vault.sql:85), so its composite key is (id, updated_at).

create index stacks_user_updated_idx on public.stacks (user_id, updated_at);
create index binders_user_updated_idx on public.binders (user_id, updated_at);
create index profiles_id_updated_idx on public.profiles (id, updated_at);

-- ── process_stripe_event: narrow the dedupe exception scope ────────────────
-- Prior version (20260619000001_billing.sql:159-188) wrapped the ENTIRE
-- function body in a single exception handler, so a unique_violation from
-- EITHER the stripe_customers upsert (stripe_customer_id uniqueness conflict)
-- OR the subscriptions upsert would be swallowed identically to a true
-- duplicate stripe_events.id — silently no-op'ing a real data conflict instead
-- of surfacing it. Only the stripe_events ledger insert is a legitimate
-- "already processed this event" signal; scope the catch to just that insert.
create or replace function public.process_stripe_event(
  p_event_id text, p_event_type text, p_payload jsonb
) returns void language plpgsql security definer set search_path = '' as $$
begin
  begin
    insert into public.stripe_events (id, type) values (p_event_id, p_event_type);
  exception
    when unique_violation then return;  -- event already processed → no-op, caller returns 200
    -- `return` inside this nested block exits process_stripe_event entirely
    -- (plpgsql RETURN always returns from the enclosing function, not just
    -- the block) — nothing below runs and nothing further commits.
  end;

  -- Deleted-user webhook poison: `deleteAccount` (card-stack-cloud src/account.ts)
  -- cancels Stripe subs THEN deletes the auth.users row, but Stripe's own
  -- webhook retries (up to ~3 days) can still deliver a late event for that
  -- now-nonexistent user_id after the ledger insert above already recorded it
  -- as new. Without this guard the insert below FK-violates on user_id,
  -- process_stripe_event throws, the webhook 500s, and Stripe retries the
  -- same doomed event for days. 200-ack (return, not raise) instead — the
  -- event is legitimately unactionable, not a transient failure to retry.
  if (p_payload ? 'user_id')
     and not exists (select 1 from auth.users where id = (p_payload->>'user_id')::uuid) then
    return;
  end if;

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
  -- No function-level exception clause: a unique_violation from either upsert
  -- above now PROPAGATES (webhook 500s → Stripe retries → operator sees it),
  -- instead of being masked as a false "duplicate event" no-op.
end;
$$;
revoke all on function public.process_stripe_event(text, text, jsonb) from public, anon, authenticated;
-- The webhook calls this as service_role; grant it explicitly so the revoke-from-public
-- above can't strip the only caller's execute right. Never granted to anon/authenticated.
grant execute on function public.process_stripe_event(text, text, jsonb) to service_role;
