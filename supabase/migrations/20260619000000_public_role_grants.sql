-- supabase/migrations/20260619000000_public_role_grants.sql
--
-- Compat shim. The local Supabase postgres image sets *postgres-role* default
-- privileges on public tables that omit DML (only Dxtm = TRUNCATE/REFERENCES/
-- TRIGGER/MAINTAIN — no INSERT/SELECT/UPDATE/DELETE). Migrations run as `postgres`,
-- so every table a migration creates inherits that broken default and is locked to
-- anon/authenticated/service_role until grants are restored — which silently breaks
-- ALL cloud access (stacks/binders/profiles + billing).
--
-- This re-establishes the standard Supabase model: permissive table grants, with
-- RLS as the real boundary. Runs after the cloud_vault tables (grants them) and
-- before the billing migration (whose explicit REVOKEs then re-harden the
-- entitlement tables). Idempotent; a harmless no-op on a correctly-initialised
-- (e.g. hosted) project where these grants already exist.

grant all on all tables in schema public to anon, authenticated, service_role;
-- Fix the postgres-role default so tables created by LATER migrations (e.g. billing)
-- inherit the same permissive grants automatically.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
