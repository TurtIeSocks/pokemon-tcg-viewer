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

## User-land ("Vault") architecture — `src/store/userland/`

The Vault (collection + goals) is local-first but **DB-ready**:

- **Per-copy model.** `CollectionItem` = one physical copy (`cardId` + `acquiredAt`, `pricePaid`, `variant`, `condition` **or** `grading`, `notes`, `isPrimary`). Optional fields are **`null`, never `undefined`** (IDB/JSON/SQL all agree; `0` ≠ unknown). Card render data is never stored — it's joined from the in-memory corpus (`hydrateCard` + `index.byId`).
- **Repository port.** UI/store talk to `CollectionRepo`/`GoalsRepo`/`BackupRepo` (`repo.ts`), implemented by the IndexedDB adapter (`idb-repo.ts`, `getRepos()`). To add a hosted DB later, write a remote adapter + swap the factory — don't scatter storage calls in features.
- **`useUserland`** (`userland-store.ts`) is a **non-persisted** Zustand cache hydrated from the repo (`loadUserland`); actions await the repo then commit. Tests inject a fake repo via `setUserlandRepos()` + `resetUserlandForTests()`.
- **Selectors** (`selectors.ts`) join the corpus: `useOwnedIndex`, `useOwnedCardViews`, `useOwnedCountBySet`, `useOwnedCardRows`, `useGoalProgress`. Shared helpers: `setsById()` (corpus-engine), `ownedCardIdSet()`/`useOwnedCardIdSet()`, `groupByCardId()`. Shared UI: `<ProgressBar>`, `<CopyManagerDialog>`, `useEnsureCorpus()`.

## Conventions + gotchas (save yourself time)

- **Manual `useMemo`/`useCallback` are intentional** even though React Compiler is on — the codebase memoizes by hand. react-doctor flags `react-compiler-no-manual-memoization`; that's an accepted deviation, don't strip them.
- **Route files export `Route` + a component**, so react-doctor's `only-export-components` fires on every `src/routes/**` file — expected/unavoidable in TanStack Start.
- **Tests must not hit the network.** A component that renders a card grid calls `loadCorpus()` (a real `fetch('/corpus')`). In any test rendering one, **pre-seed** `useCorpusRuntime.setState({ index: buildIndex([...]) })` so `loadCorpus` early-returns — otherwise the live corpus leaks into the shared `fake-indexeddb` and breaks other test files.
- **TanStack Form** uses the render-prop `children={...}` (biome `noChildrenProp` suppressed per-field); read `value={x ?? ""}` at the boundary; map empty → `null` before persisting.
- `crypto.randomUUID()` is the id source (Bun + browser).
