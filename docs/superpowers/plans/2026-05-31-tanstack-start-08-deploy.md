# TanStack Start Migration — Plan 08: Self-Host Deploy Artifacts

> Executed on the main thread (bounded config authoring, not TDD-subagent work). No app-behavior code; deliverables are deploy artifacts the user applies on their home server.

**Goal:** Commit everything needed to self-host the Nitro Node output behind the user's existing Cloudflare + nginx, with push-to-deploy via a GitHub Actions self-hosted runner — and replace the now-obsolete GitHub Pages workflow.

**Architecture:** CF edge (global cache) → nginx (origin-shield cache + SWR, owns TTLs) → `node .output/server/index.mjs` on `:3000` under systemd. Deploys: push to `main`/branch → self-hosted runner builds → rsync `.output` → `systemctl restart`; nginx serves stale through the ~1s restart.

**Scope honesty:** I can author + commit + locally verify (`build` + `start` + curl). I CANNOT run `systemctl`/`nginx -s reload` on the user's box — those steps are in `DEPLOY.md` for the user to apply. PWA is **deferred** (see Decision below).

---

## Decisions (delegate-mode — review)

1. **Edge owns cache TTLs.** The app emits no `Cache-Control` (react-start 1.168 limitation, Plan 03). So `nginx` sets TTLs via `proxy_cache_valid`, mirroring `src/server/cache-headers.ts`: SSR pages 1h + 7d SWR; `/collection` no-cache; hashed assets immutable. CF Cache Rules optionally layer path-specific edge TTLs on top.
2. **CF Worker + R2 stay.** Self-hosting the app doesn't move the corpus/proxy. Server runtime env `API_BASE` + build env `VITE_API_BASE` both point at the Worker. Absorbing the Worker on-box is a future option, not this plan.
3. **PWA deferred (YAGNI-honest).** The old SW + install-prompt/offline-indicator were deleted in Plan 07. A service worker over an SSR app is a different design than over the old static SPA (offline strategy for server-rendered documents, SW vs Nitro navigation fallback). Re-introducing it is its own brainstorm, not a mechanical port. The corpus island already gives instant client search backed by IndexedDB. Noted as a follow-up, not bolted on broken.
4. **Runner model = self-hosted GitHub Actions runner** (dials out, NAT-friendly) — chosen over Coolify/Dokku to avoid a second proxy fighting the hand-tuned nginx.

---

## Artifacts (all committed under `deploy/` + workflow)

### Task 1: nginx server block + CF real-IP include
- Create `deploy/nginx/tcg.conf` — reverse proxy + proxy_cache + SWR; TTLs mirror `cache-headers.ts`; `/collection` no-store; immutable assets.
- Create `deploy/nginx/cloudflare-real-ip.conf` — CF IP ranges → `CF-Connecting-IP`.

### Task 2: systemd unit
- Create `deploy/systemd/tcg.service` — runs `node .output/server/index.mjs`, `EnvironmentFile=/etc/tcg/env`, restart-always, `User=deploy`.

### Task 3: GitHub Actions self-hosted deploy workflow
- Replace `.github/workflows/deploy.yml` (was GitHub Pages) — self-hosted runner: checkout → bun install → build → rsync `.output` → `systemctl restart`.

### Task 4: env example + DEPLOY runbook
- Update `.env.example` — split `VITE_API_BASE` (build, client corpus) vs `API_BASE` (server runtime).
- Create `deploy/DEPLOY.md` — one-time server setup + ongoing deploy + CF Cache Rule guidance + the PWA-deferred note.

### Task 5: Verify + commit
- `bun run build` exit 0; `node .output/server/index.mjs` serves; curl routes 200. Commit artifacts.

---

## Self-review
- Covers the brainstorm's hosting deliverable (self-host Node behind CF+nginx, push-to-deploy). PWA explicitly deferred with rationale (not a silent drop).
- No app-code change → no test impact; gate = build + start + curl.
- TTLs single-sourced conceptually in `cache-headers.ts`, mirrored in nginx with a comment cross-reference.

## Carried forward
- PWA-over-SSR (own brainstorm).
- README rewrite (queued spawned task).
- Optional CF Worker absorption on-box.
