# Deploying to Coolify

The app is a TanStack Start (SSR) server: `vite build` emits a Nitro Node bundle
in `.output/`, and `node .output/server/index.mjs` serves it on `PORT`. The
`Dockerfile` at the repo root builds and runs exactly that.

This is an alternative to the bare-metal path in `deploy/DEPLOY.md` (systemd +
nginx + a self-hosted Actions runner). Coolify replaces all three: its Traefik
proxy terminates TLS and routes to the container, and a push to the tracked
branch triggers the rebuild.

## Create the application

1. **New Resource → Application → your Git source** (public repo, GitHub App, or
   a deploy key for a private fork).
2. **Build Pack: `Dockerfile`.** Do not use Nixpacks. Nixpacks autodetects a
   plain Vite SPA and will serve `.output/public` statically, which silently
   drops every SSR route, all `/api/*` handlers, and the server functions the
   route loaders depend on.
3. **Dockerfile location:** `/Dockerfile` (the default).
4. **Port:** `3000`. The Dockerfile `EXPOSE`s it, but Coolify's "Ports Exposes"
   field is what its proxy actually reads — set it explicitly.
5. **Domain:** set the FQDN you want Traefik to route (`https://` prefix so it
   provisions a certificate).

## Environment variables — the part that bites

Coolify shows one env-var list with a **"Build Variable?"** toggle per row. That
toggle is the whole game here, because this app reads config in two different
ways:

| Var | Build Variable? | Runtime? | Notes |
|---|---|---|---|
| `VITE_API_BASE` | **yes** | no | Cloudflare Worker URL. Inlined into the browser bundle by Vite. |
| `VITE_SUPABASE_URL` | **yes** | **yes** | Needed in both places — see below. |
| `VITE_SUPABASE_ANON_KEY` | **yes** | **yes** | Same. Public by design (RLS is the boundary). |
| `API_BASE` | no | yes | Same Worker URL, read by the SSR card/set fetchers. |
| `PROXY_TOKEN` | no | yes | Shared secret for the Worker's `/v2/*` route. |
| `ANTHROPIC_API_KEY` | no | yes | AI card scan. Omit and `/api/scan` returns 503; on-device OCR still works. |
| `SCAN_MODEL` | no | yes | Optional, defaults to `claude-haiku-4-5`. |
| `SUPABASE_*`, `STRIPE_*`, `APP_ORIGIN` | no | yes | Paid-tier plugin only. Full inventory in `deploy/DEPLOY.md`. |

Three things to get right:

- **A `VITE_` var set only at runtime does nothing.** Vite substitutes
  `import.meta.env.VITE_*` at build time; the built bundle has no `process.env`
  to read later. A container with `VITE_API_BASE` in its runtime env but not its
  build args serves a client that throws on the first `/corpus` fetch.
- **`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` need both.** Despite the
  prefix, `src/lib/supabase/server.ts` re-reads them from `process.env` on every
  SSR render. Build-only gives you a working client and a server that throws
  `getServerClient() called while cloud is disabled`. Add each one twice: once
  with "Build Variable?" ticked, once without.
- **`API_BASE` and `VITE_API_BASE` hold the same value** but are consumed at
  different times, and neither has a default. Both are required; see the
  "Running without a Worker at all" section of `deploy/DEPLOY.md` for what a
  minimal setup loses.

Changing a build variable requires a **rebuild**, not a restart — Coolify's
"Restart" button reuses the existing image.

## Health check

The Dockerfile ships a `HEALTHCHECK` against `/api/health`, which returns
`{"ok":true,...}` plus plugin/env counts without touching the network. If you
configure Coolify's own health check instead, point it at `/api/health` rather
than `/` — the root route server-renders the full home page, which is a slower
and noisier probe.

After a deploy, the same endpoint tells you which layer is misconfigured:

```bash
curl -s https://<your-domain>/api/health
```

`billingEnv` counts how many of the seven billing vars are present, `supabase`
reflects `VITE_SUPABASE_URL` at runtime, and `plugin` is `absent` on any build
without the private `@tcgvault/cloud` package (the normal open-core case).

## Compression

`vite.config.ts` sets Nitro's `compressPublicAssets`, so the build writes `.gz`
and `.br` siblings and the server picks one by `Accept-Encoding`. That matters
more here than on the bare-metal path, where nginx's `gzip on` was doing the
job: Nitro compresses nothing at runtime, and the two render-blocking
stylesheets on `/` are 290 KB uncompressed against 32 KB brotli.

The SSR HTML itself is still uncompressed, since pre-compression cannot cover a
dynamic response and Nitro has no runtime equivalent. A home-page document is
around 200 KB. If you want that compressed too, add Traefik's `compress`
middleware to the application's custom labels in Coolify; it will leave the
pre-compressed static assets alone, since those already carry a
`Content-Encoding`.

## Resources and build time

The build runs `bun install` plus a full Vite/Nitro build of a large React app.
Give the build **at least 2 GB of RAM** — an OOM-killed build shows up as a
truncated log with no error, which reads like a network failure. The runtime
container is comfortable in ~256–512 MB.

The image is a two-stage build: `oven/bun:1` compiles, `node:24-alpine` runs, and
only `.output/` crosses between them, so the shipped image carries no `bun`, no
`node_modules`, and no source.

## Persistent storage

None. The Vault is either browser-local (IndexedDB) or in Supabase, the card
corpus is fetched from the Cloudflare Worker + R2, and nothing is written to the
container filesystem. Do not attach a volume.

## What Coolify does not cover

The Cloudflare Worker (`worker/`) is a separate deploy — `bun run deploy:worker`
with wrangler. It holds the pokemontcg.io key and serves the `/corpus*` blobs
from R2, and the app is not fully functional without it.

Supabase migrations in `supabase/migrations/` are likewise applied with
`supabase db push` against your own project, not by the container.
