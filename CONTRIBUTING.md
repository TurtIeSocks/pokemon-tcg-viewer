# Contributing

Thanks for your interest! Cardstack is a local-first, open-source collection
tracker for the Pokémon TCG. Contributions are welcome.

## Setup

Requires [Bun](https://bun.sh).

```sh
bun install
cp .env.example .env   # fill in the Worker URL / API base — see the README
bun run dev            # Vite + TanStack Start dev server
```

## Checks (run before opening a PR)

```sh
bun test            # Bun runner (fake-indexeddb + happy-dom preloaded)
bun run typecheck   # tsc -b
bun run lint        # Biome  (bun run format applies safe fixes)
```

These are independent — run them in parallel.

## Conventions

- **TDD** — write the failing test first; keep the suite green.
- **Tabs** for indentation (Biome-enforced); `interface` for object shapes,
  `type` for unions/utilities.
- **Optional fields are `null`, never `undefined`** — IndexedDB / JSON / SQL all
  agree, and `0` ≠ unknown.
- **The Vault is DB-ready.** UI and store talk to a repository port
  (`src/store/userland/repo.ts`); the IndexedDB adapter implements it. Don't
  scatter storage calls into features — add/extend an adapter behind the port.
- **Per-stack model.** A `Stack` is a *quantity of identical physical cards*
  (card + variant + condition/grade + provenance + quantity). Card render data is
  never stored — it's joined from the in-memory corpus.
- Manual `useMemo`/`useCallback` are **intentional** (the codebase hand-memoizes;
  React Compiler is on). Don't strip them.
- Tests must not hit the network. A component that renders a card grid calls
  `loadCorpus()`; pre-seed `useCorpusRuntime.setState({ index: buildIndex([...]) })`
  in such tests.

## Commits & PRs

- Conventional-style messages: `feat(vault): …`, `fix(...): …`, `docs: …`,
  `refactor(...): …`.
- One focused change per PR; include tests for behavior changes.
- Be excellent to each other — see [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
