# Plan 006: Make the paid cloud service (Supabase vault + Stripe billing) production-launchable — code side

> **Executor instructions**: Follow this plan task by task. Run every
> verification command and confirm the expected result before moving on. If
> anything in a task's "STOP conditions" occurs, stop and report — do not
> improvise. When done, update the status row for this plan in
> `docs/improve/plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 5cd3d09..HEAD -- src/lib/billing src/routes/api/stripe src/store/userland/sync supabase/migrations deploy .github/workflows/deploy.yml`
> and in `/Users/rin/GitHub/card-stack-cloud`:
> `git diff --stat 80b2437..HEAD -- src/`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L (composed of S/M tasks; each task is independently landable)
- **Risk**: MED (touches deploy pipeline + billing correctness; every task has its own gate)
- **Depends on**: none (human provisioning lives in `007-user-launch-checklist.md`; tasks note where they interlock)
- **Category**: bug | security | docs | migration
- **Planned at**: main repo commit `5cd3d09`, plugin repo (`/Users/rin/GitHub/card-stack-cloud`, branch `feat/stripe-billing-plugin`) commit `80b2437`, 2026-07-06

## Why this matters

The paid tier (hosted cloud vault gated by a Stripe "Plus" subscription, $4/mo / $36/yr) is code-complete in architecture — RLS entitlement gating, open-core plugin split, webhook idempotency ledger, sync engine — and both repos are green (main: `tsc` clean, 1584/1585 tests; plugin: 14/14 + `tsc` clean). But a production deploy **today would ship a broken paid tier**: the deploy pipeline never installs the private billing plugin (every `/api/stripe/*` route would 501), nothing health-checks the wiring, several billing correctness edges would strand or mislead paying customers, and legally-required surfaces (ToS/privacy, account deletion) don't exist. This plan is every code change needed so that, once the human owner completes `007-user-launch-checklist.md` (accounts, tokens, DNS, dashboard config), flipping the switch launches a working, defensible paid service.

## Two repositories

| Repo | Path | Role |
|---|---|---|
| Main app (public, AGPL) | `/Users/rin/GitHub/pokemon-tcg-viewer` (work in a worktree/branch as usual) | TanStack Start + Vite + React 19, Bun. Core stub routes `src/routes/api/stripe/*`, entitlement UI, sync engine, Supabase migrations, deploy config. |
| Billing plugin (private) | `/Users/rin/GitHub/card-stack-cloud`, branch `feat/stripe-billing-plugin` | `@tcgvault/cloud` — Stripe checkout/portal/webhook/reconcile. Loaded at runtime by the core via runtime-computed dynamic import; core never imports Stripe. |

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Main: install | `bun install` (in a fresh worktree — required, see CLAUDE.md) | exit 0 |
| Main: tests | `bun test` | 1585 pass is the target; today 1 known order-dependent fail (fixed by Task 11) |
| Main: typecheck | `bunx tsc -b --force` | exit 0 (`--force`: incremental mode masks errors) |
| Main: lint | `bunx biome check --config-path=. <files>` | exit 0 (`bun run lint` breaks in worktrees) |
| Main: build + leak guard | `bun run build:check` | exit 0; fails if server-only code leaks into client bundle |
| Plugin: install/test/typecheck/build | `bun install && bun test && bun run typecheck && bun run build` (in plugin repo) | 14+ pass, exit 0 |
| Regenerate routeTree in a fresh worktree | boot `bun run dev` until `src/routeTree.gen.ts` appears, then kill it | file exists |

Repo conventions to match: Biome formatting; `interface` over `type` for object shapes; optional persisted fields are `null` never `undefined`; comments state constraints, not narration; conventional-commit style messages (`fix(billing): …`, `feat(sync): …`).

---

## Task 1 — Ship the billing plugin in the production deploy (BLOCKER)

**Finding**: `.github/workflows/deploy.yml` builds and rsyncs only the public repo (`bun install --frozen-lockfile` at line 47, `rsync -a --delete .output/ /var/www/tcg/.output/` at line 66). `@tcgvault/cloud` is never installed anywhere, so `loadCloudPlugin()` (`src/lib/billing/load-plugin.ts:23-32`) resolves `null` in production and all four `/api/stripe/*` stubs return 501 forever.

**Current state**:
- `src/lib/billing/load-plugin.ts:25-27` — runtime-computed specifier `["@tcgvault", "cloud"].join("/")` with `/* @vite-ignore */`; the package is in vite `ssr.external`, so at runtime Node resolves the bare specifier from `.output/server/node_modules/`.
- The deploy runs on a **self-hosted runner on the same home box** as the server (deploy.yml:31 `runs-on: [self-hosted, tcg]`).
- The plugin has runtime dependencies of its own (`stripe`, `@supabase/ssr`, `@supabase/supabase-js` — see its `package.json`), which must be resolvable from the installed plugin dir.
- Design constraint (open-core, from `docs/superpowers/specs/2026-06-19-cloud-vault-billing-design.md`): the public build must keep succeeding **without** the plugin. Preserve the current ordering: build first (no plugin — this IS the without-plugin proof), leak-check, and only then inject the plugin into the output.

**Steps**:
1. In `deploy.yml`, after the `Build (Vite + Nitro)` step and before rsync, add steps:
   - Checkout the private plugin using `actions/checkout@v4` with `repository: <owner>/card-stack-cloud`, `path: cloud-plugin`, `ssh-key: ${{ secrets.CLOUD_DEPLOY_KEY }}` (the human owner creates this secret — 007 §D). Pin `ref` to the plugin's release branch (`main` once the owner merges `feat/stripe-billing-plugin`; use the branch that exists at execution time).
   - `cd cloud-plugin && bun install --frozen-lockfile && bun run build && bun test` (a red plugin test fails the deploy).
   - Install the plugin into the server output with its own production deps:
     ```
     PLUG=.output/server/node_modules/@tcgvault/cloud
     mkdir -p "$PLUG"
     cp -r cloud-plugin/package.json cloud-plugin/dist "$PLUG"/
     (cd "$PLUG" && bun install --production)
     ```
     Node resolution walks up from `@tcgvault/cloud/dist/*.js` and finds the nested `node_modules` — no collision with whatever Nitro bundled.
   - Guard the whole block behind `if: ${{ vars.DEPLOY_BILLING == '1' }}` so deploys stay green until the owner opts in (they set the repo variable in 007 §D).
2. Update the deploy comment block (deploy.yml:8-16 region) to mention the new secret + variable, and that the plugin injection happens **post-build** to preserve the build-without-plugin invariant.
3. Rehearse locally: run `bun run build`, perform step 1's copy/install against the local `.output`, then `node .output/server/index.mjs` with the seven billing env vars set to dummy values and `PORT=3100`.

**Verify**:
- Local rehearsal: `curl -s -o /dev/null -w '%{http_code}' -X POST http://localhost:3100/api/stripe/checkout` → `401` (plugin present, no session). Without the injection it returns `501`.
- `bun run build:check` still exits 0 (leak guard unaffected — plugin is server-side only).
- `actionlint .github/workflows/deploy.yml` (if available) or careful YAML review → no syntax errors.

**STOP conditions**: `.output/server/node_modules` doesn't exist after a build (Nitro layout changed — investigate how externals resolve before improvising); the local rehearsal 401 check returns 501 after injection.

---

## Task 2 — `/api/health` endpoint + post-deploy gate

**Finding**: nothing validates the billing wiring at or after startup. `assertBillingConfigured` exists in the plugin (`card-stack-cloud/src/health.ts`) but has **zero callers** in the core (verified by grep). A misdeployed box (missing env, absent plugin) fails only when the first customer hits it.

**Steps**:
1. Add `src/routes/api/health.ts` (server route, GET) returning JSON — booleans and enums only, never values:
   `{ ok: true, plugin: "present"|"absent", billingEnv: <count of the 7 billing vars that are set>, supabase: <VITE_SUPABASE_URL set?> }`.
   Reuse `loadCloudPlugin()` for plugin presence. Model the route file on `src/routes/api/stripe/webhook.ts` (createFileRoute + `server.handlers`).
2. If the plugin is present, also call its `assertBillingConfigured()` inside the handler (wrap in try/catch; report `billingConfigured: boolean`) — this is the existing plugin export made useful.
3. In `deploy.yml`, after `Restart the service`, add:
   `sleep 3 && curl -sf http://127.0.0.1:3000/api/health` and, when `vars.DEPLOY_BILLING == '1'`, additionally `| grep -q '"plugin":"present"'` — a failed health check fails the deploy loudly.
4. Add a test `src/routes/api/health.test.ts` asserting the handler shape with the plugin absent (it will be absent under `bun test`).

**Verify**: `bun test src/routes/api/health.test.ts` → pass. Local rehearsal from Task 1: `curl -s http://localhost:3100/api/health` → `"plugin":"present"`.

**STOP conditions**: TanStack server-route handler cannot be unit-tested in the bun test harness (look at `src/routes/auth/callback.test.ts` for the existing pattern first; if none fits, test the extracted handler logic as a plain function instead).

---

## Task 3 — Billing plugin hardening (plugin repo)

All in `/Users/rin/GitHub/card-stack-cloud`. Current tests are DI-mocked (`webhook.test.ts`, `normalize.test.ts`, `integration.test.ts`) — extend them, no live Stripe.

**3a. Reconcile must not report success on RPC failure.** `src/reconcile.ts:39-50` counts successes and always returns `{ ok: true, reconciled }` — an RPC failure leaves a paying user unentitled while the client believes reconciliation succeeded. Change: collect failures; if any RPC errored, return `json({ ok: false, reconciled, failed }, 500)`. (Task 9 makes the client surface it.)

**3b. Reconcile pagination guard.** `src/reconcile.ts:27-31` lists subscriptions with `limit: 10` and ignores `has_more`. Raise to `limit: 100` and if `subs.has_more` is still true, iterate with `starting_after` until drained (a simple `while` loop).

**3c. Synthetic reconcile event id must include status.** `src/reconcile.ts:42` builds `recon_${sub.id}_${payload.current_period_end}`. A status-only change (e.g. `active` → `canceled` mid-period, or `cancel_at_period_end` flipped) produces the SAME id as an earlier reconcile → the ledger dedupe in `process_stripe_event` no-ops it and self-heal misses the change. Change to `recon_${sub.id}_${payload.current_period_end}_${payload.status}_${payload.cancel_at_period_end ? 1 : 0}`.

**3d. Re-fetch subscription on `customer.subscription.*` webhooks.** `src/normalize.ts:138-147` maps the **inline** event object; Stripe delivers at-least-once and out-of-order, so a stale `subscription.updated` delivered late overwrites newer DB state. Mirror the `invoice.paid` branch (normalize.ts:148-161): take only the id from the event object, `stripe.subscriptions.retrieve(sub.id)`, and build the payload from the fresh fetch. (A retrieve on a deleted subscription returns it with `status: "canceled"` — correct.)

**3e. Minimal webhook error classification.** `src/webhook.ts:48-52` returns 500 for every thrown error, so Stripe retries permanent failures for days. In the catch: if the error is a Stripe error with `type === "StripeInvalidRequestError"` or `type === "StripeAuthenticationError"`, return 400 (no retry); otherwise keep 500 (retry). Keep messages terse — do not echo full error objects (PII discipline).

**3f. Pin checkout/portal return origin.** `src/http.ts:10-12` trusts the request `Origin` header for Stripe `success_url`/`return_url`. Add optional env `APP_ORIGIN` (extend `src/env.ts` with an optional field — read via `process.env.APP_ORIGIN`, no throw when unset): `originOf` prefers `APP_ORIGIN` when set, else current behavior. Update README env table.

**3g. Tests.** Add to the existing DI-mock suites: `customer.subscription.deleted` end-to-end mapping (currently untested); reconcile partial-RPC-failure → `ok:false` + 500; reconcile pagination loop; recon event id includes status; origin pinned when `APP_ORIGIN` set.

**Verify**: in plugin repo — `bun test` → all pass (≥ 19), `bun run typecheck` → exit 0, `bun run build` → exit 0. Commit to the plugin repo (its branch), conventional style.

**STOP conditions**: the `Deps` DI seam doesn't cover something a test needs (extend `deps.ts` minimally rather than reaching into module internals); `normalize.test.ts` fixture contradicts 3d (re-read the R3 note in the plugin README about `PINNED_API_VERSION` first).

---

## Task 4 — Sync watermark race (main repo)

**Finding (confirmed by direct read)**: `src/store/userland/sync/sync-engine.ts:280-284` folds **pushed** rows' `updated_at` into the watermark. Sequence: device A pulls at T0; device B commits a row whose trigger-stamped `updated_at` is T0.5; A pushes at T2 and advances its watermark to T2. A's next pull uses `gt("updated_at", T2)` → B's T0.5 row is never pulled by A until it changes again. Silent divergence between paying user's devices.

**Fix (ponytail)**: advance the watermark from **pulled** rows only — delete the `serverTimestamps.push(...)` block at lines 279-284. Consequence: A's own pushed rows come back on the next pull (echo); the reconciler already treats a pulled row that equals the cache as a no-op, so the echo is harmless — one redundant pull per write burst, zero correctness cost.

**Steps**:
1. Remove lines 279-284 in `sync-engine.ts` (the "Collect pushed server timestamps" block). Update the module top comment (line 11) accordingly.
2. Add a regression test in `src/store/userland/sync/sync-engine.test.ts` (follow the existing fake-client pattern there): push returns rows stamped T2 while pull returned nothing → assert watermark unchanged; then a following pass whose pull returns a T0.5 row → assert it is applied and watermark = T0.5-row's timestamp.
3. Confirm no echo loop: existing tests for "pulled row equal to cache" must still pass (they do — reconcile only pushes dirty ids).

**Verify**: `bun test src/store/userland/sync/` → all pass including new test. `bunx tsc -b --force` → exit 0.

**STOP conditions**: any existing sync test asserts the old pushed-timestamp behavior as intended (would contradict the design spec — report instead of overwriting the assertion).

---

## Task 5 — DB migration: composite sync indexes + RPC dedupe narrowing

**Finding**: sync pulls filter `(user_id via RLS, updated_at > watermark)` but only `user_id` indexes exist (`20260609000001_cloud_vault.sql:50,78`). And `process_stripe_event` (`20260619000001_billing.sql:185-187`) catches **any** `unique_violation` — including a `stripe_customers.stripe_customer_id` uniqueness conflict — and silently no-ops the whole event, not just true event-id duplicates.

**Steps**:
1. New migration `supabase/migrations/20260707000000_billing_sync_hardening.sql`:
   - `create index stacks_user_updated_idx on public.stacks (user_id, updated_at);` — same for `binders`, `profiles`.
   - `create or replace function public.process_stripe_event(...)` — identical body except the ledger insert is isolated: wrap ONLY `insert into public.stripe_events ...` in its own `begin ... exception when unique_violation then return; end;` sub-block, and remove the function-level `exception` clause so customer/subscription upsert violations propagate as errors (webhook then 500s → Stripe retries → operator sees it, instead of silent loss).
   - Match the SQL commenting style of `20260619000001_billing.sql` (rationale comments, `-- R#` refs).
2. This migration must land **before** the human owner runs `supabase db push` against the production project (007 §B.3 waits on it).

**Verify**: if a local stack is available: `supabase start && supabase db push --local` (or `supabase db reset`) → applies cleanly; then `select indexname from pg_indexes where tablename='stacks';` → includes `stacks_user_updated_idx`. If no local stack: SQL review + `supabase db lint` if available; state which verification ran.

**STOP conditions**: local migration apply fails on the `create or replace` (signature drift vs the deployed function) — reconcile against `20260619000001_billing.sql:159` before editing.

---

## Task 6 — nginx rate limiting on billing routes

**Finding**: no throttling anywhere; `/api/stripe/checkout|portal|sync` are authenticated but each burns a Stripe API call; `/api/stripe/webhook` is signature-gated but unthrottled. Platform feature covers it — no app middleware.

**Steps**:
1. In `deploy/nginx/tcg.conf`: add `limit_req_zone $binary_remote_addr zone=stripe:10m rate=30r/m;` (http block) and in the server block a `location /api/stripe/ { limit_req zone=stripe burst=60 nodelay; proxy_pass <same upstream as existing dynamic routes>; }` — copy the existing proxy directives exactly (read the file first; keep raw body pass-through intact for the webhook: no `proxy_request_buffering` changes, no body-touching directives).
2. Document the limits in a one-line comment (why 30r/m: Stripe webhook retries are minute-scale; humans click checkout a handful of times).

**Verify**: `nginx -t -c <(…)` is not runnable off-box; instead validate by eye against nginx docs and note in the PR that the config is exercised on next deploy. If a local nginx exists: `nginx -t -p . -c deploy/nginx/tcg.conf` adapted as needed.

**STOP conditions**: `tcg.conf` structure doesn't match expectations (e.g. no explicit dynamic-route location to copy) — report the actual layout.

---

## Task 7 — Account deletion (+ export pointer) — GDPR/paid-service floor

**Finding**: no self-serve account deletion exists (grep across `src/routes` and plugin: nothing). Deleting `auth.users` cascades all vault + billing rows (FKs with `on delete cascade` — `20260609000001_cloud_vault.sql`, `20260619000001_billing.sql:10,28`), but only the **service-role** can do it, and active Stripe subscriptions must be canceled first. Service-role lives only in the plugin (open-core rule). CSV export of the vault already exists (Vault import/export feature) — deletion is the gap.

**Steps**:
1. Plugin: add `src/account.ts` exporting `deleteAccount(request, deps)`: auth the user (`deps.getUser`), list their active subscriptions via the `stripe_customers` map, `stripe.subscriptions.cancel(id)` each (immediate cancel — refund policy is a human decision, 007 §A.5), then `deps.admin.auth.admin.deleteUser(user.id)`. Return `{ ok: true }`. Export from `src/index.ts`. DI-mocked tests: cancels subs then deletes; 401 unauthenticated.
2. Core: add stub route `src/routes/api/account/delete.ts` following the exact pattern of `src/routes/api/stripe/webhook.ts` (load plugin → delegate → 501 absent). Extend the `CloudPlugin` interface in `src/lib/billing/load-plugin.ts` with `deleteAccount?(request: Request): Promise<Response>` (**optional** member — older plugin builds stay type-compatible; stub returns 501 when the export is missing).
3. UI: in the profile page (`src/routes/profile.tsx` / its form components), add a "Danger zone" section visible only when signed in AND `isBillingEnabled()` context exists (i.e. hosted mode): a destructive confirm dialog (type-to-confirm the email) that POSTs the route, then signs out and clears local state via the existing sign-out action. Also link the existing CSV export as "Export my data" next to it. Match Ethereal Glass form styling (`GlassPanel`, pill buttons — see `src/components/ui/glass`).
4. Self-host note: one paragraph in `deploy/DEPLOY.md` (Task 8) — without the plugin, deletion is a `supabase auth admin` operation by the operator.

**Verify**: plugin `bun test` green with new tests; main `bun test` green; `bunx tsc -b --force` exit 0; manual preview check of the dialog (dev:preview login) — screenshot in PR.

**STOP conditions**: `auth.admin.deleteUser` unavailable on the plugin's `admin` client construction (check `src/supabase.ts` — it must be the service-role client; if it's constructed with anon key, report); profile page structure diverges from expectation.

---

## Task 8 — DEPLOY.md: billing env inventory, launch checklist pointer, runbook

**Finding**: `deploy/DEPLOY.md` contains **zero** mentions of Stripe or Supabase (verified `grep -c` = 0). The seven plugin env vars, where they live, and every operational procedure for the paid tier are undocumented.

**Steps** (single doc task — new sections in DEPLOY.md):
1. **Env inventory table** — every server env var: name, consumer (`core` / `@tcgvault/cloud`), where set (`/etc/tcg/env` via systemd `EnvironmentFile` — confirm the exact mechanism by reading `deploy/systemd/tcg.service` first), secret y/n. Cover: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PLUS_MONTHLY`, `STRIPE_PRICE_PLUS_ANNUAL`, `APP_ORIGIN` (Task 3f), plus existing `API_BASE`/`VITE_*`. Names only — never values.
2. **Billing deploy section**: the `CLOUD_DEPLOY_KEY` secret + `DEPLOY_BILLING` variable (Task 1), the health gate (Task 2), and a pointer to `docs/improve/plans/007-user-launch-checklist.md` for the one-time human setup.
3. **Runbook**: webhook failures (Stripe Dashboard → Developers → Webhooks → delivery log; server side `journalctl -u tcg | grep -i stripe`); kill switch (`update public.billing_config set billing_enabled = false;` via service-role SQL — customers keep data, gate opens); secret rotation steps (new webhook secret: create second endpoint, flip env, delete old; Stripe key roll; Supabase service-role regenerate); Supabase backup/restore pointer (dashboard backups; test-restore drill is 007 §G.3); post-deploy smoke (`curl /api/health`).

**Verify**: `grep -c "STRIPE" deploy/DEPLOY.md` ≥ 8; every env var name from the plugin's `readEnv()` (`card-stack-cloud/src/env.ts:22-32`) appears in the table (visual check).

---

## Task 9 — Upgrade-path UX: reconcile failure surfacing + past_due banner + needs_upgrade link

**Current state (verified)**: `needs_upgrade` sync status exists with label "Upgrade to sync" (`src/components/sync/sync-status-display.ts:41-44`); the claim flow handles `EntitlementError` (`src/store/userland/userland-store.ts:207,232`); `/billing` route exists and reconciles on `?upgraded=1` (`src/routes/billing.tsx:17`). Gaps are polish, not architecture.

**Steps**:
1. `?upgraded=1` reconcile handling in `src/routes/billing.tsx`: after Task 3a the endpoint can return `{ ok: false, failed }` with 500. Show an explicit error state ("Payment received — activation is retrying; contact <support> if this persists") instead of silently proceeding. Re-read the route to fit its current data flow.
2. `needs_upgrade` affordance: wherever the status line/dot renders in the sidebar user menu (`src/components/shell/sidebar-user-menu.tsx` — a `/billing` Link already exists at line 137), make the `needs_upgrade` status itself link/route to `/billing`. Check `src/components/sync/sync-toasts.ts` — if it toasts on `needs_upgrade` transitions, give that toast an action linking `/billing`; if it deliberately doesn't toast this status, leave toasts alone.
3. `past_due` banner: `getEntitlement()` (`src/lib/billing/entitlement.ts:45-72`) already returns `status`. In the Vault page shell (`src/routes/vault.tsx` or its layout component — locate the top-level Vault container), when signed-in entitlement is `past_due` (within the 7-day grace the server honors), render a dismissible amber banner: "Payment issue — update your card to keep syncing" → button opens the portal via the existing portal-session call in `src/lib/billing/use-billing.ts`. Follow the Liquid Glass banner idiom (violet accent for info, amber for warning; `motion-reduce` guards).
4. Tests: banner render logic (mock entitlement via the hook's existing test seam — read `src/lib/billing/entitlement.test.ts` and `use-billing.ts` first); billing route error-state unit test if the route's test harness allows.

**Verify**: `bun test` green; visual check via `bun run dev:preview` (dev-login panel) — screenshots of banner + billing error state in PR.

**STOP conditions**: entitlement hook has no injectable seam for `past_due` in tests (add a minimal parameter/override rather than a mock framework); Vault layout has no obvious banner slot (report options instead of restructuring the layout).

---

## Task 10 — Stripe test-mode E2E smoke kit

**Finding**: plugin tests are DI-mocked; nothing exercises live-shaped Stripe traffic against a real local stack. The human owner needs a repeatable pre-launch drill (007 §F.1 consumes this).

**Steps**:
1. `scripts/billing-smoke.md` — an operator-runnable checklist:
   local `supabase start` + migrations; `bun run dev:preview` (dev-login) with the seven billing vars pointed at **Stripe test mode** + local Supabase service key; `stripe listen --forward-to localhost:6201/api/stripe/webhook` (note: `whsec` comes from `stripe listen` output); walk through: checkout with test card `4242 4242 4242 4242` → assert `subscriptions` row (`select status, plan from subscriptions;` via `supabase db …` or Studio) → `is_pro_self()` true → vault write syncs; then cancel via portal → row flips; then `stripe trigger charge.refunded` sanity.
2. `scripts/billing-smoke.ts` (optional but preferred): automates the DB-side assertions (poll `subscriptions` for expected status transitions, print PASS/FAIL) so the human only drives the browser parts. Bun script, service-role client from env, no secrets committed. Model env-reading style on `scripts/build-prices.ts`.
3. Wire a pointer from DEPLOY.md's runbook (Task 8).

**Verify**: `bunx tsc -b --force` (script included in the node tsconfig — check how `scripts/*.ts` are typechecked; follow `scripts/build-prices.ts`); dry-run the script with no env → prints usage and exits 1 (don't require live keys to verify structure).

---

## Task 11 — Fix the order-dependent test failure (baseline hygiene)

**Finding (reproduced today)**: full `bun test` → `history-runtime.test.ts` "loadSetHistory fetches, caches, and exposes a set's history" fails (received 593-element diff), passes in isolation → cross-file leak, same class as plan 001 (corpus/fetch state leaking between files).

**Steps**: apply the plan-001 pattern (see `docs/improve/plans/001-fix-order-dependent-test-failures.md` and its DONE notes): pre-seed `useCorpusRuntime.setState({ index: buildIndex([...]) })` or `spyOn` the fetch in the offending neighbor file; bisect which earlier file pollutes (`bun test <fileA> <fileB>` pairs). Never `mock.module` (poisons later files — known gotcha).

**Verify**: `bun test` full suite → **1585/1585 pass**, run twice to confirm determinism.

---

## Task 12 — Pricing pipeline go-live verification (mostly a gate, not code)

**Current state**: audit found the pipeline ~ready — crosswalk harvest from official TCGdex API + tcgcsv User-Agent fix landed (`63d0312`, `5cd3d09`); tests green; worker serves 503 until the first blob exists (by design). Remaining work is human provisioning (R2 bucket, secrets, first workflow run, Cardmarket permission — 007 §E).

**Steps**: after 007 §E completes, watch the first `build-prices.yml` run; verify worker `/prices` returns 200 and the client renders prices + portfolio value; fix forward anything the first live run surfaces (unknowable in advance — timebox and report).

**Verify**: `curl -s -o /dev/null -w '%{http_code}' <worker>/prices` → 200; a card detail page shows a price with Cardmarket attribution.

---

## Suggested executor toolkit

- `superpowers:test-driven-development` for Tasks 3, 4, 7 (failing test first).
- `wrangler` skill only if Task 12 surfaces worker issues.
- `tanstack-start-best-practices` for the server routes in Tasks 2 and 7.
- Read `docs/superpowers/specs/2026-06-19-cloud-vault-billing-design.md` before Tasks 3/9 — it records the R-numbered decisions cited in code comments.

## Scope

**In scope**: `.github/workflows/deploy.yml`, `deploy/nginx/tcg.conf`, `deploy/DEPLOY.md`, `src/routes/api/health.ts` (new), `src/routes/api/account/delete.ts` (new), `src/routes/billing.tsx`, `src/routes/profile.tsx` (danger zone only), `src/lib/billing/*`, `src/components/sync/*`, `src/components/shell/sidebar-user-menu.tsx` (status-link only), `src/store/userland/sync/sync-engine.ts` (+test), `supabase/migrations/20260707000000_*.sql` (new), `scripts/billing-smoke.*` (new), affected test files; plugin repo: `src/*` + tests + README.

**Out of scope** (do NOT touch):
- RLS policy semantics in `20260619000001_billing.sql` (the INSERT-only entitlement gate and lapsed-user-keeps-editing behavior are deliberate design — R-decisions).
- The corpus/pricing build scripts beyond Task 12's verification (`scripts/build-*.ts` are live pipelines).
- Any rename/branding work ("Cardstack" is parked — memory: product rename pending).
- Cohort/percentage feature-flag infrastructure (rejected — see README index).
- The `dist/` directory committed in the plugin repo (build artifact; rebuild, don't hand-edit).

## Git workflow

- Main repo: feature branch per task-cluster (e.g. `feat/billing-launch-readiness`), conventional commits, PR to `main`. Plugin repo: commit on its branch (owner merges).
- Do NOT push the plugin repo anywhere new; it is private and stays private.

## Done criteria (plan level)

- [ ] `bun test` (main) → 1585/1585, twice consecutively
- [ ] `bunx tsc -b --force` (main) → exit 0
- [ ] plugin: `bun test` + `bun run typecheck` + `bun run build` → exit 0, ≥ 19 tests
- [ ] Local rehearsal: injected plugin → `/api/stripe/checkout` 401 (not 501); `/api/health` reports `plugin:"present"`
- [ ] `grep -c "STRIPE" deploy/DEPLOY.md` ≥ 8
- [ ] New migration applies cleanly on a local stack
- [ ] `docs/improve/plans/README.md` row updated

## Maintenance notes

- Task 1's injection step is the ONLY place the private plugin touches the public repo's pipeline — reviewers should confirm no plugin code/secrets enter the build itself (leak guard runs pre-injection).
- If the plugin's dependency set changes, the nested `bun install --production` in deploy.yml picks it up automatically; a Nitro major upgrade may change `.output/server` layout — re-verify Task 1's rehearsal then.
- Task 4 trades one echo-pull per write burst for correctness; if sync traffic ever matters, the upgrade path is a server-clock safety lag (`watermark = min(maxPulled, now() - 30s)`), not re-adding pushed timestamps.
- `is_pro` grants everything when `billing_enabled=false` — the flag flip (007 §F.2) is the real launch moment; the kill switch works in both directions.
