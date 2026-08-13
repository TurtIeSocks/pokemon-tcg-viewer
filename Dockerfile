# syntax=docker/dockerfile:1
# check=skip=SecretsUsedInArgOrEnv

# Container image for the TanStack Start (Nitro) SSR server.
#
# Two stages: node builds, node runs. The Nitro `node-server` preset emits a
# self-contained `.output/` (its only traced dependency is tslib, vendored into
# .output/server/node_modules), so the runtime stage needs neither bun nor a
# node_modules install — just node and that directory.
#
# Coolify: set Build Pack = Dockerfile. See COOLIFY.md for the env-var split
# (build-time VITE_* vs runtime), health check, and port settings.
#
# The `check=skip` above silences BuildKit's SecretsUsedInArgOrEnv warning on
# VITE_SUPABASE_ANON_KEY. It matches on the name; the Supabase anon key is
# public by design (RLS is the security boundary, not key secrecy) and is
# already inlined into the browser bundle. No real secret belongs in an ARG.

# ---------------------------------------------------------------------------
# Stage 1 — build
#
# node, not bun, is the base — and the build is deliberately run through npm so
# that vite executes under node. srvx (Nitro's server layer) resolves its entry
# through export conditions, and its `.` export declares a `bun` condition
# ahead of `node`. Run `vite build` under bun and the bundle gets srvx's Bun
# adapter baked in, which then dies at boot under node with
# `ReferenceError: Bun is not defined`. bun is still used for `bun install`, so
# bun.lock stays the source of truth for dependency resolution.
# ---------------------------------------------------------------------------
FROM node:24-slim AS build
WORKDIR /app

RUN npm install -g bun@1.3.14

# Build-time only. Vite inlines `import.meta.env.VITE_*` into the client bundle,
# so these must be present HERE, not at runtime — a container started with
# VITE_API_BASE in its runtime env but not its build args still ships a bundle
# that throws on the first /corpus fetch. In Coolify, tick "Build Variable?" on
# each of these so they are passed as --build-arg.
ARG VITE_API_BASE
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_API_BASE=$VITE_API_BASE \
    VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

# Dependency layer, cached until the manifests change. --ignore-scripts skips
# the `postinstall` paraglide compile (and sharp's binary download, which only
# offline scripts use): the paraglideVitePlugin recompiles src/paraglide during
# `vite build` anyway, and it is the authoritative compile — the CLI one exists
# to scaffold types for tsc/test, neither of which runs here.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts

COPY . .

# build:check = `vite build` + the client-bundle leak guard, which fails the
# build if server-only code (node:zlib, process.env.API_BASE, the server corpus
# loader) reached .output/public. Worth keeping in the image build: a Coolify
# deploy can be triggered straight from a push, with no CI in front of it.
RUN npm run build:check

# ---------------------------------------------------------------------------
# Stage 2 — runtime
# ---------------------------------------------------------------------------
FROM node:24-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

# node:alpine ships a `node` user (uid 1000). Nothing writes to the app tree at
# runtime, so it stays root-owned and read-only to the server process.
COPY --from=build /app/.output ./.output
USER node

EXPOSE 3000

# /api/health reports plugin presence + billing env counts and never touches the
# network, so it is a true liveness signal. Coolify has its own health-check
# settings in the UI; this covers a plain `docker run` and gives Coolify a
# sensible default to inherit.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", ".output/server/index.mjs"]
