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
