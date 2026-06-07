# Cardstack

> Working product name; the repository is still `pokemon-tcg-viewer`.

A **local-first, open-source collection tracker for the Pokémon Trading Card
Game** — built on a fast, server-rendered catalog with interactive holographic
card rendering. Browse by series and set, search ~20k cards instantly, view any
card on its own shareable/crawlable page, track what you own per **stack** (with
provenance), organize into **Binders**, and import/export your collection as CSV
or JSON. Your data lives in your browser (IndexedDB) and is always exportable.

**Our deal:** the app, your data, and the self-hosted path are open source and
always will be — see [LICENSING.md](LICENSING.md).

## Features

* Browse cards by series and set, with booster-pack-styled set tiles
* Every series, set, and individual card is a real URL with its own
  `<title>` + OpenGraph/Twitter preview (server-rendered for SEO + sharing)
* Per-set filters — only the facets that actually occur in the selected set
* Name search and a per-Pokémon view across every set
* Holographic card effect that reacts to pointer movement
* Virtualized grid for smooth scrolling through large sets
* Instant client-side search once the in-memory card corpus loads
* **Your Vault** — a local-first (IndexedDB) collection hub:
  * Track owned cards as **Stacks** — a quantity of identical copies, each with
    price paid (per unit), date acquired, condition **or** grade, source, storage
    location, and notes; split a stack apart or merge duplicates
  * **Binders** — hybrid smart-rule + manual membership, with live completion
  * A set grid with completion overlays, a sortable owned-card grid, bulk
    "add all", and owned/not-owned filters
  * **Import / export** — JSON backup/restore **and** CSV (per-stack or per-card).
    Import *any* CSV (Pokellector, spreadsheets, …): columns are auto-detected
    (and remappable), rows are matched against the catalog, and a review queue
    lets you search-pick a card for anything ambiguous

## Stack

* React 19 + TypeScript
* TanStack Start (SSR) + TanStack Router — file-based routing, server functions
* Nitro — builds a Node server (`node .output/server/index.mjs`)
* Vite 8 (via the TanStack Start plugin)
* Zustand for client state (persisted to IndexedDB)
* React Virtuoso for grid virtualization
* Tailwind CSS v4 + Radix UI
* Biome for lint/format
* Bun as the package manager / test runner

## Getting started

```sh
bun install
bun run dev
```

Other scripts:

| Script              | Purpose                                   |
| ------------------- | ----------------------------------------- |
| `bun run dev`       | Start the Vite dev server (`vite dev`)    |
| `bun run build`     | Build the client + Nitro server output    |
| `bun run start`     | Run the built server (`node .output/...`) |
| `bun run typecheck` | Type-check with `tsc -b`                  |
| `bun run lint`      | Run Biome checks                          |
| `bun run format`    | Apply Biome auto-fixes                    |
| `bun test`          | Run the test suite                        |

## Routes

File-based, under `src/routes/`. Series pages are prerendered at build; sets
and cards are server-rendered on demand and cached at the edge (see Deployment).

| Path                        | Rendering           | Notes                                           |
| --------------------------- | ------------------- | ----------------------------------------------- |
| `/`                         | SSR (static hero)   | Search form + popular chips + recents island    |
| `/{series}`                 | Prerendered         | Booster-pack set tiles (sets change ~monthly)   |
| `/{series}/{set}`           | SSR + SWR           | All cards in the set + per-set filter facets    |
| `/{series}/{set}/{card}`    | SSR + SWR + OG      | Card detail; dialog over the grid on client nav |
| `/search?q=`                | SSR → corpus island | API first paint, instant once corpus loads      |
| `/pokemon/{name}`           | SSR + OG            | Every card of a Pokémon, across all sets        |
| `/vault/{cards,sets,binders}` | Client islands    | The Vault hub — local IndexedDB collection, grids, Binders |

## Project layout

```
src/
  router.tsx        # TanStack Router instance
  routes/           # File-based routes (__root + the pages above)
  server/           # Server-only data seam (runs in the loader / server fns)
    card-data.ts    #   pokemontcg.io fetchers — API base read from server env
    card-mappers.ts #   API → app DTO mappers + shared types
    nav-tree.ts     #   serializable series→set nav tree (getNavTreeFn)
    card-resolve.ts #   per-set card slug ↔ id resolution (memoized)
    set-facets.ts   #   distinct filter values for a set
    pokemon-dex.ts  #   name ↔ national-dex resolution
    cache-headers.ts#   canonical Cache-Control TTL matrix (mirrored in nginx)
  lib/
    slug.ts         # slugify + collision-safe slug↔id index
    api-base-client.ts # client-side API base (corpus fetch)
  components/
    islands/        # Client-only interactivity (ClientOnly-wrapped):
                    #   holo card, Virtuoso grid, card modal, corpus search, recents
    shell/          # SSR-safe nav (sidebar, toolbar, set tile)
    holo-card/      # The pointer-reactive holographic card
    card/           # Static card detail / metadata (SSR)
    ui/             # Radix-based primitives
  store/            # Zustand caches (sets, recents)
    userland/       #   the Vault: per-stack collection + Binders behind a repository
                    #   port (IndexedDB adapter now; swappable for a hosted DB later)
    corpus/         # In-memory ~20k-card search index (loaded client-side)
deploy/             # nginx, systemd, and the deploy runbook (see below)
worker/             # Cloudflare Worker: pokemontcg.io proxy + /corpus blob
scripts/            # Corpus crawler + PWA icon build
```

How the SSR/island split works: the server renders crawlable HTML (card names,
images, OG tags) in route loaders via the `src/server/` seam — the
pokemontcg.io API key never reaches the browser. Anything that needs the browser
(pointer-reactive holo, the Virtuoso grid, the in-memory corpus, the IndexedDB
Vault) is a `<ClientOnly>` island whose SSR fallback mirrors the crawlable
markup, so hydration never mismatches and SEO never regresses.

## Deployment

The app is a Node server (the Nitro `.output/`), designed to self-host behind
nginx + Cloudflare:

```
Cloudflare edge (global cache)
        │
      nginx  (origin shield + stale-while-revalidate; owns cache TTLs)
        │
  node .output/server/index.mjs  (:3000, under systemd)
```

Because react-start does not forward route cache headers to the SSR document
response, **nginx owns the cache policy** (`proxy_cache` + SWR), mirroring the
TTL values in `src/server/cache-headers.ts`. Pushes to `main` deploy via a
GitHub Actions **self-hosted runner**: build → rsync `.output/` → restart the
service; nginx serves stale cache through the ~1s restart.

All artifacts and the step-by-step runbook live in `deploy/`:

| File                                   | Purpose                                    |
| -------------------------------------- | ------------------------------------------ |
| `deploy/nginx/tcg.conf`                | Reverse proxy + SWR cache                  |
| `deploy/nginx/cloudflare-real-ip.conf` | Restore visitor IP from Cloudflare         |
| `deploy/systemd/tcg.service`           | Run the Node server under systemd          |
| `deploy/DEPLOY.md`                     | One-time setup + ongoing deploy + CF rules |
| `.github/workflows/deploy.yml`         | Push-to-deploy via self-hosted runner      |

## API proxy (Cloudflare Worker)

The app reaches the Pokémon TCG API through a Cloudflare Worker (`worker/`) that
adds an edge cache (stale-while-revalidate) and injects the API key server-side.
The Worker also serves `/corpus` — a gzipped blob of all ~20k cards (built by
`scripts/build-corpus.ts`, stored in R2) that powers the instant client search.

Two env vars point at the Worker (same URL, different consumers):

| Var             | When       | Purpose                                     |
| --------------- | ---------- | ------------------------------------------- |
| `VITE_API_BASE` | build time | baked into the client bundle (corpus fetch) |
| `API_BASE`      | runtime    | server-side SSR fetches (`/etc/tcg/env`)    |

See `.env.example` and `deploy/DEPLOY.md`.

### Deploy the Worker

```sh
cd worker
bunx wrangler secret put POKEMONTCG_API_KEY   # paste your key
bunx wrangler deploy --var ALLOW_ORIGIN:https://<your-host>
```

### Security note — rotate the key

The pokemontcg.io API key lives **only** as a Worker secret
(`wrangler secret put POKEMONTCG_API_KEY`) and in the server's `/etc/tcg/env`
— it is never shipped to the browser. Earlier (pre-Worker) builds inlined the
key into the public JS bundle; if you are upgrading from one of those, **rotate
the old key** in the pokemontcg.io dashboard so the previously-exposed value is
dead.

## License

Currently [MIT](LICENSE); an **AGPL-3.0** relicense of the core is planned. The
licensing model and the "our deal" promise are in [LICENSING.md](LICENSING.md).
