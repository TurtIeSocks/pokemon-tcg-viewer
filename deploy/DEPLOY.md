# Self-hosting the Pokémon TCG viewer

The app is a TanStack Start (SSR) server — a Nitro Node bundle in `.output/`.
It runs behind Cloudflare + nginx on a home server, with push-to-deploy via a
GitHub Actions self-hosted runner.

```
Cloudflare edge (global cache)
        │
      nginx  (origin shield + stale-while-revalidate; owns cache TTLs)
        │
  node .output/server/index.mjs  (:3000, under systemd)
        │
  Cloudflare Worker + R2  (pokemontcg.io proxy + /corpus blob — unchanged)
```

## Environment

Two different API-base vars (same value — the Worker URL — but consumed at
different times):

| Var | When | Where | Purpose |
|-----|------|-------|---------|
| `VITE_API_BASE` | build time | GitHub Actions repo **variable** | baked into the client bundle (corpus fetch + client API) |
| `API_BASE` | runtime | `/etc/tcg/env` on the server | server-side SSR card fetches |

`/etc/tcg/env` (chmod 600, owned by `deploy`):

```sh
API_BASE=https://pokemon-tcg-proxy.<subdomain>.workers.dev
```

The pokemontcg.io API key stays a **Cloudflare Worker secret** — it never lives
on the app server. (Future option: absorb the Worker on-box and move the key to
`/etc/tcg/env`.)

## Billing env inventory (paid cloud tier)

The hosted Supabase vault + Stripe "Plus" subscription is an **optional**
private plugin (`@tcgvault/cloud`) loaded at runtime by the open-core app. A
self-host with no plugin installed and none of this env set still runs fine —
every `/api/stripe/*` route (and `/api/account/delete`) just 501s. The table
below is the authoritative inventory (007 §D.2 defers to it).

All server-runtime vars live in `/etc/tcg/env` — the systemd `EnvironmentFile`
declared in `deploy/systemd/tcg.service` (`EnvironmentFile=/etc/tcg/env`,
chmod 600, owned by `deploy`). That file is read once at process start
(`systemctl restart tcg` to pick up a change); it is **not** the same
mechanism as the CI-only build-time vars below.

| Var | Consumer | Where set | Secret |
|---|---|---|---|
| `API_BASE` | core (SSR loaders) | `/etc/tcg/env` (server runtime) | no |
| `VITE_API_BASE` | core (client bundle) | GitHub Actions repo **Variable** (build time) | no |
| `SUPABASE_URL` | `@tcgvault/cloud` | `/etc/tcg/env` (server runtime) | no (project URL) |
| `SUPABASE_ANON_KEY` | `@tcgvault/cloud` | `/etc/tcg/env` (server runtime) | no (RLS-scoped) |
| `SUPABASE_SERVICE_ROLE_KEY` | `@tcgvault/cloud` | `/etc/tcg/env` (server runtime) | **yes** |
| `STRIPE_SECRET_KEY` | `@tcgvault/cloud` | `/etc/tcg/env` (server runtime) | **yes** |
| `STRIPE_WEBHOOK_SECRET` | `@tcgvault/cloud` | `/etc/tcg/env` (server runtime) | **yes** |
| `STRIPE_PRICE_PLUS_MONTHLY` | `@tcgvault/cloud` | `/etc/tcg/env` (server runtime) | no (price id) |
| `STRIPE_PRICE_PLUS_ANNUAL` | `@tcgvault/cloud` | `/etc/tcg/env` (server runtime) | no (price id) |
| `APP_ORIGIN` | `@tcgvault/cloud` (optional) | `/etc/tcg/env` (server runtime) | no |
| `VITE_SUPABASE_URL` | core — **both** client bundle AND server SSR | GitHub Actions repo **Variable** (build time) AND `/etc/tcg/env` (server runtime) | no |
| `VITE_SUPABASE_ANON_KEY` | core — **both** client bundle AND server SSR | GitHub Actions repo **Variable** (build time) AND `/etc/tcg/env` (server runtime) | no (RLS-scoped) |

Notes:

- **`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` are the trap.** The `VITE_`
  prefix looks build-time-only, but `src/lib/supabase/server.ts` (via
  `client.ts`) reads them from `process.env` again on every SSR render to
  construct the request-scoped server client. They must be set in **both**
  places: the GitHub Actions repo Variable (bakes into the client bundle) and
  `/etc/tcg/env` (so the running server process has them too). Setting only
  the CI Variable gives you a working client and a server that throws
  `getServerClient() called while cloud is disabled`.
- `APP_ORIGIN` is optional. When set, it pins the Stripe checkout/portal
  `success_url`/`return_url` to the canonical origin instead of trusting the
  request's `Origin` header — set it once the domain (007 §A.1) is final.
- `STRIPE_PRICE_PLUS_MONTHLY`/`STRIPE_PRICE_PLUS_ANNUAL` are Stripe **Price**
  ids (`price_...`), not Product ids — copy them from the Stripe dashboard
  after creating the "Plus" Product with its two recurring Prices (007 §C.1).
  Test mode and live mode each have their own price ids; don't reuse a
  test-mode `price_...` in the live-mode env.
- No secret value ever belongs in this repo, in deploy.yml, or in this doc —
  only names. Actual values live in the password manager (007 §B/§C) and
  `/etc/tcg/env` on the box.
- Sanity check after editing `/etc/tcg/env`: `sudo systemctl restart tcg` then
  `curl -s localhost:3000/api/health` — `billingEnv` should read `7` (all
  seven `@tcgvault/cloud` vars present) and `supabase` should read `true`.

## Billing deploy (CI wiring)

The billing plugin is a **separate private repo** (`card-stack-cloud`),
injected into the build only when explicitly enabled — the public build
(`Build (Vite + Nitro)` in `.github/workflows/deploy.yml`) always runs first
and unmodified, so a plain `git clone` + `bun run build:check` of this repo
alone still proves the open-core build succeeds with zero billing code
present.

- **`vars.DEPLOY_BILLING == '1'`** (repo Settings → Actions → Variables) is
  the kill switch for the whole plugin-injection stage. Leave it unset/`0` and
  deploy.yml never checks out the plugin, never touches
  `.output/server/node_modules/@tcgvault/cloud` — deploys stay green with the
  paid tier fully absent. Flip to `1` only after 007 §D is complete.
- **`secrets.CLOUD_DEPLOY_KEY`** — an SSH deploy key (read-only) on the
  private `card-stack-cloud` repo, added as an Actions secret on **this**
  (public) repo. Used only by the `Checkout billing plugin` step, pinned to a
  SHA-pinned `ref:` (not a branch) so a push to the plugin repo can't change
  what runs here without a deliberate SHA bump in this repo's history.
- After checkout, the plugin is built + tested in its own directory, then its
  `package.json` + `dist/` are copied into
  `.output/server/node_modules/@tcgvault/cloud` and given a nested
  `bun install --production --ignore-scripts` (its own `stripe`/`@supabase/*`
  runtime deps resolve from there via normal Node module walk-up; no
  collision with whatever Nitro bundled for the core).
- **Post-restart health gate**: `curl -sf http://127.0.0.1:3000/api/health`
  must succeed after every deploy; when `DEPLOY_BILLING=1` it additionally
  greps the response for `"plugin":"present"`. A red gate fails the whole
  deploy loudly instead of shipping a silently-broken paid tier.
- Client build vars `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` are set as
  repo Variables alongside `VITE_API_BASE` (the anon key is public by design —
  RLS enforces access, so it doesn't need Secrets treatment).
- **One-time human setup this doc doesn't cover** (accounts, Stripe dashboard
  config, DNS, the actual deploy-key generation): see
  `docs/improve/plans/007-user-launch-checklist.md`.

## Self-hosting without the billing plugin

Everything above is optional. A self-hoster who never sets `DEPLOY_BILLING`
gets the full free-tier app (local IndexedDB vault, all catalog/collection
features) with every `/api/stripe/*` route and `/api/account/delete`
returning `501`. Account deletion in that mode is a **Supabase auth admin**
operation: with no billing plugin to cancel subscriptions first, delete the
user directly via `auth.admin.deleteUser(id)` (dashboard or the Supabase
admin API) — the `on delete cascade` FKs on the vault tables take care of the
rest.

## Pre-launch drill

Before flipping `billing_config.billing_enabled` on (or after any
billing-adjacent code change), run the full Stripe test-mode E2E smoke kit:
`scripts/billing-smoke.md` (checkout → webhook → entitlement → portal cancel
→ refund-event sanity, driven by `scripts/billing-smoke.ts`). It exercises the
real Stripe test-mode path end to end, not the DI-mocked plugin unit tests —
treat a red step there as a launch blocker.

## Billing runbook

**Webhook failures.** Stripe Dashboard → Developers → Webhooks → click the
endpoint → delivery log shows every attempt + response code/body. On the
server: `journalctl -u tcg | grep -i stripe` for handler-side errors. A stale
`STRIPE_WEBHOOK_SECRET` (e.g. after rotating it without restarting) manifests
as every delivery failing signature verification — check that first.

**Kill switch.** To stop gating new writes on Plus without touching code or
deploy (existing customers keep their data and access):
```sql
update public.billing_config set billing_enabled = false;
```
Run via the Supabase SQL editor as service role. Flip back to `true` to
re-enable. This does not cancel any Stripe subscription — it only changes
what `is_pro()` enforces in RLS.

**Secret rotation** (calendar a quarterly pass — 007 §G.4):
- *Stripe webhook secret*: create a **second** endpoint in the Stripe
  dashboard pointing at the same URL, copy its signing secret, update
  `STRIPE_WEBHOOK_SECRET` in `/etc/tcg/env`, `sudo systemctl restart tcg`,
  confirm a test event delivers successfully, **then** delete the old
  endpoint. Never delete-then-recreate — that's a window with no working
  webhook.
- *Stripe secret key*: Stripe dashboard → Developers → API keys → roll the
  key (issues a new one, old one keeps working for a grace period). Update
  `STRIPE_SECRET_KEY` in `/etc/tcg/env`, restart, verify a checkout session
  creates successfully, then revoke the old key. Any webhook delivered during
  the broken-key window is dropped as a permanent 400 (Stripe classifies a
  `StripeAuthenticationError` as non-retryable), not queued for retry — once
  the key is fixed, either have affected users hit `/billing` (the reconcile
  self-heal picks up the missed subscription state) or re-send the specific
  events from the Stripe dashboard's delivery log.
- *Supabase service-role key*: Supabase dashboard → Project Settings → API →
  regenerate. This invalidates the old key immediately (no grace period) —
  update `SUPABASE_SERVICE_ROLE_KEY` in `/etc/tcg/env` and restart in the same
  breath, or the plugin's admin operations (webhook reconcile, account
  deletion) go down until you do.

**Supabase backup/restore.** Daily backups are on by default on a paid
Supabase plan (007 §B.6); point-in-time recovery window is visible in the
dashboard under Database → Backups. A backup you've never restored is a hope,
not a backup — the one-time restore-to-a-scratch-project drill is 007 §G.3,
do it before you need it for real.

**Post-deploy smoke.** `curl https://<domain>/api/health` — expect
`ok:true`, `plugin:"present"` (if `DEPLOY_BILLING=1`), `billingEnv:7`,
`supabase:true`, `billingConfigured:true`. Any of those off tells you exactly
which layer is misconfigured (env not on the box, plugin not injected, or the
plugin's own `assertBillingConfigured()` check failing).

## One-time server setup

1. **Node + the app tree**
   ```sh
   sudo mkdir -p /var/www/tcg && sudo chown deploy:deploy /var/www/tcg
   # node 20+ available at /usr/bin/node
   ```

2. **Runtime env**
   ```sh
   sudo mkdir -p /etc/tcg
   echo 'API_BASE=https://pokemon-tcg-proxy.<subdomain>.workers.dev' | sudo tee /etc/tcg/env
   sudo chmod 600 /etc/tcg/env && sudo chown deploy:deploy /etc/tcg/env
   ```

3. **systemd service**
   ```sh
   sudo cp deploy/systemd/tcg.service /etc/systemd/system/tcg.service
   sudo systemctl daemon-reload
   sudo systemctl enable --now tcg
   ```

4. **nginx**
   ```sh
   sudo cp deploy/nginx/cloudflare-real-ip.conf /etc/nginx/cloudflare-real-ip.conf
   sudo cp deploy/nginx/tcg.conf /etc/nginx/conf.d/tcg.conf
   # edit server_name + the ssl_certificate paths in tcg.conf first
   sudo mkdir -p /var/cache/nginx/tcg
   sudo nginx -t && sudo systemctl reload nginx
   ```

5. **GitHub Actions self-hosted runner** (on the same box)
   - Repo → Settings → Actions → Runners → New self-hosted runner. Install with
     labels `self-hosted,tcg`. Run it as a service (`./svc.sh install && ./svc.sh start`).
   - Runner user needs passwordless restart of just this service. Add via
     `sudo visudo -f /etc/sudoers.d/tcg`:
     ```
     <runner-user> ALL=(root) NOPASSWD: /usr/bin/systemctl restart tcg
     ```
   - Repo → Settings → Secrets and variables → Actions → **Variables**: add
     `VITE_API_BASE` = the Worker URL.

## Security: public repo + self-hosted runner

GitHub discourages self-hosted runners on public repos because a fork can open a
PR whose code runs on your machine. The mitigations here:

1. **No PR triggers on the runner.** The deploy job triggers only on
   `push:[main]` and `workflow_dispatch` — neither is reachable by a fork (forks
   can't push to your `main`, and dispatch needs write access). **Never** add
   `pull_request`/`pull_request_target` to a `[self-hosted, tcg]` job.
2. **Repo-level runner**, not org-level — it serves only this repo.
3. **`production` environment, branch rule = `main`.** The deploy job declares
   `environment: production`; configure that environment (repo Settings →
   Environments) to allow only the `main` branch. A dispatch from any other ref
   is then blocked before the runner runs a step.
4. **Fork-PR approval** (defense in depth): Settings → Actions → General → "Fork
   pull request workflows from outside collaborators" → require approval for all
   outside collaborators.
5. **Least privilege**: the service + runner run as `deploy` (not root); the only
   sudo grant is the single `systemctl restart tcg` line.

## Deploying

Push to `main` (or run the **deploy** workflow manually). The runner builds,
rsyncs `.output/`, and restarts the service. nginx serves stale cache through
the ~1s restart, so deploys are invisible to visitors.

Manual deploy (from the box, if ever needed):
```sh
bun install --frozen-lockfile
VITE_API_BASE=<worker-url> bun run build
rsync -a --delete .output/ /var/www/tcg/.output/
sudo systemctl restart tcg
```

## Cloudflare cache (optional second tier)

nginx already caches with stale-while-revalidate. To also cache HTML at the CF
edge, add a **Cache Rule**: match your host, *Cache Everything*, Edge TTL "Use
cache-control header" (nginx sends `s-maxage=3600, stale-while-revalidate`),
and **Bypass cache** for the `/collection` path. The app is cookieless, so this
is safe.

Cache TTLs are defined in `deploy/nginx/tcg.conf` and mirror the canonical
values in `src/server/cache-headers.ts`. Change them in both places.

## Verifying a deploy

```sh
curl -sI https://tcg.example.com/sword-shield/brilliant-stars | grep -i x-cache-status
# MISS on first hit, HIT thereafter; STALE while revalidating.
for p in / /sword-shield /sword-shield/brilliant-stars /search?q=charizard /pokemon/charizard /collection; do
  printf "%s -> " "$p"; curl -s -o /dev/null -w "%{http_code}\n" "https://tcg.example.com$p"
done
```

## PWA / offline — deferred

The old service worker + install prompt were removed in the SSR migration.
Offline support for a server-rendered app is a different design than the old
static-SPA PWA and is intentionally **not** re-added here. The in-memory corpus
(IndexedDB-backed) already provides instant client-side search after first load.
Re-introducing a PWA is a separate piece of work.
