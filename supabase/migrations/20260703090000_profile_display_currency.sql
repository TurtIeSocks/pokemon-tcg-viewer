-- PR3a — multi-currency: per-user display/portfolio currency.
-- Additive column on profiles; ISO 4217, defaults to USD so existing rows read
-- back as 'USD' (matches rowToProfile's backfill in supabase-row.ts).
alter table public.profiles
  add column display_currency text not null default 'USD';
