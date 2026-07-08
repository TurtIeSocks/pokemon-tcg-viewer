-- Site i18n: per-user UI-chrome language, independent of display_language
-- (card content language). Additive column on profiles; ISO 639-1, defaults to
-- 'en' so existing rows read back as 'en' (matches rowToProfile's backfill in
-- supabase-row.ts). Mirrors the display_language / display_currency pattern.
alter table public.profiles
  add column ui_language text not null default 'en';
