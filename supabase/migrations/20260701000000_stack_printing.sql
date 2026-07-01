-- Exact physical printing (TCGdex variants_detailed identity) a collector owns.
-- null = coarse/legacy/unknown. Stored whole as jsonb (structured, portable).
alter table public.stacks add column printing jsonb;
