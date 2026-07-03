-- PR3b — valuation: per-user hide-all-monetary-surfaces toggle.
-- Additive boolean on profiles; defaults false so existing rows read back false.
alter table public.profiles
  add column hide_value boolean not null default false;
