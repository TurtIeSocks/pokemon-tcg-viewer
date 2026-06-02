# Pokémon TCG Viewer — project notes

## New worktree setup (do this first)

When starting work in a **new git worktree**, before running the dev server or anything else:

1. **`bun install`** — run it in the worktree. Worktrees do not come with a usable `node_modules`. Because a worktree lives under the main checkout (`.claude/worktrees/<name>/`), tooling resolves `node_modules` *upward* to the base checkout, which is frequently stale or partial. The classic symptom: `vite dev` crashes with `Failed to load url …/node_modules/nitro/dist/runtime/internal/vite/dev-entry.mjs` even though `bun test`, `tsc -b`, and `vite build` all pass (those don't need the dev-only nitro runtime). A fresh worktree-local install fixes it.
2. **Copy `.env` from the base checkout root** — `.env` is gitignored, so a new worktree starts without it. Run `cp <base-repo-root>/.env .env` (e.g. `cp ../../../.env .env` from the worktree root).

Skipping either leaves the dev server broken in confusing, partial ways.

## Dev / test / lint

- Dev server: `bun run dev` (Vite + TanStack Start, port 6201 via `.claude/launch.json`).
- Tests: `bun test` (Bun runner; `fake-indexeddb` + happy-dom preloaded via `bunfig.toml`).
- Typecheck: `bunx tsc -b`.
- Lint: `bunx biome check --write <files>`. Note: `bun run lint` can fail on a nested `biome.json` inside a worktree — pass explicit file paths (or `--config-path=.`).
