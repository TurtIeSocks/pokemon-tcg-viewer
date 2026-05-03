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
* Vite 8 for dev/build
* React Router 7
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

## License

See [LICENSE](LICENSE).
