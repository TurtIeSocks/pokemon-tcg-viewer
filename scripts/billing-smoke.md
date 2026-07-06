# Stripe test-mode E2E smoke kit

Operator checklist for `007-user-launch-checklist.md` §F.1 — a repeatable,
local drill that exercises the **real** Stripe test-mode checkout → webhook →
entitlement path, not the DI-mocked plugin unit tests. Run this before every
launch (and after any billing-adjacent change) so a launch-day surprise never
happens live.

Every step should go green before you move to the next. If a step fails, stop
and fix it — don't proceed on a red step.

## 0. Prerequisites

- Local Supabase stack running with migrations applied:
  ```
  supabase start
  supabase db reset   # or: supabase db push, if you want to keep existing data
  ```
  Note the `service_role key` and `API URL` from `supabase status -o json` (or
  the CLI's plain-text output) — you'll export them below.

- [Stripe CLI](https://docs.stripe.com/stripe-cli) installed and logged in
  (`stripe login`), **test mode** (the CLI defaults to test mode; double
  check the dashboard toggle in the top-left is set to "Test mode" too).

- A **test-mode** Product + two recurring Prices already created (007 §C.1),
  and a **test-mode** restricted secret key (007 §C.6). Do NOT use live keys
  for this drill.

- Seven env vars set in `.env` (or exported in your shell) pointed at test
  mode + the local stack:
  ```
  SUPABASE_URL=http://localhost:55321
  SUPABASE_ANON_KEY=<local anon key from `supabase status`>
  SUPABASE_SERVICE_ROLE_KEY=<local service_role key from `supabase status`>
  STRIPE_SECRET_KEY=sk_test_...
  STRIPE_WEBHOOK_SECRET=<filled in step 2, from `stripe listen` output>
  STRIPE_PRICE_PLUS_MONTHLY=price_...
  STRIPE_PRICE_PLUS_ANNUAL=price_...
  ```
  Also set `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` to the same
  Supabase values (client-side vars — see `.env.example`).

- Flip the flag so entitlement gating is actually live during this drill:
  ```
  bun run scripts/billing-smoke.ts billing-config
  ```
  If it prints `billing_enabled = false`, set it via Studio/`psql`/`supabase db`
  (`update public.billing_config set billing_enabled = true where id = true;`)
  — otherwise `is_pro()` default-allows everyone and the drill proves nothing.

## 1. Start the app in dev-login mode

```
bun run dev:preview
```

This sets `VITE_CLAUDE_PREVIEW=true`, exposing a dev-login panel
(bottom-right) that signs in a throwaway local user (`preview@local.dev`)
without needing a real magic-link email (those land in Mailpit, `:55324`,
never a real inbox). App serves on **port 6201**.

Sign in via the dev-login panel now, before continuing, so a `subscriptions`
row has a `user_id` to attach to.

## 2. Forward webhooks to your local server

In a separate terminal:

```
stripe listen --forward-to localhost:6201/api/stripe/webhook
```

Copy the `whsec_...` value it prints on startup into `STRIPE_WEBHOOK_SECRET`
in `.env`, then restart `bun run dev:preview` so the new secret is loaded.
Leave `stripe listen` running for the rest of this drill — it must stay up to
forward every event below.

## 3. Checkout with a test card

In the app, trigger checkout (upgrade / "Go Plus" CTA) and complete it with
Stripe's canonical test card:

- Card number: `4242 4242 4242 4242`
- Expiry: any future date
- CVC: any 3 digits
- ZIP: any 5 digits

Stripe redirects back to the app on success.

**Assert the DB side:**

```
bun run scripts/billing-smoke.ts wait-active preview@local.dev
```

Polls `subscriptions` (up to 60s) for `status = active` and prints
`PASS: subscription sub_... reached status=active (plan=plus)`. If it times
out, check the `stripe listen` terminal for forwarded-event errors and the
`bun run dev:preview` terminal for webhook handler errors.

You can also eyeball the row directly:

```
bun run scripts/billing-smoke.ts show preview@local.dev
```

or via Studio / `psql`: `select status, plan from subscriptions;`

**Assert entitlement is live:** reload the app; a Plus-gated feature (e.g.
Binders) should now be usable for this user. (`is_pro_self()` — see
`supabase/migrations/20260619000001_billing.sql` — is what the RLS policies
call; there's no separate CLI check for it, the gated UI/write path IS the
check.)

**Assert vault write syncs:** create or edit something gated behind Plus
(e.g. a Binder). It should save without an entitlement error. If you have a
second device/browser signed in as the same user, confirm the write appears
there too (sync engine).

## 4. Cancel via the customer portal

From the app, open the billing portal (Stripe-hosted) and cancel the
subscription.

**Assert the DB side:**

```
bun run scripts/billing-smoke.ts wait-canceled preview@local.dev
```

Depending on your portal cancellation setting this may transition
immediately to `canceled`, or first flip `cancel_at_period_end = true` while
`status` stays `active` until the period ends — if `wait-canceled` times out,
run `show` and check `cancel_at_period_end` before concluding failure; a
same-instant `canceled` transition is what "cancel immediately" portal
settings produce.

## 5. `charge.refunded` sanity trigger

Exercise the refund webhook path without a real dispute:

```
stripe trigger charge.refunded
```

Watch the `bun run dev:preview` terminal — the webhook handler should accept
the event (200) with no unhandled-error stack trace. This event isn't wired
to a specific DB assertion in this kit (no live subscription to refund from a
synthetic trigger); the goal is confirming the handler doesn't crash on an
event type it must at least accept.

## 6. Clean up

- Stop `stripe listen` and `bun run dev:preview`.
- If you want a clean slate for next time: `supabase db reset`.
- Cancelled test subscriptions and their customers persist in the Stripe test
  dashboard indefinitely — that's expected and free; no cleanup required
  there.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `wait-active` times out, no row ever appears | `stripe listen` not running, or forwarding to the wrong port/path (must be `localhost:6201/api/stripe/webhook`) |
| Webhook handler returns 400 | `STRIPE_WEBHOOK_SECRET` stale — restart `stripe listen`, copy the fresh `whsec_...`, restart the dev server |
| Row appears but entitlement UI doesn't unlock | `billing_config.billing_enabled` is still `false` — see step 0 |
| `billing-smoke.ts` exits 1 immediately | Missing `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` — see Usage banner it prints |
| `/api/stripe/*` returns 501 | The private `@tcgvault/cloud` plugin isn't installed in this worktree — this smoke kit assumes it's present locally (`bun install` picks it up per the plugin's install instructions), unlike a bare public checkout |
