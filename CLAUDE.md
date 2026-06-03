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

The Vault (collection + **Binders**) is local-first but **DB-ready**. (Binders = the former "Goals", renamed; hybrid membership = smart rules + manual include/exclude.)

- **Per-copy model.** `CollectionItem` = one physical copy (`cardId` + `acquiredAt`, `pricePaid`, `variant`, `condition` **or** `grading`, `notes`, `isPrimary`). Optional fields are **`null`, never `undefined`** (IDB/JSON/SQL all agree; `0` ≠ unknown). Card render data is never stored — it's joined from the in-memory corpus (`hydrateCard` + `index.byId`).
- **Repository port.** UI/store talk to `CollectionRepo`/`BindersRepo`/`BackupRepo` (`repo.ts`), implemented by the IndexedDB adapter (`idb-repo.ts`, `getRepos()`). To add a hosted DB later, write a remote adapter + swap the factory — don't scatter storage calls in features.
- **`useUserland`** (`userland-store.ts`) is a **non-persisted** Zustand cache hydrated from the repo (`loadUserland`); actions await the repo then commit. Tests inject a fake repo via `setUserlandRepos()` + `resetUserlandForTests()`.
- **Selectors** (`selectors.ts`) join the corpus: `useOwnedIndex`, `useOwnedCardViews`, `useOwnedCountBySet`, `useOwnedCardRows`, `useBinderProgress`/`useBinderMembers`. Shared helpers: `setsById()` (corpus-engine), `ownedCardIdSet()`/`useOwnedCardIdSet()`, `groupByCardId()`. Shared UI: `<ProgressBar>`, `<OwnedMissingGrid>`, `useEnsureCorpus()`.
- **Copy management is unified on `/{series}/{set}/{card}/manage`.** The card modal swipes between a detail face and a roomy `CardCollectionManager` (the old `CopyManagerDialog` is retired). In-app it's a history-state masked overlay (`card-overlay.tsx` + `card-route.ts` `cardOverlay`/`cardManage`); a cold load hits the real `$card_/manage` route. `cardModalLinkPropsFor` (detail face) clears `cardManage`; `cardManageLinkPropsFor` sets it.

## Conventions + gotchas (save yourself time)

- **Manual `useMemo`/`useCallback` are intentional** even though React Compiler is on — the codebase memoizes by hand. react-doctor flags `react-compiler-no-manual-memoization`; that's an accepted deviation, don't strip them.
- **Route files export `Route` + a component**, so react-doctor's `only-export-components` fires on every `src/routes/**` file — expected/unavoidable in TanStack Start.
- **Tests must not hit the network.** A component that renders a card grid calls `loadCorpus()` (a real `fetch('/corpus')`). In any test rendering one, **pre-seed** `useCorpusRuntime.setState({ index: buildIndex([...]) })` so `loadCorpus` early-returns — otherwise the live corpus leaks into the shared `fake-indexeddb` and breaks other test files.
- **TanStack Form** uses the render-prop `children={...}` (biome `noChildrenProp` suppressed per-field); read `value={x ?? ""}` at the boundary; map empty → `null` before persisting.
- `crypto.randomUUID()` is the id source (Bun + browser).

## Design system — Liquid Glass (reference: `src/components/shell/set-tile.tsx`)

The app's visual language fuses **two glass dialects**, governed by tokens in `src/app.css` (`:root` primitives + `@theme inline`). Full spec: `docs/superpowers/specs/2026-06-03-liquid-glass-redesign-design.md`.

- **Ethereal Glass** (chrome) — shell, nav (shadcn `sidebar` inset variant), panels, forms, dialogs, data. `GlassPanel`/`BezelPanel` (`@/components/ui/glass`), pill buttons, frosted overlays.
- **Liquid Glass** (hero objects) — set/card tiles, the holo-card frame. Content-derived color (recipe below). `src/components/shell/set-tile.tsx` is canonical.

**Tokens:** accent **violet** `--primary` (`oklch(0.70 0.19 295)`) + `--primary-wash`/`--primary-ink`/`--primary-strong`; canvas `--canvas` (whisper-violet near-black); glass fill `--glass`; text `--ink`/`--ink-muted`/`--faint`; `--success` (emerald) for "owned"; `--shadow`/`--shadow-lift`; `--ease`; `--ambient` (fixed violet mesh on `body::before`). Radii `--r-panel`/`--r-control`/`--r-pill`. **Fonts:** `font-display` = Clash Display (hero), `font-sans` = Space Grotesk (UI), `font-mono` = Geist Mono (all numbers, `tabular-nums`). Shared primitives: `ProgressRing`, `Eyebrow`, `Stat`, `Stagger`, `Sheen`, shimmer `skeleton`. **New surfaces should compose these.**

Liquid-Glass recipe — layers, back → front:

1. **Color backdrop** — a content-derived color field. Take the surface's own image (set logo, card art) upscaled `scale-[1.7]` + `blur-2xl saturate-150 opacity-50` so the element glows in its *own* palette. Layer a base gradient (`bg-gradient-to-b from-black/40 via-black/10 to-black/75`) for text legibility.
2. **Frosted pane** — `rounded-2xl border border-white/10 bg-white/[0.05] backdrop-blur-xl`, with a bright top edge + inset depth: `shadow-[inset_0_1px_0_rgba(255,255,255,0.28),inset_0_-1px_0_rgba(0,0,0,0.35)]`.
3. **Specular sheen** (interactive surfaces) — a hover sweep: a `-translate-x-full … group-hover:translate-x-full` gradient `via-white/15`, with `motion-reduce:hidden`.
4. **Content** — crisp foreground hero (logo/title); data shown as accent-stroked **progress rings** + bold `tabular-nums` numbers.

- **Interaction:** `group` wrapper + `hover:-translate-y-0.5` lift + soft drop shadow; `focus-visible:ring-2 ring-[var(--primary)]`. Guard **all** motion with `motion-reduce:`.
- **Accent:** violet `var(--primary)`. White text on glass + `drop-shadow` for contrast. (The old gold `--accent`/`#e0b341` is retired; `--accent` now aliases `--primary`.)
- **Never** set a self-referential CSS var (`style={{ "--accent": "var(--accent,…)" }}`) — it infinite-loops happy-dom and hangs `bun test`. Use a concrete color.
