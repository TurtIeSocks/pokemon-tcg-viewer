# Phase C — Hosted Billing & Entitlements (Stripe + open-core)

**Status:** Final design (delegate-mode; owner reviews the Assumptions section, §11)
**Date:** 2026-06-19
**Predecessors:** Sub-project A (cloud foundation, SHIPPED) · Sub-project B (multi-device sync, SHIPPED)
**Locked references:** `docs/superpowers/specs/2026-06-09-supabase-cloud-vault-foundation-design.md`, `supabase/migrations/20260609000001_cloud_vault.sql`

> **This is the FINAL doc** — every critical/high finding from adversarial review is folded in, and the medium/low fixes worth taking are folded in too. Where two findings implied different remedies, §0 records the decisive resolution and the rest of the doc is consistent with it.

---

## 0. Resolutions of adversarial findings (decisions, not options)

Read this first — it governs the rest of the doc.

| # | Finding (severity) | Decision |
|---|---|---|
| R2 | Webhook ledger-insert + entitlement-upsert are **non-atomic** separate REST calls → a crash between them permanently drops a paid entitlement (critical + low) | **One `process_stripe_event(event_id, type, payload jsonb)` `SECURITY DEFINER` RPC** does ledger-insert + `subscriptions`/`stripe_customers` upsert in a single Postgres transaction. The ledger is a dup-optimization; the **upsert idempotency on the Stripe-sub-id PK is the correctness boundary**. (§4.4) |
| R3 | Pinned Stripe API version (`2025-09-30.clover`) **removed `current_period_end` from the top-level Subscription** → `sub.current_period_end` is `undefined` → every paid user written with a broken period end → `is_pro=false` → **revenue path dead** (critical) | Read the period end from **`subscription.items.data[].current_period_end`** (max across items). Derive `plan`/`price_id` from `sub.items.data[0].price.id`. CI fixture at the pinned version asserts a non-null `current_period_end` is written. (§4.4) |
| R4 | `is_pro` gates on `current_period_end > now()`; at renewal a healthy `active` sub can briefly carry a stale period end → **paying customer locked out**. `past_due` grace is actually the full multi-week dunning window, not a "blip" (high + medium + medium) | `is_pro` **trusts `status='active'`/`'trialing'` without a period-end check**. Only `past_due`/expiring states are period-gated, with a **7-day grace margin** (`current_period_end > now() - interval '7 days'`). Documented as bounded generosity, not a blip. (§5) |
| R5 | Refunds/chargebacks unhandled → fraudster keeps cloud sync for the period (high) | Handle `charge.dispute.created` and full `charge.refunded` → set `status='unpaid'` (which `is_pro` already excludes) → **immediate downgrade to free (no sync), data retained**. (§4.4) |
| R6 | Static-string `await import("@tcgvault/cloud")` is **resolved at build time** by Vite/Rollup → breaks "core builds without plugin" (high) | Make the specifier **non-statically-analyzable** (`/* @vite-ignore */` + runtime-computed specifier) AND add the package to **`ssr.external`** so the server bundle never inlines it. The **build-without-plugin CI job is a BLOCKING gate**. (§4.4, §6) |
| R7 | Leak guard is a substring scan defeated by minification (`stripe.webhooks`, `@tcgvault/cloud` get mangled/tree-shaken) (medium + high) | Keep the env-var-name markers (those literals survive). Make the **primary** SDK-leak defense the **dependency-graph check**: the build-without-plugin job + scanning Vite's `manifest.json` module ids for `stripe`/`@tcgvault/cloud`. Add minify-surviving value-shape regexes (`sk_live_`, `sk_test_`, `whsec_`, service_role JWT shape). `stripe.webhooks` is best-effort only. (§6) |
| R8 | `is_pro(uuid)` granted to `authenticated` lets any user probe **who-pays** (high) | **REVOKE `is_pro(uuid)`/`billing_on()` from anon/authenticated/public entirely.** Policy evaluation calls them as the function owner regardless of caller grant. Provide a zero-arg `is_pro_self()` if a client variant is ever needed. (§5) |
| R10 | `ensureCustomer` race creates duplicate Stripe customers (medium) | `stripe.customers.create({ ... }, { idempotencyKey: \`cust_${uid}\` })`. (§4.2) |
| R12 | Lost-webhook = paid user stuck on free with no self-heal (medium) | **`/api/stripe/sync` reconciliation endpoint** the client hits on `?upgraded=1`; server-side `stripe.subscriptions.list({customer})` → same `process_stripe_event` path. (§4.2, §4.4) |
| R13 | Multi-tier "entitlement" is only display-deep; RLS enforces binary paid/free (low) | **Acknowledge:** server-enforced tier *differentiation* is deferred with Pro. Forward seam: `is_tier(uid, min_tier)` reading `price_id`→rank, for future per-feature policies. Free-vs-Plus (binary `is_pro`) is the only enforced gate at launch. (§2, §11) |
| R14 | Explicit table grants missing on new tables (low) | `revoke all ... from anon; grant select ... to authenticated` on `subscriptions`/`stripe_customers`; no write grant at all. (§3) |
| R15 | `getEntitlement` fail-open could be misused as a gate by a future implementer (low) | Code comment + invariant note + fail-open test: **render-only, never a gate.** (§6) |
| R16 | Self-hoster wires Stripe but forgets to flip `billing_enabled` → silently free, no sync gate (low) | **Loud health check** in `@tcgvault/cloud`: `STRIPE_SECRET_KEY` set but `billing_enabled=false` → warn/fail. (§6, §8) |

---

## 1. Goal + the open-core contract restated

**Goal.** Add a hosted paid tier to Cardstack. The *hosted* instance (operated commercially) gives every signed-in user a real, useful free cloud account and charges for hosted multi-device sync + value-add data layers. Billing is Stripe (Checkout + Customer Portal + subscriptions). Entitlement is a server-truth row, enforced by Postgres RLS, written **only** by a verified Stripe webhook (or its reconciliation twin) via `service_role`.

**The open-core contract (binding — every decision is subordinate to these):**

1. **The AGPL core builds and runs 100% local-first with the billing module absent.** No static import edge from core → Stripe, ever. `bun install` + `bun run build` + `tsc -b` succeed with no `@tcgvault/cloud` plugin present — **proven by a blocking CI job**, not asserted.
2. **Self-hosters who bring their own Supabase get FULL cloud sync, unbilled.** The entitlement gate *default-allows* when billing is not configured. A self-hosted instance with an empty `subscriptions` table syncs everything, no gate.
3. **Only the hosted instance charges.** Billing lives in a private `@tcgvault/cloud` package + thin core stub routes. Core *reads* an entitlement (a row under RLS); it never imports Stripe, never holds a Stripe secret.
4. **RLS is the security boundary.** A plan flag the client can set is cosmetic. Entitlement is enforced server-side in Postgres, fed only by verified Stripe webhooks via `service_role`. The client is never trusted.
5. **Secrets are server-only.** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` live only in the Nitro server env. Never `VITE_`-prefixed, never imported by a client-reachable module. `scripts/check-client-bundle.ts` is extended to enforce this.
6. **Never paywall the user's own data.** Local use is uncapped. CSV export is always on. The full local-first Vault is free forever, and hosted multi-device sync is the paid value-add — not a wall around data the user already has locally.

---

## 2. Pricing & tiers

**Boundary: hosted multi-device sync IS the paid feature; the full local-first app + self-hosting are the free/open guarantees.** This stays honest open-core: the AGPL code does everything, self-hosters (`billing_on()`=false → `is_pro` default-true) get full unbilled sync; we charge only to *host* it. The hosted free tier is a real signed-in account — local Vault uncapped, CSV export always on — but syncs **0 stacks and 0 binders** until you subscribe. Signing in adds nothing on its own; Plus unlocks unlimited multi-device sync.

**Why a 0 free-cap.** 0 is the only safe floor — caps can only ever be raised later (no migration, no takeback), never lowered. There is no numeric cap to meter or enforce: the write gate is the pure binary `is_pro` check (§5).

**Ship two tiers; reserve a third.** Schema models N tiers from day one (`plan` + `price_id`); we ship Free + Plus and reserve Pro.

| | **Free** (hosted, signed-in) | **Plus** — **$4/mo or $36/yr** | *(reserved)* **Pro** — $9/mo or $84/yr |
|---|---|---|---|
| Local Vault (offline) | Uncapped, all features | Uncapped | Uncapped |
| Multi-device sync | **No** | **Yes** (unlimited) | Yes (unlimited) |
| CSV import / **export** | Always on | Always on | Always on |
| Profile / snapshot sharing | Yes | Yes | Yes |
| Plus badge | — | Yes | Yes |
| *(reserved value-add)* image/scan backup, full price history, valuation analytics, alerts, multi-currency, API | — | — | Yes |

**Server-enforced tier differentiation is binary at launch (R13).** The only server-side gate is `is_pro` (free vs paid). `plan`/`price_id` are recorded for display + forward-compat, but Pro's per-feature differences (image backup, etc.) are *not* RLS-enforced yet — when Pro ships, introduce `is_tier(uid, min_tier text)` (reads `price_id`→rank) for the new per-feature policies/triggers. We do **not** overclaim multi-tier enforcement.

**Price-point justification.** **Plus at $4/mo, $36/yr (25% off, ≈$3/mo).** Sits in the proven collector willingness-to-pay band — Collectr PRO $4.99/mo, TCG Collector Premium $3.33–3.99/mo, Obsidian Sync $4/mo annual. A single dominant paid tier maximizes conversion; the annual discount is the conversion lever. **No time-boxed trial** — the entire local-first app is the free trial; you pay only to sync across devices. (A Stripe free-trial remains a future lever, not built now.)

**Launch the Plus value prop on SCALE only** (unlimited multi-device sync). Price-history/valuation/alert props depend on a price-data connector *not yet in the repo* (Phase 4 roadmap) — do not sell a tier on data we cannot yet supply. Those become Pro when the connector ships.

**Lifecycle policy:**
- **Grandfather price.** Keep legacy Stripe Price objects active on a bump so existing subs are not re-rated.
- **Cancellation = retain + read-only, never delete.** On lapse, existing synced data keeps reading + exporting; a lapsed (formerly-paid) user can still edit/soft-delete their existing rows; only *new* writes are gated (free = no sync). CSV export stays on. Hard-delete only after a long dormancy window (~12 months inactive + emailed warnings) to bound storage cost — never as a cancellation penalty. Because the Vault is local-first, a canceling user loses *nothing* locally.

---

## 3. Data model

New migration `supabase/migrations/20260619000001_billing.sql`, in the exact style of `20260609000001_cloud_vault.sql` (reuses `public.set_updated_at()`, RLS enabled, owner SELECT wrapped in `(select auth.uid())`, `on delete cascade` to `auth.users`).

Four new tables (`stripe_customers`, `subscriptions`, `stripe_events`, `billing_config`) + the entitlement helpers + policy split (§5). No row-cap machinery — the free tier syncs 0 rows, so the write gate is the pure binary `is_pro` check.

```sql
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

-- ── explicit table grants (R14): no write grant ever exists ─────────────────
revoke all on public.subscriptions    from anon, authenticated;
revoke all on public.stripe_customers from anon, authenticated;
grant select on public.subscriptions    to authenticated;
grant select on public.stripe_customers to authenticated;
-- stripe_events: no grants at all (service_role only).
```

**`profiles` changes: none.** Entitlement is intentionally a *separate* write-policy-free table, not a `profiles` column — `profiles` is owner-writable (`profiles_owner FOR ALL`), so a plan flag there would be client-forgeable. Keeping entitlement in a write-policy-free table is the whole point.

The entitlement helpers and policy split live in this same migration; their SQL is in §5 (kept together for review).

---

## 4. Stripe flow

All Stripe code lives in `@tcgvault/cloud` (private). Core has thin dynamic-import stub routes (§6). Stripe Node SDK **v19+**, **API version pinned** in the client constructor. **Critical (R3):** at the pinned version, period boundaries live on subscription *items*, not the top-level Subscription — read accordingly everywhere below.

### 4.1 Customer ↔ auth-user mapping (the bridge)

Every later Stripe event must trace back to a Supabase `user_id`. We stamp the uid into Stripe **at Checkout creation, in two places**:
- `client_reference_id = auth.uid()`
- `subscription_data.metadata.user_id = auth.uid()` (rides into every `customer.subscription.*` event's object)

On `checkout.session.completed` the webhook writes the `stripe_customers` link **before** any subscription event is processed. Thereafter the webhook resolves `user_id` via the `stripe_customers` map first, falling back to `subscription.metadata.user_id`.

### 4.2 Checkout (createServerFn in the plugin)

`@tcgvault/cloud` exposes `createCheckoutSession`, invoked from the core billing route through the stub. It runs server-side (Nitro), reads the SSR session via `getServerClient()` for `auth.uid()` + email, then:

```ts
// @tcgvault/cloud — server only
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: PINNED_API_VERSION });

// R10: idempotent customer creation — concurrent checkout starts can't fork two customers.
async function ensureCustomer(uid: string, email: string): Promise<string> {
  const existing = await admin.from("stripe_customers")
    .select("stripe_customer_id").eq("user_id", uid).maybeSingle();
  if (existing.data) return existing.data.stripe_customer_id;
  const c = await stripe.customers.create(
    { email, metadata: { user_id: uid } },
    { idempotencyKey: `cust_${uid}` },           // R10
  );
  return c.id;
}

const customerId = await ensureCustomer(uid, email);
const session = await stripe.checkout.sessions.create({
  mode: "subscription",
  customer: customerId,
  client_reference_id: uid,
  line_items: [{ price: process.env.STRIPE_PRICE_PLUS_MONTHLY, quantity: 1 }], // or annual
  subscription_data: { metadata: { user_id: uid } },
  success_url: `${origin}/vault?upgraded=1`,   // → triggers /api/stripe/sync reconciliation (R12)
  cancel_url: `${origin}/vault?upgrade=cancel`,
  allow_promotion_codes: true,
});
return { url: session.url };
```

Prefer Checkout Sessions over Payment Links (Payment Links can't reliably round-trip `client_reference_id` + per-user metadata).

### 4.3 Customer Portal

`@tcgvault/cloud` exposes `createPortalSession`:

```ts
const portal = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: `${origin}/vault` });
return { url: portal.url };
```

All cancel / plan-change / card-update flows go through the hosted Stripe Portal — no custom subscription-management UI. The Portal emits the same `customer.subscription.*` webhooks, so entitlement updates flow through one code path.

### 4.4 Webhook (TanStack Start server route, raw body, atomic RPC)

**Lives as a server route, not `createServerFn`** — `createServerFn` re-serializes the body and breaks the HMAC. Prod is Node/Nitro, so synchronous `stripe.webhooks.constructEvent` works.

Core stub: `src/routes/api/stripe/webhook.ts`

```ts
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/stripe/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // R6: non-statically-analyzable specifier so the bundler never resolves it at
        // build time. Also listed in ssr.external. catch → 501 when the plugin is absent.
        const pkg = ["@tcgvault", "cloud"].join("/");
        const mod = await import(/* @vite-ignore */ pkg).catch(() => null);
        if (!mod) return new Response("billing module absent", { status: 501 });
        return mod.handleStripeWebhook(request);
      },
    },
  },
});
```

Plugin handler `handleStripeWebhook(request)`:
1. `const body = await request.text();` **first thing** (byte-exact; never `request.json()`, never a body-parser on this route).
2. `const sig = request.headers.get("stripe-signature");`
3. `const event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);` — throw → `return new Response("bad signature", { status: 400 })`.
4. Build a **service-role** client with plain `@supabase/supabase-js` (NOT `@supabase/ssr`): `createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })`.
5. **Map the event to a normalized payload** (resolve `user_id`, read `current_period_end` from items, derive `plan`/`price_id` from `items.data[0].price.id`).
6. **Atomic apply (R2):** call **one** `process_stripe_event` RPC that inserts the ledger row AND upserts `subscriptions`/`stripe_customers` in a single transaction. On the ledger unique-violation the RPC returns "already processed" and commits nothing new.
7. `return new Response(null, { status: 200 })` on success (incl. already-processed) so Stripe stops retrying. On RPC error → non-200 so Stripe retries (the upsert is idempotent, so a retried full apply is safe).

**Normalization helpers (R3 — period end from items):**

```ts
function periodEndFromSub(sub: Stripe.Subscription): string {
  const ends = sub.items.data.map(i => i.current_period_end).filter(Boolean) as number[];
  const maxEnd = Math.max(...ends);                 // multi-item → latest boundary
  return new Date(maxEnd * 1000).toISOString();     // never reads sub.current_period_end (gone at pinned version)
}
function tierFromSub(sub: Stripe.Subscription) {
  const priceId = sub.items.data[0]?.price.id ?? null;
  return { priceId, plan: PRICE_TO_TIER[priceId ?? ""] ?? "plus" };
}
```

**The atomic RPC (in the migration, called only by service_role):**

```sql
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
-- (service_role bypasses grants as the function owner; no explicit grant to authenticated.)
```

**Events handled (name → normalized action):**

| Event | Action |
|---|---|
| `checkout.session.completed` | Resolve `user_id` from `client_reference_id` (fallback `metadata.user_id`); payload carries `customer` → RPC writes the `stripe_customers` link **before** any subscription event. |
| `customer.subscription.created` / `.updated` | Resolve `user_id` via `stripe_customers` (fallback `sub.metadata.user_id`); `periodEndFromSub` + `tierFromSub`; RPC upserts `subscriptions` on conflict id. Drives renewals, plan changes, `cancel_at_period_end` toggles, `past_due ↔ active`. |
| `customer.subscription.deleted` | Upsert `status='canceled'`. **No row deletion** — entitlement simply evaluates false (data retained, edit/delete-existing still allowed). |
| `invoice.paid` | **Re-fetch the subscription by `sub_…` id** (never trust the relocated/ambiguous `invoice.subscription`); upsert — keeps `current_period_end` fresh at renewal, flips `past_due → active`. |
| `invoice.payment_failed` | **Warn-only.** Do NOT revoke; `past_due` is the grace window; let `subscription.updated` carry the real transition. |
| `charge.dispute.created` (R5) | Resolve the sub via the charge's customer; upsert `status='unpaid'` → `is_pro` drops immediately (fraud cut, data retained). |
| `charge.refunded` (full) (R5) | Same — `status='unpaid'`, immediate downgrade to free (no sync). |

**Reconciliation endpoint (R12) — lost/delayed-webhook self-heal.** Core stub `src/routes/api/stripe/sync.ts` (same dynamic-import pattern) → plugin `reconcileForUser(request)`: reads the SSR session, `stripe.subscriptions.list({ customer })`, normalizes each, and applies via the **same `process_stripe_event` path** (a synthetic event id like `recon_<sub>_<period_end>` keeps it idempotent). The client calls this on the `?upgraded=1` landing so a delayed webhook never strands a paid user. A periodic reconcile job (cron, hosted-only) is a future hardening, noted in DEPLOY.md.

**Idempotency + ordering safeguards (baked in):**
- `stripe_events(id pk)` dedupes at-least-once delivery; the apply is atomic with it (R2).
- `subscriptions` PK = Stripe sub id + `on conflict id` converges out-of-order deliveries (last write by the event's own object).
- Prefer the event's embedded object; re-fetch by id for `invoice.*` and dispute/refund where the subscription isn't inline.

**Local testing:** Stripe CLI `stripe listen --forward-to localhost:6201/api/stripe/webhook` + `stripe trigger …`; **Test Clocks** for renewal/lapse/cancel-at-period-end simulation. CI fixture at the pinned API version asserts a non-null `current_period_end` is written (R3).

---

## 5. Entitlement enforcement (RLS)

The gate is `SECURITY DEFINER` helpers read inside the *write* policies of `stacks`/`binders`. **Read stays ungated** (always read + export your own data); **net-new write is gated** (a free or lapsed user cannot push new state; a lapsed user can still edit/soft-delete existing rows). With a 0 free-cap there is no row-count to enforce — the write gate is the pure binary `is_pro` check.

```sql
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
-- one can probe an ARBITRARY uid's pay status.
revoke all on function public.billing_on()  from public, anon, authenticated;
revoke all on function public.is_pro(uuid)  from public, anon, authenticated;

-- CORRECTION (verified live via RLS tests): a policy that calls a function evaluates it
-- as the CALLING role, which must hold EXECUTE. is_pro(uuid) is revoked, so a policy
-- calling it directly fails ("permission denied for function is_pro"). Use a self-only
-- SECURITY DEFINER wrapper: its body runs as the owner (can call revoked is_pro),
-- auth.uid() still reads the caller's jwt, and it is safe to grant (reveals only the
-- caller's own status, already readable from their subscriptions row).
create or replace function public.is_pro_self()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_pro((select auth.uid()));
$$;
revoke all on function public.is_pro_self() from public, anon;
grant execute on function public.is_pro_self() to authenticated;

-- CORRECTION (verified live): a single FOR-ALL policy with `with check (is_pro)` also
-- gates UPDATE's NEW row, locking a LAPSED user out of editing/soft-deleting their own
-- existing rows (violates the retain-existing rule). Split per command: read/update/
-- delete are owner-only; only INSERT (net-new state) requires entitlement.
drop policy stacks_owner on public.stacks;
create policy stacks_select on public.stacks
  for select using ((select auth.uid()) = user_id);
create policy stacks_insert on public.stacks
  for insert with check (
    (select auth.uid()) = user_id
    and (select public.is_pro_self())                          -- net-new requires entitlement (or billing off)
  );
create policy stacks_update on public.stacks
  for update using ((select auth.uid()) = user_id)             -- lapsed user keeps full control of existing rows
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
```

**Why no row cap.** The hosted free tier syncs 0 stacks and 0 binders, so there is no numeric cap to meter or enforce. The write gate collapses to the binary `is_pro` check above: a free signed-in user's net-new push is rejected outright (until they subscribe), a paid user's is allowed, and a self-hoster (`billing_on()` false) is uncapped. No per-row counting, no statement-level trigger, no claim-exemption flow.

Design notes (mirroring the A migration):
- `SECURITY DEFINER set search_path = ''` is the Supabase-documented way to read sibling tables inside a policy without recursion / search-path hijack.
- `stable` + `(select is_pro(...))` lets the planner evaluate **once per statement**, not per row — the same `(select auth.uid())` trick the A migration uses.
- The gate is **only in `with check`**, never `using`: a lapsed user can still UPDATE/soft-delete already-synced rows (export, tidy up). Only paths that write *new* state require entitlement.
- **Self-host default-allow:** `is_pro` returns true whenever `billing_on()` is false. Full unbilled sync.

### 5.1 Graceful degradation in `sync-engine.ts` (no data loss)

The engine **already** degrades correctly — an RLS rejection is just another push failure (verified against the real code):
- Local writes commit to the per-uid IDB cache and mark the row dirty (`cache-repo.ts`).
- `pushRows()` (sync-engine.ts:101, `client.from(table).upsert(rows).select()`) is the **only** cloud write; it `throw`s on the Postgrest error.
- `clearDirty` runs **only for ids actually pushed** — a rejected push leaves the row dirty, retried next pass. **Zero data loss, identical to offline.** The moment the webhook flips `is_pro` back, the dirty rows push.

**The one refinement (UX, not data) — structured-error mapping:**

1. In `pushRows`, on error inspect the `PostgrestError` by **SQLSTATE**, not message substrings:
   - `code === '42501'` (RLS insufficient-privilege) → `EntitlementError({ kind: 'needs_upgrade' })`.
   - anything else → the existing generic `Error` (offline/error).
2. Add `"needs_upgrade"` to `sync-status.ts` + an `"entitlement-blocked"` transition + `onEntitlementBlocked(kind)`.
3. In `handleSignedIn`'s `onSyncError` and the engine catch, branch: an `EntitlementError` calls `onEntitlementBlocked(kind)` rather than `onSyncError(offline)`. **Never drop dirty rows on this path.**
4. `AccountStatusLine` / `sync-status-display` render the `needs_upgrade` case as an upgrade CTA (§7).

**First-sign-in CLAIM/upload (sub-project A) under the 0 free-cap.** A FREE signed-in user can no longer upload their local Vault: the claim push is a net-new write, `is_pro` is false, so RLS rejects it with `42501` → surfaces as `needs_upgrade`, and the Vault stays local cleanly (dirty rows persist, zero data loss — exactly the degradation path above). The claim/upload runs once they subscribe: the moment `is_pro` flips true, the dirty rows push on the next pass. No special-case code — the standard gated-write path handles it.

No reconciler/cache changes. Dirty rows persist locally and resume pushing automatically once entitlement is restored. **Integration test:** an un-entitled push yields `kind: 'needs_upgrade'` (not `offline`).

---

## 6. Open-core seam

**Package boundary:**

| Lives in **core** (AGPL, this repo) | Lives in **`@tcgvault/cloud`** (private repo) |
|---|---|
| `20260619000001_billing.sql` (tables, RLS, `is_pro`, `process_stripe_event`, read/write policy split) | Stripe SDK + `createCheckoutSession`, `createPortalSession`, `handleStripeWebhook`, `reconcileForUser` |
| `src/lib/billing/entitlement.ts` — `isBillingEnabled()` + `getEntitlement()` (reads the row under RLS) | The `PRICE_TO_TIER` map; all Stripe secrets; the misconfig health check |
| `src/routes/api/stripe/{webhook,checkout,portal,sync}.ts` — thin dynamic-import stubs (→ 501 absent) | The server endpoints those stubs import |
| `/billing` route + Gate UI (upgrade CTA, Plus badge) | — |
| `vite.config` `ssr.external: ['@tcgvault/cloud']` (R6) + extended leak guard | Deployed by hosted CI: dropped into `node_modules` before building |

**Why a separate private repo, not a Bun workspace member:** a workspace member must be present for `bun install`, which would break "core builds without the plugin." The plugin is a separate private repo; **hosted CI installs `@tcgvault/cloud` into `node_modules` before building** (and seeds `billing_config.billing_enabled=true`). The public tree has zero reference to it; the four core stub routes compute the specifier at runtime and `catch → 501`.

**R6 — making "builds without plugin" real, not asserted.** A static-string `import("@tcgvault/cloud")` is resolved by Vite/Rollup at *build* time, which would error/warn plugin-absent. Two changes prevent that: (1) the specifier is **runtime-computed** (`["@tcgvault","cloud"].join("/")` + `/* @vite-ignore */`) so the bundler treats it as external; (2) `@tcgvault/cloud` is in **`ssr.external`** so the server bundle never inlines it. The **build-without-plugin CI job is a BLOCKING merge gate** (`bun run build` + `tsc -b` + leak guard with `node_modules/@tcgvault/cloud` absent, asserting exit 0) — this job *is* the enforcement of contract #1.

**How core reads entitlement WITHOUT importing Stripe.** Entitlement is a **row, not a code call** — read through the existing browser client under RLS:

```ts
// src/lib/billing/entitlement.ts — core, NO Stripe import.
// INVARIANT (R15): this is RENDER-ONLY and fail-open. It MUST NEVER be used as a gate.
// The gate is always the RLS with-check, server-side. Truth is RLS;
// this helper only decides what UI to show.
import { getBrowserClient, isCloudEnabled } from "@/lib/supabase/client";

export type Tier = "free" | "plus" | "pro";
export interface Entitlement { tier: Tier; status: string | null; currentPeriodEnd: string | null; }

/** Cosmetic: is hosted billing configured? Reads billing_config (world-readable). */
export async function isBillingEnabled(): Promise<boolean> {
  if (!isCloudEnabled()) return false;
  const { data } = await getBrowserClient().from("billing_config").select("billing_enabled").maybeSingle();
  return data?.billing_enabled ?? false;
}

/** Read the user's entitlement row (RLS-scoped). FAIL-OPEN: any error → free, never blocks Vault load. */
export async function getEntitlement(): Promise<Entitlement> {
  if (!isCloudEnabled()) return { tier: "free", status: null, currentPeriodEnd: null };
  try {
    const { data } = await getBrowserClient()
      .from("subscriptions")
      .select("status, plan, price_id, current_period_end")
      .in("status", ["active", "trialing", "past_due"])
      .order("current_period_end", { ascending: false })
      .limit(1).maybeSingle();
    // Display heuristic only (mirrors is_pro loosely; the server is the truth):
    const active = data && (["active","trialing"].includes(data.status)
      || (data.status === "past_due" && new Date(data.current_period_end).getTime() > Date.now() - 7*864e5));
    if (!active) return { tier: "free", status: data?.status ?? null, currentPeriodEnd: null };
    return { tier: (data.plan as Tier) ?? "plus", status: data.status, currentPeriodEnd: data.current_period_end };
  } catch {
    return { tier: "free", status: null, currentPeriodEnd: null }; // fail-open: never block loading
  }
}
```

This flag is **cosmetic** — the read-own SELECT lets the client *render* plan/period-end. The client cannot fabricate an active row because no write policy exists.

**No-billing self-host treats everyone as entitled.** Server: `is_pro` true when `billing_on()` false. Client: `isBillingEnabled()` false → no upgrade UI; the whole experience is pre-Phase-C local-first.

**The config flag:** server truth is `public.billing_config.billing_enabled` (default `false`; the hosted deploy flips it via a seeded migration). The hosted deploy also sets the server secrets + `STRIPE_PRICE_*`. No `VITE_BILLING_ENABLED` — billing-on must be server truth so the client can't self-grant; the world-readable `billing_config` row is the client's read of it.

**R16 — misconfig health check.** `@tcgvault/cloud` exposes a startup/health assertion: if `STRIPE_SECRET_KEY` is set but `billing_config.billing_enabled` is `false`, log a loud warning (or fail health). Catches the silently-free hosted deploy and the Stripe-wired-but-ungated self-host. The flip is a **required, verified** DEPLOY.md step with a post-deploy assertion.

**Bundle-leak guard (`scripts/check-client-bundle.ts`) — R7.** Substring scans on minified output give false confidence (`stripe.webhooks`, `@tcgvault/cloud` get mangled/tree-shaken). Layered defense:
- **Primary (structural):** the build-without-plugin CI job — a static import of `@tcgvault/cloud` would fail that build outright. Additionally scan Vite's emitted `manifest.json` module ids for any chunk referencing `stripe` or `@tcgvault/cloud`.
- **Secondary (value-shape regex, survives minification):** `sk_live_`, `sk_test_`, `whsec_`, and the service_role JWT shape (`"role":"service_role"`).
- **Best-effort (names survive `process.env` reads but not the leak itself):** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` literal markers; `stripe.webhooks` documented as best-effort only, not load-bearing.

```ts
// added to FORBIDDEN — see R7 for which are load-bearing vs best-effort
{ pattern: "sk_live_",                  why: "Stripe live secret key value in client bundle" },
{ pattern: "sk_test_",                  why: "Stripe test secret key value in client bundle" },
{ pattern: "whsec_",                    why: "Stripe webhook signing secret value in client bundle" },
{ pattern: '"role":"service_role"',     why: "service_role JWT (full RLS bypass) in client bundle" },
{ pattern: "STRIPE_SECRET_KEY",         why: "Stripe secret env-name in client bundle (best-effort)" },
{ pattern: "SUPABASE_SERVICE_ROLE_KEY", why: "service_role env-name in client bundle (best-effort)" },
```

A `getEntitlement` unit test asserts fail-open (error → `free`).

---

## 7. UI surfaces

All gated behind `isBillingEnabled()` (false → nothing renders; self-host + local-first see no billing UI).

- **Upgrade CTA — sidebar account menu** (`src/components/shell/sidebar-user-menu.tsx`). In the action `DropdownMenuGroup`, visible only when `signedIn && billingEnabled && tier === 'free'`: a `<DropdownMenuItem>` "Upgrade to Plus" (Sparkles, `--primary`) → `/billing`. When `tier !== 'free'`, replace with "Manage subscription" → portal endpoint, `window.location = url`.
- **Manage-subscription entry.** Same menu for subscribers; also a `/profile` "Billing" panel row. Both route through the Stripe Customer Portal.
- **`/billing` route** (`src/routes/billing.tsx`, core). Liquid-Glass `GlassPanel` tier comparison (Free vs Plus, monthly/annual toggle), "Upgrade to Plus" → `createCheckoutSession` → redirect to Stripe Checkout. Reads `getEntitlement()` for current tier. `?upgraded=1` → **fire the `/api/stripe/sync` reconciliation** (R12) + success toast; `?upgrade=cancel` → gentle "no charge made" note.
- **Plus badge.** Next to the display name in the account menu + profile when `tier !== 'free'`.
- **Gated-state messaging (the paywall surface).** When sync status is `needs_upgrade` (§5.1):
  - Account-menu status line: amber dot + "Upgrade to sync".
  - A dismissible `GlassPanel` banner in `/vault`: *"Multi-device sync is a Plus feature. Your Vault is safe locally and on this device — and you can still export everything to CSV. Upgrade to Plus to sync across your devices. [Upgrade] [Export CSV]."* Always pairs the ask with the export escape hatch (the open-core ethical exit).
  - On `deleted`/lapse/dispute: a one-time *"Your Plus plan ended. Existing synced data still reads, and you can still edit/delete/export it; new changes won't sync until you re-subscribe. Your collection is safe locally."*

Messaging rule: **never** a generic "sync failed" toast for an entitlement block — it must always read as a specific upgrade state with the data-is-safe reassurance.

---

## 8. File / implementation plan (ordered)

**Phase C.1 — schema + entitlement (server truth first):**
1. `supabase/migrations/20260619000001_billing.sql` — `stripe_customers`, `subscriptions`, `stripe_events`, `billing_config`; explicit table grants; `billing_on()`, `is_pro()` (REVOKEd); `process_stripe_event()` RPC; split `stacks`/`binders` policies into read/write-pro. **No cap trigger, no claim_exemptions, no cost-proxy CHECKs.** (§3, §4.4, §5)
2. `supabase/config.toml` — no change for the webhook (Nitro route, not an Edge Function); confirm the local stack runs the new migration.
3. Tests: `supabase/tests/billing_rls.test.sql` (or Bun integration) asserting:
   (a) no client can INSERT/UPDATE `subscriptions`/`stripe_customers`;
   (b) `is_pro=false` ⇒ stacks INSERT rejected with **42501**;
   (c) `is_pro=true` ⇒ stacks INSERT succeeds;
   (d) `billing_enabled=false` ⇒ everything passes (self-host default-allow);
   (e) a **lapsed (formerly-paid) user can still UPDATE + soft-delete + export existing rows**, but net-new INSERT is rejected with 42501;
   (f) read is **always ungated** (SELECT own rows regardless of entitlement);
   (g) a non-owner cannot probe `is_pro` (REVOKE — R8);
   (h) `process_stripe_event` is atomic: a duplicated event id no-ops, and a fresh id writes both ledger + subscription (R2).

**Phase C.2 — core seam (builds with NO plugin):**
4. `src/lib/billing/entitlement.ts` — `isBillingEnabled()`, `getEntitlement()`, `Tier` + the render-only/fail-open invariant comment. `entitlement.test.ts` (fail-open). (§6)
5. `src/routes/api/stripe/{webhook,checkout,portal,sync}.ts` — runtime-computed-specifier dynamic-import stubs → 501 absent. (§4.4, §6)
6. `vite.config.ts` — add `@tcgvault/cloud` to `ssr.external`. (R6)
7. `scripts/check-client-bundle.ts` — value-shape + best-effort markers + manifest-graph scan. (§6)
8. **CI (blocking): build-without-plugin job** — `bun run build` + `tsc -b` + leak guard, plugin absent, assert exit 0. (R6)

**Phase C.3 — sync degradation (UX only, no data-path change):**
9. `sync-engine.ts` — `EntitlementError` class; `pushRows` maps `42501` → `needs_upgrade`. (§5.1)
10. `sync-status.ts` — `"needs_upgrade"` status + `"entitlement-blocked"` event + `onEntitlementBlocked(kind)`.
11. `userland-store.ts` — `handleSignedIn` `onSyncError` branches on `EntitlementError`. The first-sign-in claim runs the standard gated-write path: a free user's claim push is rejected (`needs_upgrade`, stays local), and pushes once subscribed (§5.1).
12. `sync-status-display` — render `needs_upgrade`.

**Phase C.4 — UI:**
13. `src/routes/billing.tsx` — tier comparison + checkout trigger + `?upgraded=1` reconciliation call. (§7, R12)
14. `sidebar-user-menu.tsx` — Upgrade / Manage items (gated). Update `app-sidebar.test.tsx`.
15. Plus badge in account menu + `/profile` billing row.

**Phase C.5 — private `@tcgvault/cloud` (separate repo):**
16. `createCheckoutSession`, `createPortalSession`, `handleStripeWebhook` (item-aware period end + atomic RPC + dispute/refund), `reconcileForUser`; `PRICE_TO_TIER`; pinned API version; misconfig health check; Stripe-CLI + Test-Clock dev scripts; **the pinned-version `current_period_end` fixture test** (R3).
17. Hosted deploy doc (`DEPLOY.md` billing block): set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PLUS_MONTHLY`, `STRIPE_PRICE_PLUS_ANNUAL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL` (all non-`VITE_`); **flip `billing_config.billing_enabled=true` (required, verified, with post-deploy assertion — R16)**; install `@tcgvault/cloud` pre-build; register the webhook endpoint + (optional) a reconcile cron.

---

## 9. Security model

**RLS is the boundary.** Writes to `stacks`/`binders` are gated by `is_pro()` in the policy `with check`. `subscriptions`/`stripe_customers` have **read-own SELECT only, no write policy, no write grant** — the only writer is the webhook/reconcile RPC via `service_role`. A client physically cannot create an entitlement row.

**Secret handling.** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` are non-`VITE_`, Nitro-server-only, constructed only inside server handlers / the plugin. The service client is built with `@supabase/supabase-js` (`persistSession:false`) inside the handler — never module-scope, never client-reachable. Leak defense is layered (R7).

**Threat list + closure:**

| Threat | Closed by |
|---|---|
| **Webhook spoof** | `constructEvent(rawBody, sig, WEBHOOK_SECRET)` before any parse; raw `await request.text()` first; no middleware on the body; bad sig → 400. |
| **Client lies about plan** | No write policy/grant on `subscriptions`/`stripe_customers`. `getEntitlement()` is cosmetic; RLS `with check` re-derives entitlement server-side every write. |
| **RLS bypass** | `is_pro` is `SECURITY DEFINER set search_path=''`; **REVOKEd from anon/authenticated/public (R8)** so it can't be probed. |
| **Who-pays probe** (R8) | `is_pro(uuid)`/`billing_on()` revoked from all client roles; policies still evaluate them as owner. |
| **Replay / out-of-order webhook** | `stripe_events(id pk)` ledger **atomic with** the upsert (`process_stripe_event` RPC — R2); `subscriptions` PK = sub id + `on conflict id` converges out-of-order. |
| **Lost paid entitlement on crash** (R2) | Atomic RPC: ledger + upsert in one txn; the upsert idempotency (not the ledger) is the correctness boundary; plus `/api/stripe/sync` reconciliation (R12). |
| **Paid user locked out at renewal** (R4) | `is_pro` trusts `active`/`trialing` status with no period-end check; `past_due` bounded to 7-day grace. |
| **Chargeback/refund fraud** (R5) | `charge.dispute.created` / full `charge.refunded` → `status='unpaid'` → `is_pro` false immediately (data retained). |
| **service_role leak** | Non-`VITE_`, Nitro-only, handler-scoped; layered leak guard (value-shape regex + build-graph + build-without-plugin job). |
| **Lost uid bridge** | uid in both `client_reference_id` and `subscription_data.metadata.user_id`; `stripe_customers` link written on `checkout.session.completed` before any subscription event. |
| **Self-host accidentally billed / locked out** | `is_pro` default-allows when `billing_on()` false (the default). |
| **Self-host wired-but-silently-free** (R16) | Health check warns/fails when `STRIPE_SECRET_KEY` set but `billing_enabled` false. |
| **Build leaks the plugin / breaks plugin-absent** (R6) | Runtime specifier + `ssr.external` + **blocking** build-without-plugin CI job. |
| **`getEntitlement` misused as a gate** (R15) | Invariant comment + test; the gate is always RLS. |

---

## 10. Risks & open questions

- **Free-tier unit economics.** Free signed-in users sync 0 rows, so hosted storage/egress cost is borne entirely by paying subscribers — the unit economics are clean by construction. Hosted image backup stays a reserved Pro value-add.
- **0 free-cap = no sync for free users.** Signing in adds nothing until you subscribe, which raises the conversion ask (the wall is at the door, not deep in the funnel). **Mitigation/open:** the entire local-first app is the free experience; the annual discount is the conversion lever; a Stripe free-trial is a future lever if conversion lags. A 0 floor is deliberate — it can only ever be raised, never lowered, so it carries no one-way-door risk.
- **`past_due` dunning generosity (R4/owner).** A permanently-failing card grants up to 7 days of free Plus before degradation. Bounded + intentional, but a documented owner decision (not framed as a "blip").
- **Value-add tiers depend on an unbuilt price-data connector** (Phase 4). Plus launches on SCALE value only (unlimited multi-device sync); price-history/valuation/alerts become Pro when the connector ships. **Server-enforced tier differentiation is deferred with Pro (R13)** — only free-vs-Plus is enforced today.
- **Grandfathered pricing + Stripe Price lifecycle.** Keep legacy Price objects active; don't force-migrate subs. Plan the lifecycle before the first price bump.
- **Stripe API surface drift (R3).** `current_period_end` and `invoice.subscription` have already moved across versions. The pinned-version `current_period_end` CI fixture is the guard — a future bump that relocates the field again fails CI rather than silently disabling billing. Keep it green.
- **Webhook raw-body fragility.** Any Nitro/Start middleware consuming the body before the handler breaks `constructEvent`. Mitigation: `request.text()` first; no global body parser on `/api/stripe/*`; never `createServerFn`; integration test posts a signed payload asserting 200.
- **Open question (owner):** annual-only or both monthly+annual at launch? (Assumed both, annual discounted — §11.)
- **Open question (owner):** does the hosted free tier require email verification at sign-in? (Assumed: existing Supabase config; no extra gate — §11.)

---

## 11. Assumptions (owner review checkpoint)

See the `assumptions` field for the full enumerated list (R-decisions folded). Headline calls: boundary = hosted multi-device sync IS the paid feature, the full local-first app + self-hosting are the free/open guarantees; Free + Plus shipped, Pro reserved; Plus $4/mo or $36/yr; **no trial** — the entire local-first app is the free trial; **free hosted tier syncs 0 stacks + 0 binders** (sync is entirely a Plus feature — a 0 floor can only ever be raised, never lowered); **no row-cap meter, no claim-exemption flow** (with a 0 free-cap the write gate is the pure binary `is_pro` check); cancel = retain + read/export always on, edit/delete-existing still allowed, never delete; first-sign-in claim/upload runs the standard gated-write path (free user's claim rejected → stays local, pushes once subscribed); webhook = Node server route with an atomic `process_stripe_event` RPC; `@tcgvault/cloud` = separate private repo with a runtime-computed dynamic import + `ssr.external` + blocking CI; entitlement = write-policy-free table; billing-on = server-truth `billing_config`; `is_pro` trusts active/trialing status (7-day `past_due` grace); refunds/disputes → immediate downgrade; period end read from subscription items at the pinned API version; reconciliation endpoint for lost webhooks; `is_pro` revoked from client roles; misconfig health check; `getEntitlement` render-only/fail-open.
