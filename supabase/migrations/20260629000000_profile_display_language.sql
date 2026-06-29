-- Phase 1b — multilingual catalog: per-user catalog render language.
-- Additive column on profiles; ISO 639-1, defaults to English so existing rows
-- read back as 'en' (matches rowToProfile's backfill in supabase-row.ts).
alter table public.profiles
  add column display_language text not null default 'en';
