# Pricing PR 4b — Portfolio Snapshots (Value Over Time) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record a daily local snapshot of the collection's total market value and render a value-over-time chart on the vault hero — completing the pricing feature. Local-first: snapshots accrue in IndexedDB as each new daily price blob lands, and the vault chart shows the portfolio's history.

**Architecture:** A `Snapshot` entity (DB-ready: uuidv7 id + `updatedAt`/`deletedAt` tombstones) is stored via a standalone `SnapshotsRepo` (its own IDB store + singleton — deliberately NOT in the `UserlandRepos` aggregator, because snapshots are local-derived and not part of the collection/binder/profile sync surface; this keeps the sync layer and every repo-bundle constructor untouched). `useUserland` gains a `snapshots` slice hydrated on load. A `captureSnapshot` action, triggered once per new price-blob `date` when the portfolio market value is known, appends a snapshot (deduped by the blob date). The vault renders `useSnapshots` as a `<SparkLine>` (reusing PR 4a's dependency-free chart), gated by the hide-value toggle, with a "builds daily" note until ≥2 snapshots exist.

**Tech Stack:** TypeScript, React 19, Zustand, idb-keyval, Bun test.

**Spec:** `docs/superpowers/specs/2026-07-03-pricing-implementation-design.md` (§6 History — local portfolio snapshots).

## Global Constraints

- `Snapshot.totalCents` is integer minor units of `Snapshot.currency`; `null` never used for a captured total (a captured snapshot always has a real number — we only capture when market value is known). Every entity field is always present; optional-nullable fields are `null` not `undefined`.
- **DB-ready + sync-ready:** `Snapshot` carries `createdAt`/`updatedAt`/`deletedAt` (tombstone reserved for a future sync adapter) + a uuidv7 id, matching the `Binder`/`Stack` pattern. The Supabase snapshots repo + migration + sync wiring are a **deferred future slice** (cloud snapshots) — this PR ships the LOCAL IDB path only. Do not add a Supabase impl or migration here.
- **Append-only + deduped:** snapshots are immutable historical facts — the repo exposes `list`/`create`/`clear`, no update/remove. Exactly one snapshot per price-blob `date` (the dedup key); a second capture for the same date is a no-op.
- **Not in the backup envelope:** snapshots are local-derived, not part of `UserDataSnapshot` (no `schemaVersion` bump).
- Zustand: subscribe narrow (S3). The capture trigger runs once per (date, marketValue) change. `interface` object shapes, `type` unions. Tabs.
- Reuse PR 4a's `<SparkLine>` (`src/components/ui/spark-line.tsx`, `points: [number, number | null][]`) and `epochDayUtc` (`src/lib/corpus/price-history.ts`). Gate the chart with `useHideValue` (PR 3b-ii). Sparse (<2 points) → a "builds daily" note.
- Tests must not hit the network; snapshots repo runs over `fake-indexeddb` (like the other IDB repos). Reset snapshot state between tests. Lint: `bunx biome check --write --config-path=. <files>` (NOT `bun run lint`). Do NOT `git add -A`. Commit after every task. Final task regenerates `routeTree.gen.ts` then runs `tsc -b` + full `bun test` + biome.

## File Structure

- `src/store/userland/types.ts` — MODIFIED. `Snapshot` + `NewSnapshot`.
- `src/store/userland/repo.ts` — MODIFIED. `SnapshotsRepo` port.
- `src/store/userland/idb-repo.ts` — MODIFIED. `ptcg-snapshots` store, `createIdbSnapshotsRepo`, `getSnapshotsRepo` singleton, `setSnapshotsRepoForTests`, `resetSnapshotsForTests`, `fillSnapshot`.
- `src/store/userland/userland-store.ts` — MODIFIED. `snapshots` slice, hydrate on load, `captureSnapshot` action, `useSnapshots` reader; reset snapshots in `resetUserlandForTests`.
- `src/store/userland/snapshot-capture.ts` — NEW. `useCaptureSnapshot()` trigger hook.
- `src/components/vault/portfolio-chart.tsx` — NEW. The value-over-time chart.
- `src/components/vault/vault-summary.tsx` — MODIFIED. Mount `useCaptureSnapshot()` + render `<PortfolioChart>`.

---

### Task 1: `Snapshot` entity + `SnapshotsRepo` + IDB impl

**Files:**
- Modify: `src/store/userland/types.ts`, `src/store/userland/repo.ts`, `src/store/userland/idb-repo.ts`
- Test: `src/store/userland/snapshots-repo.test.ts` (create)

**Interfaces:**
- Produces:
  - `interface Snapshot { id: string; priceDate: string; capturedAt: number; totalCents: number; currency: string; cardCount: number; createdAt: number; updatedAt: number; deletedAt: number | null }`
  - `type NewSnapshot = Pick<Snapshot, "priceDate" | "totalCents" | "currency" | "cardCount">`
  - `interface SnapshotsRepo { list(): Promise<Snapshot[]>; create(input: NewSnapshot): Promise<Snapshot>; clear(): Promise<void> }`
  - `function createIdbSnapshotsRepo(store?): SnapshotsRepo`, `function getSnapshotsRepo(): SnapshotsRepo`, `function setSnapshotsRepoForTests(r: SnapshotsRepo | null): void`, `async function resetSnapshotsForTests(): Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `src/store/userland/snapshots-repo.test.ts`:

```ts
import { afterEach, expect, test } from "bun:test";
import { getSnapshotsRepo, resetSnapshotsForTests } from "./idb-repo";

afterEach(async () => {
	await resetSnapshotsForTests();
});

test("create then list round-trips a snapshot with minted id + timestamps", async () => {
	const repo = getSnapshotsRepo();
	const snap = await repo.create({
		priceDate: "2026-07-03",
		totalCents: 250000,
		currency: "USD",
		cardCount: 42,
	});
	expect(snap.id).toBeTruthy();
	expect(snap.createdAt).toBeGreaterThan(0);
	expect(snap.updatedAt).toBe(snap.createdAt);
	expect(snap.deletedAt).toBeNull();
	expect(snap.totalCents).toBe(250000);
	const list = await repo.list();
	expect(list.map((s) => s.priceDate)).toEqual(["2026-07-03"]);
});

test("clear empties the store", async () => {
	const repo = getSnapshotsRepo();
	await repo.create({ priceDate: "2026-07-03", totalCents: 1, currency: "USD", cardCount: 1 });
	await repo.clear();
	expect(await repo.list()).toEqual([]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/store/userland/snapshots-repo.test.ts`
Expected: FAIL — `getSnapshotsRepo`/`resetSnapshotsForTests` not exported.

- [ ] **Step 3: Implement**

3a. `types.ts` — add after the `Binder` block (mirror the tombstone shape):

```ts
/** A daily point of the collection's total market value. DB-ready (tombstoned), local-first. */
export interface Snapshot {
	id: string; // uuidv7
	priceDate: string; // YYYY-MM-DD of the price blob captured — the dedup key (one per blob date)
	capturedAt: number; // ms epoch the snapshot was taken
	totalCents: number; // portfolio market value in `currency` minor units
	currency: string; // ISO 4217 display currency at capture
	cardCount: number; // cards owned at capture
	createdAt: number;
	updatedAt: number;
	deletedAt: number | null; // ms epoch tombstone; null = live. Reserved for the sync adapter.
}

/** create() input; repo mints id/timestamps, defaults deletedAt = null. */
export type NewSnapshot = Pick<
	Snapshot,
	"priceDate" | "totalCents" | "currency" | "cardCount"
>;
```

3b. `repo.ts` — add the port (standalone; NOT added to `UserlandRepos`):

```ts
/**
 * Portfolio value-over-time snapshots. Append-only immutable facts — no update/
 * remove. Deliberately separate from UserlandRepos: snapshots are local-derived
 * and not part of the collection/binder/profile sync surface.
 */
export interface SnapshotsRepo {
	list(): Promise<Snapshot[]>;
	create(input: NewSnapshot): Promise<Snapshot>;
	clear(): Promise<void>;
}
```

(import `Snapshot`/`NewSnapshot` from `./types`.)

3c. `idb-repo.ts`:
- Add the store beside the others (~line 29): `const snapshotsStore = createStore("ptcg-snapshots", "snapshots");`
- `fillSnapshot`:
  ```ts
  function fillSnapshot(input: NewSnapshot): Snapshot {
  	const now = Date.now();
  	return {
  		id: uuidv7(),
  		priceDate: input.priceDate,
  		capturedAt: now,
  		totalCents: input.totalCents,
  		currency: input.currency,
  		cardCount: input.cardCount,
  		createdAt: now,
  		updatedAt: now,
  		deletedAt: null,
  	};
  }
  ```
- `createIdbSnapshotsRepo` (mirror `createIdbBindersRepo`, over `entries`/`set`/`clear`):
  ```ts
  export function createIdbSnapshotsRepo(
  	store: UseStore = snapshotsStore,
  ): SnapshotsRepo {
  	return {
  		async list() {
  			const rows = await entries<string, Snapshot>(store);
  			return rows.map(([, v]) => v);
  		},
  		async create(input) {
  			const s = fillSnapshot(input);
  			await set(s.id, s, store);
  			return s;
  		},
  		async clear() {
  			await clear(store);
  		},
  	};
  }
  ```
- Singleton + test hooks (mirror `getRepos`/`setUserlandRepos` but for snapshots):
  ```ts
  let snapshotsRepo: SnapshotsRepo | null = null;
  export function getSnapshotsRepo(): SnapshotsRepo {
  	if (!snapshotsRepo) snapshotsRepo = createIdbSnapshotsRepo();
  	return snapshotsRepo;
  }
  export function setSnapshotsRepoForTests(r: SnapshotsRepo | null): void {
  	snapshotsRepo = r;
  }
  export async function resetSnapshotsForTests(): Promise<void> {
  	await getSnapshotsRepo().clear();
  }
  ```
  (Confirm `entries`, `set`, `clear`, `UseStore` are already imported from `idb-keyval` in this file — they are, used by the binders repo. Import `Snapshot`/`NewSnapshot`/`SnapshotsRepo` as needed.)

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/store/userland/snapshots-repo.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Lint + commit**

```bash
bunx biome check --write --config-path=. src/store/userland/types.ts src/store/userland/repo.ts src/store/userland/idb-repo.ts src/store/userland/snapshots-repo.test.ts
git add src/store/userland/types.ts src/store/userland/repo.ts src/store/userland/idb-repo.ts src/store/userland/snapshots-repo.test.ts
git commit -m "feat(pricing): Snapshot entity + standalone SnapshotsRepo (IDB)"
```

---

### Task 2: `snapshots` slice + `captureSnapshot` action + `useSnapshots`

**Files:**
- Modify: `src/store/userland/userland-store.ts`
- Test: `src/store/userland/userland-store.test.ts` (extend) or a new `snapshots-store.test.ts`

**Interfaces:**
- Consumes: `getSnapshotsRepo`, `resetSnapshotsForTests` (Task 1).
- Produces:
  - `UserlandState` gains `snapshots: Snapshot[]`.
  - `async function captureSnapshot(input: NewSnapshot): Promise<void>` — dedup by `priceDate` (a snapshot already exists for that date → no-op); else `getSnapshotsRepo().create(input)` + commit into state.
  - `function useSnapshots(): Snapshot[]` — the store's snapshots, ascending by `priceDate`.
  - `loadUserland` also hydrates snapshots; `resetUserlandForTests` also resets snapshot state (and calls `resetSnapshotsForTests`).

- [ ] **Step 1: Write the failing tests**

Create `src/store/userland/snapshots-store.test.ts`:

```ts
import { afterEach, expect, test } from "bun:test";
import { resetSnapshotsForTests } from "./idb-repo";
import { setupUserlandTest } from "../../test-utils"; // adjust relative path if needed
import { captureSnapshot, useUserland } from "./userland-store";

afterEach(async () => {
	await resetSnapshotsForTests();
});

test("captureSnapshot appends a snapshot and dedups by priceDate", async () => {
	await setupUserlandTest();
	await captureSnapshot({ priceDate: "2026-07-03", totalCents: 100000, currency: "USD", cardCount: 10 });
	expect(useUserland.getState().snapshots.map((s) => s.priceDate)).toEqual(["2026-07-03"]);
	// same date → no-op
	await captureSnapshot({ priceDate: "2026-07-03", totalCents: 999999, currency: "USD", cardCount: 99 });
	expect(useUserland.getState().snapshots.length).toBe(1);
	expect(useUserland.getState().snapshots[0].totalCents).toBe(100000);
	// new date → appends
	await captureSnapshot({ priceDate: "2026-07-04", totalCents: 110000, currency: "USD", cardCount: 11 });
	expect(useUserland.getState().snapshots.map((s) => s.priceDate)).toEqual(["2026-07-03", "2026-07-04"]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/store/userland/snapshots-store.test.ts`
Expected: FAIL — `captureSnapshot`/`snapshots` slice absent.

- [ ] **Step 3: Implement**

- `UserlandState`: add `snapshots: Snapshot[];`. `initial`: add `snapshots: []`.
- `fetchAll` / `loadUserland`: after loading items/binders/profile, load `snapshots` via `getSnapshotsRepo().list()` and include in the committed state. (Read the existing `fetchAll`+`loadUserland` and thread snapshots through the same commit — snapshots come from `getSnapshotsRepo()`, not `activeRepos()`.)
- `captureSnapshot`:
  ```ts
  /** Append a daily portfolio snapshot; no-op if one already exists for this price date. */
  export async function captureSnapshot(input: NewSnapshot): Promise<void> {
  	if (useUserland.getState().snapshots.some((s) => s.priceDate === input.priceDate)) {
  		return;
  	}
  	const snap = await getSnapshotsRepo().create(input);
  	useUserland.setState((s) => ({
  		snapshots: [...s.snapshots, snap].sort((a, b) => a.priceDate.localeCompare(b.priceDate)),
  	}));
  }
  ```
- `useSnapshots`: `export function useSnapshots(): Snapshot[] { return useUserland((s) => s.snapshots); }` (the slice is kept sorted on write, so this is a stable ascending array).
- `resetUserlandForTests`: also reset `snapshots: []` in the state reset. (Do NOT make it async solely for the repo clear — the test's `afterEach` calls `resetSnapshotsForTests()` for the IDB clear; `resetUserlandForTests` just clears the in-memory slice like it clears items/binders.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/store/userland/snapshots-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Guard the shared store + commit**

Run: `bun test src/store/userland/` (userland-store is imported widely; the additive `snapshots` slice must not break existing store tests).
Expected: PASS.

```bash
bunx biome check --write --config-path=. src/store/userland/userland-store.ts src/store/userland/snapshots-store.test.ts
git add src/store/userland/userland-store.ts src/store/userland/snapshots-store.test.ts
git commit -m "feat(pricing): snapshots store slice + captureSnapshot (deduped) + useSnapshots"
```

---

### Task 3: Capture trigger (`useCaptureSnapshot`)

**Files:**
- Create: `src/store/userland/snapshot-capture.ts`
- Modify: `src/components/vault/vault-summary.tsx` (mount the hook)
- Test: `src/store/userland/snapshot-capture.test.tsx` (create)

**Interfaces:**
- Consumes: `usePricesRuntime` (meta.date), `useCollectionStats` (marketValue/valueCurrency/cardsOwned), `captureSnapshot`.
- Produces: `function useCaptureSnapshot(): void` — an effect that captures a snapshot when a price-blob date is present AND the portfolio market value is known, deduped (captureSnapshot itself dedups by date). Fire-and-forget.

- [ ] **Step 1: Write the failing test**

Create `src/store/userland/snapshot-capture.test.tsx`:

```tsx
import { afterEach, expect, test } from "bun:test";
import { renderHook } from "@testing-library/react";
import { setupUserlandTest } from "../../test-utils";
import { usePricesRuntime, resetPricesRuntimeForTests } from "../corpus/prices-runtime";
import { resetSnapshotsForTests } from "./idb-repo";
import { useCaptureSnapshot } from "./snapshot-capture";
import { useUserland } from "./userland-store";
// seed a priced collection so useCollectionStats().marketValue is non-null:
import { makeStack } from "../../test-utils";

afterEach(async () => {
	await resetPricesRuntimeForTests();
	await resetSnapshotsForTests();
});

test("captures a snapshot once per price-blob date when market value is known", async () => {
	await setupUserlandTest();
	// seed prices: one card $10, fx present; one owned stack of it.
	usePricesRuntime.setState({
		byId: new Map([["base1-4", { tp: { N: [1000, null] } }]]),
		meta: { date: "2026-07-03", sources: { tp: "2026-07-03", cm: null }, fx: { base: "EUR", date: "x", rates: { USD: 1.09 } } },
		status: "ready",
	});
	useUserland.setState({ items: { a: makeStack({ id: "a", cardId: "base1-4", quantity: 1, pricePaid: 400, currency: "USD", condition: "NM", grading: null, printing: null }) } });
	renderHook(() => useCaptureSnapshot());
	await new Promise((r) => setTimeout(r, 20)); // let the fire-and-forget capture settle
	const snaps = useUserland.getState().snapshots;
	expect(snaps.length).toBe(1);
	expect(snaps[0].priceDate).toBe("2026-07-03");
	expect(snaps[0].totalCents).toBe(2000); // $10 × … market value (in display currency)
});
```

(Adapt the exact market-value number to what `useCollectionStats().marketValue` yields for the seeded stack — read the stats hook; the point is a snapshot is captured with the real total, and only once.)

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/store/userland/snapshot-capture.test.tsx`
Expected: FAIL — `useCaptureSnapshot` missing.

- [ ] **Step 3: Implement**

Create `src/store/userland/snapshot-capture.ts`:

```ts
import { useEffect } from "react";
import { usePricesRuntime } from "../corpus/prices-runtime";
import { captureSnapshot } from "./userland-store";
import { useCollectionStats } from "./stats";

/**
 * Capture a daily portfolio snapshot when a new price blob lands and the
 * portfolio market value is known. captureSnapshot dedups by the blob date, so
 * re-renders and repeated mounts never double-capture. Mounted by the vault.
 */
export function useCaptureSnapshot(): void {
	const date = usePricesRuntime((s) => s.meta?.date ?? null);
	const { marketValue, valueCurrency, cardsOwned } = useCollectionStats();
	useEffect(() => {
		if (!date || marketValue === null) return;
		captureSnapshot({
			priceDate: date,
			totalCents: marketValue,
			currency: valueCurrency,
			cardCount: cardsOwned,
		});
	}, [date, marketValue, valueCurrency, cardsOwned]);
}
```

Then in `vault-summary.tsx`, call `useCaptureSnapshot();` near the top (alongside `useEnsurePrices()`).

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/store/userland/snapshot-capture.test.tsx src/components/vault/`
Expected: PASS.

- [ ] **Step 5: Lint + commit**

```bash
bunx biome check --write --config-path=. src/store/userland/snapshot-capture.ts src/components/vault/vault-summary.tsx src/store/userland/snapshot-capture.test.tsx
git add src/store/userland/snapshot-capture.ts src/components/vault/vault-summary.tsx src/store/userland/snapshot-capture.test.tsx
git commit -m "feat(pricing): capture a daily portfolio snapshot per new price blob"
```

---

### Task 4: Vault value-over-time chart (`<PortfolioChart>`)

**Files:**
- Create: `src/components/vault/portfolio-chart.tsx`
- Modify: `src/components/vault/vault-summary.tsx` (render it)
- Test: `src/components/vault/portfolio-chart.test.tsx` (create)

**Interfaces:**
- Consumes: `useSnapshots` (Task 2); `epochDayUtc` (`@/lib/corpus/price-history`); `<SparkLine>`; `useHideValue` (PR 3b-ii); `formatPrice`.
- Produces: `<PortfolioChart />` — renders `useSnapshots()` as a `<SparkLine>` of `[epochDayUtc(priceDate), totalCents]`, with a small header showing the latest value + range. Masked ("•••", no chart) when `hideValue`. `<2` snapshots → a "Portfolio history builds daily." note.

- [ ] **Step 1: Write the failing test**

Create `src/components/vault/portfolio-chart.test.tsx`:

```tsx
import { afterEach, expect, test } from "bun:test";
import { render } from "@testing-library/react";
import { setupUserlandTest } from "@/test-utils";
import { resetSnapshotsForTests } from "@/store/userland/idb-repo";
import { captureSnapshot, useUserland } from "@/store/userland/userland-store";
import { PortfolioChart } from "./portfolio-chart";

afterEach(async () => {
	await resetSnapshotsForTests();
});

async function seedSnaps() {
	await setupUserlandTest();
	await captureSnapshot({ priceDate: "2026-07-01", totalCents: 100000, currency: "USD", cardCount: 5 });
	await captureSnapshot({ priceDate: "2026-07-02", totalCents: 120000, currency: "USD", cardCount: 5 });
	await captureSnapshot({ priceDate: "2026-07-03", totalCents: 115000, currency: "USD", cardCount: 5 });
}

test("renders a spark-line for >=2 snapshots", async () => {
	await seedSnaps();
	const { container } = render(<PortfolioChart />);
	expect(container.querySelector("polyline")).not.toBeNull();
});

test("shows a 'builds daily' note for <2 snapshots", async () => {
	await setupUserlandTest();
	await captureSnapshot({ priceDate: "2026-07-03", totalCents: 100000, currency: "USD", cardCount: 5 });
	const { container, getByText } = render(<PortfolioChart />);
	expect(container.querySelector("polyline")).toBeNull();
	expect(getByText(/builds daily/i)).toBeTruthy();
});

test("masks the chart when hideValue is set", async () => {
	await seedSnaps();
	useUserland.setState({ profile: { ...useUserland.getState().profile, hideValue: true } as never });
	const { container, getByText } = render(<PortfolioChart />);
	expect(container.querySelector("polyline")).toBeNull();
	expect(getByText("•••")).toBeTruthy();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/components/vault/portfolio-chart.test.tsx`
Expected: FAIL — `Cannot find module './portfolio-chart'`.

- [ ] **Step 3: Implement** `<PortfolioChart>`:
- `const snaps = useSnapshots(); const hidden = useHideValue();`
- Points: `snaps.map((s) => [epochDayUtc(s.priceDate), s.totalCents] as [number, number])`.
- `hidden` → a small panel showing "•••" (no chart). `snaps.length < 2` → a `text-(--faint)` "Portfolio history builds daily." note. Else a header ("Portfolio value" + latest `formatPrice(snaps.at(-1).totalCents, snaps.at(-1).currency)`) + `<SparkLine points={points} width={...} height={...} />`. Compose the vault's Liquid-Glass tokens (font-mono tabular-nums, --primary line, --faint labels); guard motion with motion-reduce.
- In `vault-summary.tsx`, render `<PortfolioChart />` in the hero (below the stats row).

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/components/vault/portfolio-chart.test.tsx src/components/vault/`
Expected: PASS.

- [ ] **Step 5: Lint + commit**

```bash
bunx biome check --write --config-path=. src/components/vault/portfolio-chart.tsx src/components/vault/vault-summary.tsx src/components/vault/portfolio-chart.test.tsx
git add src/components/vault/portfolio-chart.tsx src/components/vault/vault-summary.tsx src/components/vault/portfolio-chart.test.tsx
git commit -m "feat(pricing): vault portfolio value-over-time chart"
```

---

### Task 5: Final verification gate + browser smoke

**Files:** none (verification only)

- [ ] **Step 1: Regenerate route tree, run all gates**

```bash
nohup bunx vite dev --port 6301 >/tmp/pr4b-rg.log 2>&1 & VP=$!; sleep 8; kill $VP 2>/dev/null
```

Then in parallel: `bunx tsc -b`; `bun test`; `bunx biome check --config-path=. src/store/userland/types.ts src/store/userland/repo.ts src/store/userland/idb-repo.ts src/store/userland/userland-store.ts src/store/userland/snapshot-capture.ts src/components/vault/`.

Expected: tsc 0; full suite green (baseline 1573 + new tests); biome clean. Then `rm -f src/routeTree.gen.ts`.

- [ ] **Step 2: Browser smoke** — boot the dev server, open the vault; the portfolio chart shows the "builds daily" note (day-0 state, since only one snapshot captures on first load), no console errors. (If preview can't bind the worktree, rely on component tests + note it.)

- [ ] **Step 3: Fix anything red, re-run, commit. Confirm `git status --short` clean (no lockfile drift, no new deps).**

## Self-Review Notes (plan author)

- **Spec coverage (§6 local snapshots):** Snapshot entity + repo (T1), store + dedup capture (T2), capture-on-new-blob-date trigger (T3), vault value-over-time chart (T4). This completes the pricing feature.
- **Standalone SnapshotsRepo (not in UserlandRepos):** deliberate — snapshots are local-derived, not part of the collection/binder/profile sync surface, so keeping them out of the aggregator avoids touching every repo-bundle constructor + the sync layer. The entity is still DB-ready (tombstoned + uuidv7); a Supabase snapshots repo + migration + sync wiring is a tracked FUTURE slice (cloud snapshots), out of this PR's "local" scope.
- **Dedup by price-blob date** = exactly one snapshot per daily blob; the trigger + the action both no-op on a repeat, so re-renders/remounts are safe.
- **Not in backup envelope** (no schemaVersion bump); snapshots re-accrue if lost (day-0 UX is the "builds daily" note, honest like PR 4a).
- **Reuse:** `<SparkLine>` + `epochDayUtc` from PR 4a, `useHideValue` from PR 3b-ii — no new primitives, no new deps.
- **Type consistency:** `Snapshot`/`NewSnapshot`/`SnapshotsRepo`/`getSnapshotsRepo`/`captureSnapshot`/`useSnapshots`/`useCaptureSnapshot`/`<PortfolioChart>` used identically across tasks.
