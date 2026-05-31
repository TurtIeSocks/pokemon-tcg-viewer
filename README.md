# pokemon-tcg-viewer

A browser-based viewer for the Pokémon Trading Card Game catalog, with interactive holographic card rendering.

Live demo available [here](https://turtiesocks.github.io/pokemon-tcg-viewer/).

## Features

* Browse cards by series and set
* Filter by Pokémon name
* Holographic card effect that reacts to pointer movement
* Virtualized grid for smooth scrolling through large sets

## Stack

* React 19 (with the React Compiler) + TypeScript
* TanStack Start (SSR) + TanStack Router — Nitro Node server
* Vite 8 (via the TanStack Start plugin)
* Zustand for state
* React Virtuoso for grid virtualization
* Biome for lint/format
* Bun as the package manager / test runner

## Getting started

```sh
bun install
bun run dev
```

Other scripts:

| Script              | Purpose                          |
| ------------------- | -------------------------------- |
| `bun run dev`       | Start the Vite dev server        |
| `bun run build`     | Type-check and build for prod    |
| `bun run preview`   | Preview the production build     |
| `bun run typecheck` | Run `tsc --noEmit`               |
| `bun run lint`      | Run Biome checks                 |
| `bun run format`    | Apply Biome auto-fixes           |
| `bun test`          | Run the test suite               |

## Project layout

```
src/
  api.ts          # pokemontcg.io API client
  app.tsx         # Router + layout
  components/     # Header, grids, tabs, filter
  pages/          # Sets page, Pokémon page
  store/          # Zustand stores
  hooks/          # Custom React hooks
```

## Deployment

The site deploys to GitHub Pages via the workflow in `.github/workflows/`.

## API proxy (Cloudflare Worker)

The app calls the Pokémon TCG API through a Cloudflare Worker that adds an edge
cache (stale-while-revalidate) and injects the API key server-side.

### Deploy

```bash
cd worker
bunx wrangler secret put POKEMONTCG_API_KEY   # paste your key
bunx wrangler deploy --var ALLOW_ORIGIN:https://<user>.github.io
```

Then set `VITE_API_BASE` (see `.env.example`) to the deployed
`https://pokemon-tcg-proxy.<subdomain>.workers.dev` URL and rebuild.

### Security note — rotate the key

Earlier builds inlined `VITE_POKEMONTCG_API_KEY` into the public JS bundle.
After moving the key into the Worker secret, **rotate the old key** in the
pokemontcg.io developer dashboard so the previously-exposed value is dead.
The client no longer sends any API key.

## License

See [LICENSE](LICENSE).
