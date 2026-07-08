# Pricing PR 4a — Card Price History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Card Pricing tab's "Price history. Coming soon." placeholder into a real price-history chart with a range toggle, backed by per-set history rollups that accrue daily on R2 — plus immediate trend chips (1d/7d/30d) from the live blob so the surface is useful on day one before history accrues.

**Architecture:** A new daily builder (`scripts/build-history.ts`, a workflow step after the price-blob upload) reads the corpus (for `cardId → setId`), today's price blob, and each set's *prior* rollup from R2, appends today's representative USD market point per card, downsamples (daily ≤90 days, weekly beyond), and writes per-set rollup blobs `corpus/prices/history/{setId}.json.gz`. The worker serves them at `/corpus-prices/history/{setId}` (cloning the `/corpus-prices` R2+ETag pattern). A client history runtime lazily fetches + caches a set's rollup (mirroring the i18n per-language lane); the Pricing tab renders a custom SVG line chart (mirroring `ProgressRing`'s no-dependency SVG approach) with 30d/3m/6m/1y ranges, plus trend chips from the live blob's cardmarket avg1/avg7/avg30 tuple.

**Tech Stack:** Bun (scripts + tests), TypeScript, React 19, Zustand, idb-keyval, Cloudflare Worker + R2, GitHub Actions, custom SVG (no charting dep), Tailwind v4 (Liquid Glass tokens).

**Spec:** `docs/superpowers/specs/2026-07-03-pricing-implementation-design.md` (§6 History).

## Global Constraints

- Money is **integer minor units (USD cents)** in history points; `null` = no market that day (a gap, not zero). History points are `[epochDayUtc: number, marketCentsUsd: number | null]`.
- **Representative daily market** per card = tcgplayer market via finish fallback Holofoil→Normal (USD), else cardmarket trend (EUR) → USD via the blob's FX table; null when unpriced. One number per card per day.
- **Keep-last-good + idempotent:** the history builder must never lose prior points; re-running on the same UTC day must not double-append (replace the same-day point). A missing/unreadable prior rollup starts fresh, never crashes the run.
- **Downsample:** keep one point per day for the last 90 days; one point per ISO week beyond that. Bounds blob size as history grows.
- Blob/route serving mirrors `/corpus-prices` exactly (R2 + ETag + conditional GET 304 + edge cache + SWR). Client runtime mirrors the i18n per-language lane (lazy fetch, IDB cache, injectable fetchers, network-free tests).
- Custom SVG only — **no charting dependency** (the repo has none; `ProgressRing` is the pattern). Guard all motion with `motion-reduce:`.
- `interface` object shapes, `type` unions/tuples. Tabs. `null` not `undefined`. Tests must not hit the network (inject fetchers / pre-seed stores; pre-seed `useCorpusRuntime` for any card grid).
- Lint: `bunx biome check --write --config-path=. <files>` (NOT `bun run lint`). Do NOT `git add -A`. Commit after every task. Final task regenerates `routeTree.gen.ts` then runs `tsc -b` + full `bun test` + biome.

## File Structure

- `src/lib/corpus/price-history.ts` — NEW. History types + pure functions (`representativeMarketUsdCents`, `epochDayUtc`, `appendDailyPoint`, `downsample`).
- `scripts/build-history.ts` — NEW. Daily per-set rollup builder (pure `buildSetHistories` + fetch orchestration + entrypoint).
- `.github/workflows/build-prices.yml` — MODIFIED. A history-build + upload step after the price-blob upload.
- `worker/src/index.ts` — MODIFIED. `/corpus-prices/history/{setId}` route.
- `src/store/corpus/history-store.ts` + `history-runtime.ts` — NEW. Per-set history IDB cache + runtime (lazy fetch, `useSetHistory`/`useCardHistory`).
- `src/components/ui/spark-line.tsx` — NEW. Custom SVG line chart.
- `src/components/card/card-history.tsx` — NEW. The Pricing-tab history body (chart + range toggle + trend chips).
- `src/components/card/card-pricing-tab.tsx` — MODIFIED. Swap the "coming soon" placeholder for `<CardHistory>`.

---

### Task 1: History types + pure functions (`src/lib/corpus/price-history.ts`)

**Files:**
- Create: `src/lib/corpus/price-history.ts`
- Test: `src/lib/corpus/price-history.test.ts`

**Interfaces:**
- Consumes: `CardPriceEntry`, `FinishCode`, `FxTable` (`./price-types`); `convertMinorUnits` (`./fx`).
- Produces:
  - `type HistoryPoint = [epochDay: number, marketCentsUsd: number | null]`
  - `type SetHistory = Record<string, HistoryPoint[]>` (cardId → points, ascending by day)
  - `function epochDayUtc(dateYmd: string): number` — days since epoch for a `YYYY-MM-DD` UTC date.
  - `function representativeMarketUsdCents(entry: CardPriceEntry | null, fx: FxTable | null): number | null`
  - `function appendDailyPoint(points: HistoryPoint[], day: number, value: number | null): HistoryPoint[]` — append, or replace the last point if it is the same day (idempotent).
  - `function downsample(points: HistoryPoint[], todayDay: number): HistoryPoint[]` — daily within 90d of `todayDay`; one point per ISO-ish week (7-day bucket) beyond.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/corpus/price-history.test.ts`:

```ts
import { expect, test } from "bun:test";
import type { CardPriceEntry, FxTable } from "./price-types";
import {
	appendDailyPoint,
	downsample,
	epochDayUtc,
	representativeMarketUsdCents,
} from "./price-history";

const fx: FxTable = { base: "EUR", date: "x", rates: { USD: 1.09 } };

test("epochDayUtc counts UTC days since epoch", () => {
	expect(epochDayUtc("1970-01-01")).toBe(0);
	expect(epochDayUtc("1970-01-02")).toBe(1);
	expect(epochDayUtc("2026-07-03")).toBe(Math.floor(Date.UTC(2026, 6, 3) / 86400000));
});

test("representativeMarketUsdCents prefers tcgplayer H→N, else cardmarket→USD", () => {
	expect(representativeMarketUsdCents({ tp: { H: [72034, 1], N: [700, 1] } }, fx)).toBe(72034);
	expect(representativeMarketUsdCents({ tp: { N: [700, 1] } }, fx)).toBe(700);
	// cardmarket trend €10.00 → $10.90
	expect(representativeMarketUsdCents({ cm: [1000, null, null, null] }, fx)).toBe(1090);
	expect(representativeMarketUsdCents(null, fx)).toBeNull();
	expect(representativeMarketUsdCents({}, fx)).toBeNull();
});

test("appendDailyPoint appends a new day, replaces the same day (idempotent)", () => {
	const a = appendDailyPoint([], 100, 500);
	expect(a).toEqual([[100, 500]]);
	const b = appendDailyPoint(a, 101, 510);
	expect(b).toEqual([[100, 500], [101, 510]]);
	// same day again → replace, not duplicate
	const c = appendDailyPoint(b, 101, 520);
	expect(c).toEqual([[100, 500], [101, 520]]);
});

test("downsample keeps daily within 90d, weekly beyond", () => {
	const today = 1000;
	// points every day for 200 days ending today
	const points: [number, number | null][] = [];
	for (let d = today - 199; d <= today; d++) points.push([d, d]);
	const out = downsample(points, today);
	// all points within [today-90, today] preserved (91 daily points)
	const recent = out.filter(([d]) => d > today - 90);
	expect(recent.length).toBe(90);
	// older points collapsed to ≤ 1 per 7-day bucket → far fewer than the ~110 raw
	const older = out.filter(([d]) => d <= today - 90);
	expect(older.length).toBeLessThan(20);
	// output stays ascending
	expect(out.map(([d]) => d)).toEqual([...out.map(([d]) => d)].sort((x, y) => x - y));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/lib/corpus/price-history.test.ts`
Expected: FAIL — `Cannot find module './price-history'`

- [ ] **Step 3: Write the implementation**

Create `src/lib/corpus/price-history.ts`:

```ts
// Price-history types + pure helpers. Shared by scripts/build-history.ts (the
// daily rollup builder) and the client history runtime/chart. A history point
// is [UTC epoch-day, representative USD-cents market], null value = a gap.
import { convertMinorUnits } from "./fx";
import type { CardPriceEntry, FinishCode, FxTable } from "./price-types";

export type HistoryPoint = [epochDay: number, marketCentsUsd: number | null];
/** cardId → points, ascending by day. */
export type SetHistory = Record<string, HistoryPoint[]>;

const MS_PER_DAY = 86_400_000;
/** Daily points are kept within this many days of "today"; older collapse to weekly. */
const DAILY_WINDOW = 90;

/** UTC days since epoch for a YYYY-MM-DD date. */
export function epochDayUtc(dateYmd: string): number {
	const [y, m, d] = dateYmd.split("-").map(Number);
	return Math.floor(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

/** Finish fallback order for the representative market (mirrors valuation). */
const MARKET_FINISHES: FinishCode[] = ["H", "N"];

/**
 * One representative USD-cents market for a card on a given day: tcgplayer
 * market via Holofoil→Normal, else cardmarket trend (EUR) converted to USD.
 * null when unpriced or FX can't reach USD.
 */
export function representativeMarketUsdCents(
	entry: CardPriceEntry | null,
	fx: FxTable | null,
): number | null {
	if (!entry) return null;
	if (entry.tp) {
		for (const f of MARKET_FINISHES) {
			const pair = entry.tp[f];
			if (pair && pair[0] !== null) return pair[0];
		}
	}
	if (entry.cm && entry.cm[0] !== null && fx) {
		return convertMinorUnits(entry.cm[0], "EUR", "USD", fx);
	}
	return null;
}

/**
 * Append today's point, or replace the last point when it is the same day
 * (so re-running the builder on the same UTC day is idempotent, never doubles).
 */
export function appendDailyPoint(
	points: HistoryPoint[],
	day: number,
	value: number | null,
): HistoryPoint[] {
	const last = points[points.length - 1];
	if (last && last[0] === day) {
		return [...points.slice(0, -1), [day, value]];
	}
	return [...points, [day, value]];
}

/**
 * Keep one point per day within DAILY_WINDOW of `todayDay`; collapse older
 * points to one per 7-day bucket (the last point in each bucket wins). Input
 * and output are ascending by day.
 */
export function downsample(
	points: HistoryPoint[],
	todayDay: number,
): HistoryPoint[] {
	const cutoff = todayDay - DAILY_WINDOW;
	const recent: HistoryPoint[] = [];
	const weekly = new Map<number, HistoryPoint>();
	for (const p of points) {
		if (p[0] > cutoff) recent.push(p);
		else weekly.set(Math.floor(p[0] / 7), p); // last write per bucket wins
	}
	const older = [...weekly.values()].sort((a, b) => a[0] - b[0]);
	return [...older, ...recent];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/lib/corpus/price-history.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Lint + commit**

```bash
bunx biome check --write --config-path=. src/lib/corpus/price-history.ts src/lib/corpus/price-history.test.ts
git add src/lib/corpus/price-history.ts src/lib/corpus/price-history.test.ts
git commit -m "feat(pricing): price-history types + pure rollup helpers (append/downsample/representative)"
```

---

### Task 2: Per-set rollup builder (`scripts/build-history.ts`)

**Files:**
- Create: `scripts/build-history.ts`
- Test: `scripts/build-history.test.ts`

**Interfaces:**
- Consumes: Task 1's helpers; `PricesBlob`, `FxTable` (`src/lib/corpus/price-types`).
- Produces:
  - `function buildSetHistories(input: { blob: PricesBlob; cardToSet: Map<string, string>; priorBySet: Map<string, SetHistory>; todayDay: number }): Map<string, SetHistory>` — the pure core: for each priced card, append its representative market to its set's rollup (idempotent), downsample, keyed by setId. Cards with no setId or no market are skipped.
  - Entrypoint: reads `prices.json.gz` (today's blob, written by build-prices), a corpus card→set map from `corpus.json.gz`/`corpus.asia.json.gz` (fetched by the workflow), and each set's prior rollup from a local `history/` dir (fetched from R2 by the workflow), then writes each set's new rollup gz to `history/{setId}.json.gz`.

- [ ] **Step 1: Write the failing tests**

Create `scripts/build-history.test.ts`:

```ts
import { expect, test } from "bun:test";
import type { PricesBlob } from "../src/lib/corpus/price-types";
import type { SetHistory } from "../src/lib/corpus/price-history";
import { buildSetHistories } from "./build-history";

const fx = { base: "EUR" as const, date: "x", rates: { USD: 1.09 } };
const blob: PricesBlob = {
	v: 1,
	date: "2026-07-03",
	fx,
	sources: { tp: "2026-07-03", cm: "2026-07-03" },
	cards: {
		"base1-4": { tp: { H: [72034, 1] } },
		"base1-2": { cm: [1000, null, null, null] }, // €10 → $10.90
		"sv1-5": { tp: { N: [500, 1] } },
	},
};
const cardToSet = new Map([
	["base1-4", "base1"],
	["base1-2", "base1"],
	["sv1-5", "sv1"],
]);

test("buildSetHistories groups by set and appends today's representative market", () => {
	const out = buildSetHistories({ blob, cardToSet, priorBySet: new Map(), todayDay: 100 });
	expect(out.get("base1")).toEqual({
		"base1-4": [[100, 72034]],
		"base1-2": [[100, 1090]],
	});
	expect(out.get("sv1")).toEqual({ "sv1-5": [[100, 500]] });
});

test("buildSetHistories appends onto a prior rollup, idempotent on same day", () => {
	const prior = new Map<string, SetHistory>([
		["base1", { "base1-4": [[98, 70000], [99, 71000]] }],
	]);
	const out = buildSetHistories({ blob, cardToSet, priorBySet: prior, todayDay: 100 });
	expect(out.get("base1")?.["base1-4"]).toEqual([[98, 70000], [99, 71000], [100, 72034]]);
	// re-run same day → replaces, no duplicate
	const again = buildSetHistories({ blob, cardToSet, priorBySet: out, todayDay: 100 });
	expect(again.get("base1")?.["base1-4"]).toEqual([[98, 70000], [99, 71000], [100, 72034]]);
});

test("buildSetHistories skips cards with no setId or no market", () => {
	const b2: PricesBlob = { ...blob, cards: { "ghost-1": {}, "base1-4": { tp: { H: [72034, 1] } } } };
	const out = buildSetHistories({ blob: b2, cardToSet, priorBySet: new Map(), todayDay: 100 });
	// ghost-1 not in cardToSet → skipped; base1-4 present
	expect(out.get("base1")).toEqual({ "base1-4": [[100, 72034]] });
	expect([...out.keys()]).toEqual(["base1"]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test scripts/build-history.test.ts`
Expected: FAIL — `Cannot find module './build-history'`

- [ ] **Step 3: Implement**

Create `scripts/build-history.ts`. The pure `buildSetHistories` first (satisfies the tests), then the entrypoint under `if (import.meta.main)`:

```ts
// Daily per-set price-history rollup builder. A workflow step after the price
// blob is built + uploaded: reads today's blob + the corpus card→set map + each
// set's prior rollup, appends today's representative USD market per card,
// downsamples, and writes per-set rollup gz files for upload to R2.
// Spec: docs/superpowers/specs/2026-07-03-pricing-implementation-design.md §6.
import { readFileSync } from "node:fs";
import { mkdirSync, readdirSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";
import type { PricesBlob } from "../src/lib/corpus/price-types";
import {
	appendDailyPoint,
	downsample,
	epochDayUtc,
	representativeMarketUsdCents,
	type SetHistory,
} from "../src/lib/corpus/price-history";

export function buildSetHistories(input: {
	blob: PricesBlob;
	cardToSet: Map<string, string>;
	priorBySet: Map<string, SetHistory>;
	todayDay: number;
}): Map<string, SetHistory> {
	const { blob, cardToSet, priorBySet, todayDay } = input;
	const out = new Map<string, SetHistory>();
	// Seed with a shallow copy of each prior rollup so untouched cards persist.
	for (const [setId, hist] of priorBySet) out.set(setId, { ...hist });

	for (const [cardId, entry] of Object.entries(blob.cards)) {
		const setId = cardToSet.get(cardId);
		if (!setId) continue;
		const value = representativeMarketUsdCents(entry, blob.fx);
		if (value === null) continue;
		const hist = out.get(setId) ?? {};
		hist[cardId] = appendDailyPoint(hist[cardId] ?? [], todayDay, value);
		out.set(setId, hist);
	}

	// Downsample every touched set (bounds blob growth).
	for (const [setId, hist] of out) {
		const ds: SetHistory = {};
		for (const [cardId, points] of Object.entries(hist)) {
			ds[cardId] = downsample(points, todayDay);
		}
		out.set(setId, ds);
	}
	return out;
}

// --- Entrypoint (workflow-run; not exercised by unit tests) ---

interface CorpusCard {
	id: string;
	setId: string;
}

function loadGzJson<T>(path: string): T {
	return JSON.parse(gunzipSync(readFileSync(path)).toString()) as T;
}

function cardToSetFromCorpus(paths: string[]): Map<string, string> {
	const m = new Map<string, string>();
	for (const p of paths) {
		if (!existsSyncSafe(p)) continue;
		const cards = loadGzJson<CorpusCard[]>(p);
		for (const c of cards) if (c.setId) m.set(c.id, c.setId);
	}
	return m;
}

function existsSyncSafe(p: string): boolean {
	try {
		readFileSync(p);
		return true;
	} catch {
		return false;
	}
}

if (import.meta.main) {
	const blob = loadGzJson<PricesBlob>("prices.json.gz");
	const cardToSet = cardToSetFromCorpus(["corpus.json.gz", "corpus.asia.json.gz"]);

	// Prior rollups: the workflow fetches existing corpus/prices/history/*.json.gz
	// into ./history-prior/. Missing dir → first-ever run, start fresh.
	const priorBySet = new Map<string, SetHistory>();
	try {
		for (const f of readdirSync("history-prior")) {
			if (!f.endsWith(".json.gz")) continue;
			const setId = f.replace(/\.json\.gz$/, "");
			priorBySet.set(setId, loadGzJson<SetHistory>(`history-prior/${f}`));
		}
	} catch {
		// no prior dir — first run
	}

	const todayDay = epochDayUtc(blob.date);
	const built = buildSetHistories({ blob, cardToSet, priorBySet, todayDay });

	mkdirSync("history", { recursive: true });
	let setCount = 0;
	for (const [setId, hist] of built) {
		await Bun.write(`history/${setId}.json.gz`, gzipSync(Buffer.from(JSON.stringify(hist))));
		setCount++;
	}
	console.log(
		`history: ${setCount} set rollups written (${cardToSet.size} card→set, blob date ${blob.date})`,
	);
}
```

Note: `mkdirSync`/`readdirSync` are imported from `node:fs` (fold into the one import). Keep `existsSyncSafe` simple as shown, or use `node:fs existsSync` — either is fine as long as it's imported.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test scripts/build-history.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Lint + commit**

```bash
bunx biome check --write --config-path=. scripts/build-history.ts scripts/build-history.test.ts
git add scripts/build-history.ts scripts/build-history.test.ts
git commit -m "feat(pricing): daily per-set price-history rollup builder"
```

---

### Task 3: Workflow step — build + upload history rollups

**Files:**
- Modify: `.github/workflows/build-prices.yml`

**Interfaces:** consumes the price blob + corpus + prior rollups from R2; produces `corpus/prices/history/{setId}.json.gz` on R2.

- [ ] **Step 1: Add the history step after the price-blob upload**

In `build-prices.yml`, after the existing "Upload to R2" step (which uploads `prices.json.gz`/`meta.json`/archive), add steps to (a) fetch the corpus + prior rollups, (b) run the builder, (c) upload the new rollups. Read the existing steps first and mirror the wrangler auth/env exactly. Illustrative shape:

```yaml
      - name: Fetch corpus + prior history for rollups
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
        run: |
          bunx wrangler r2 object get pokemon-tcg-corpus/corpus/latest.json.gz --file=corpus.json.gz --remote || true
          bunx wrangler r2 object get pokemon-tcg-corpus/corpus/region/asia/latest.json.gz --file=corpus.asia.json.gz --remote || true
          mkdir -p history-prior
          # Prior rollups: list + fetch existing per-set history blobs (best-effort; empty on first run).
          bunx wrangler r2 object get ... # see note below
      - name: Build history rollups
        run: bun run scripts/build-history.ts
      - name: Upload history rollups
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
        run: |
          for f in history/*.json.gz; do
            [ -e "$f" ] || continue
            name=$(basename "$f")
            bunx wrangler r2 object put "pokemon-tcg-corpus/corpus/prices/history/$name" --file="$f" --remote
          done
```

**Fetching prior rollups:** wrangler r2 has no simple bulk "get all under prefix" in one call. Use `bunx wrangler r2 object get` per set is impractical without a list. Simplest robust approach: skip fetching priors in CI for the FIRST implementation and let the builder treat a missing `history-prior/` as a fresh start — BUT that would reset history daily. Instead, the plan's real approach: after `wrangler r2 object list` (if available in the installed wrangler) pipe the `corpus/prices/history/` keys and `get` each into `history-prior/`. Check the installed wrangler's `r2 object list` support first; if `r2 object list` is unavailable, the builder can instead read yesterday's per-set rollups by listing the keys via the R2 S3 API or by maintaining a manifest. Implement whichever the installed wrangler supports; document the chosen mechanism in a comment. Verify: `bunx wrangler r2 object list --help` (does the installed version support it?). If neither list nor a manifest is feasible in this task's scope, ship the builder + upload with a **manifest file** approach: also upload `corpus/prices/history/_index.json` (the list of set ids written today) and fetch-by-manifest next run.

(This is the one genuinely fiddly part of PR4a — resolve it concretely against the installed wrangler; do not hand-wave. If it can't be made robust in CI within this task, land the builder + route + client (Tasks 2/4/5/6/7) so history is fully wired, and open a tracked follow-up to enable the daily append in CI — the machinery works, only the CI prior-fetch needs the list/manifest mechanism.)

- [ ] **Step 2: Validate YAML**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/build-prices.yml')); print('yaml ok')"`

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/build-prices.yml
git commit -m "ci(pricing): build + upload per-set price-history rollups daily"
```

---

### Task 4: Worker route `/corpus-prices/history/{setId}`

**Files:**
- Modify: `worker/src/index.ts`
- Test: `worker/src/index.test.ts` (extend the CORPUS fake + append tests)

**Interfaces:** serves R2 `corpus/prices/history/{setId}.json.gz` with ETag/304/SWR (clone `/corpus-prices`).

- [ ] **Step 1: Write the failing tests**

Add to the `CORPUS.get` fake (before `return null`):

```ts
		if (key === "corpus/prices/history/base1.json.gz")
			return { body: "HISTORY_GZ", etag: "histtag" };
```

Append tests mirroring the `/corpus-prices` tests: `/corpus-prices/history/base1` → 200 + ETag `"histtag"` + SWR; 304 on matching If-None-Match; 503 for an unbuilt set (`corpus/prices/history/nope.json.gz` → null). Match the file's exact `worker.fetch` env/ctx conventions (read the surrounding tests).

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test worker/src/index.test.ts`
Expected: FAIL — no history route.

- [ ] **Step 3: Implement the route**

In `worker/src/index.ts`, after the `/corpus-prices` block, add a regex-matched route (mirror the i18n `match` style):

```ts
		const historyMatch = url.pathname.match(
			/^\/corpus-prices\/history\/([^/]+)$/,
		);
		if (historyMatch) {
			const setId = historyMatch[1];
			const obj = await env.CORPUS.get(`corpus/prices/history/${setId}.json.gz`);
			if (!obj) {
				return new Response("No history for set", {
					status: 503,
					headers: corsHeaders(env),
				});
			}
			const res = new Response(obj.body, {
				headers: {
					"Content-Type": "application/octet-stream",
					ETag: `"${obj.etag}"`,
					"Cache-Control":
						"public, s-maxage=3600, stale-while-revalidate=86400",
				},
			});
			return serveCorpus(res, request, env);
		}
```

Place it BEFORE the bare `/corpus-prices` exact-match check only if that check uses a prefix; with the existing `=== "/corpus-prices"` exact match, order is safe either way — put the history match adjacent to the other `/corpus-prices` blocks.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test worker/src/index.test.ts`
Expected: PASS (all existing + 3 new)

- [ ] **Step 5: Lint + commit**

```bash
bunx biome check --write --config-path=. worker/src/index.ts worker/src/index.test.ts
git add worker/src/index.ts worker/src/index.test.ts
git commit -m "feat(pricing): worker route for per-set price-history rollups"
```

---

### Task 5: Client history runtime (`history-store.ts` + `history-runtime.ts`)

**Files:**
- Create: `src/store/corpus/history-store.ts`, `src/store/corpus/history-runtime.ts`
- Test: `src/store/corpus/history-runtime.test.ts`

**Interfaces:** mirror the i18n per-language lane, keyed by setId.
- Produces:
  - `history-store.ts`: `readHistoryGz(setId)`, `writeHistory(setId, gz)`, `clearHistory(setId)` over an IDB store `ptcg-corpus-prices-history` (keyed `gz:{setId}`).
  - `history-runtime.ts`: `useHistoryRuntime` (Zustand: `bySet: Map<setId, SetHistory>`, status per set), `loadSetHistory(setId)` (IDB-first, network fallback, deduped), `setHistoryFetchersForTests`, `useCardHistory(cardId, setId): HistoryPoint[] | null` (narrow S3 read), `resetHistoryRuntimeForTests`.

- [ ] **Step 1: Write the failing test**

Create `src/store/corpus/history-runtime.test.ts`:

```ts
import { afterEach, expect, test } from "bun:test";
import { gzipSync } from "node:zlib";
import type { SetHistory } from "@/lib/corpus/price-history";
import {
	loadSetHistory,
	resetHistoryRuntimeForTests,
	setHistoryFetchersForTests,
	useHistoryRuntime,
} from "./history-runtime";

const HIST: SetHistory = { "base1-4": [[100, 70000], [101, 72034]] };
function gz(h: SetHistory): ArrayBuffer {
	const b = gzipSync(Buffer.from(JSON.stringify(h)));
	return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

afterEach(async () => {
	await resetHistoryRuntimeForTests();
});

test("loadSetHistory fetches, caches, and exposes a set's history", async () => {
	setHistoryFetchersForTests({ fetchHistory: async () => gz(HIST) });
	await loadSetHistory("base1");
	expect(useHistoryRuntime.getState().bySet.get("base1")).toEqual(HIST);
});

test("loadSetHistory is idempotent per set", async () => {
	let fetches = 0;
	setHistoryFetchersForTests({
		fetchHistory: async () => {
			fetches++;
			return gz(HIST);
		},
	});
	await loadSetHistory("base1");
	await loadSetHistory("base1");
	expect(fetches).toBe(1);
});

test("a 503 (no history for set) resolves to empty, not an error crash", async () => {
	setHistoryFetchersForTests({
		fetchHistory: async () => {
			throw new Response(null, { status: 503 });
		},
	});
	await loadSetHistory("nope");
	// unavailable → no entry, no throw
	expect(useHistoryRuntime.getState().bySet.get("nope")).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/store/corpus/history-runtime.test.ts`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement** (mirror `i18n-store.ts` + `i18n-runtime.ts`, keyed by setId; read those first). `history-store.ts` uses `createStore("ptcg-corpus-prices-history", "blob")` + `gz:{setId}` keys. `history-runtime.ts`: injectable `fetchHistory(setId)` (real: `fetch(`${apiBase()}/corpus-prices/history/${setId}`)`, 503 → an `Unavailable` marker), `loadSetHistory` (IDB-first, dedupe via an in-flight map, gunzip via `DecompressionStream`, commit into `bySet`), `useCardHistory(cardId, setId)` = `useHistoryRuntime((s) => s.bySet.get(setId)?.[cardId] ?? null)` (narrow S3). Handle 503 → leave the set absent (no crash).

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/store/corpus/history-runtime.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Lint + commit**

```bash
bunx biome check --write --config-path=. src/store/corpus/history-store.ts src/store/corpus/history-runtime.ts src/store/corpus/history-runtime.test.ts
git add src/store/corpus/history-store.ts src/store/corpus/history-runtime.ts src/store/corpus/history-runtime.test.ts
git commit -m "feat(pricing): client per-set price-history runtime (lazy fetch, IDB cache)"
```

---

### Task 6: Custom SVG line chart (`spark-line.tsx`)

**Files:**
- Create: `src/components/ui/spark-line.tsx`
- Test: `src/components/ui/spark-line.test.tsx`

**Interfaces:**
- Produces: `<SparkLine points={[number, number][]} width height />` — a violet-stroked SVG polyline over the point series, y-scaled to the data min/max, with an optional soft area fill. No dependency (mirror `ProgressRing`). Renders nothing (or a flat baseline) for <2 points.

- [ ] **Step 1: Write the failing test**

Create `src/components/ui/spark-line.test.tsx`:

```tsx
import { expect, test } from "bun:test";
import { render } from "@testing-library/react";
import { SparkLine } from "./spark-line";

test("renders a polyline with a point per datum", () => {
	const { container } = render(
		<SparkLine points={[[0, 100], [1, 200], [2, 150]]} width={120} height={40} />,
	);
	const poly = container.querySelector("polyline");
	expect(poly).not.toBeNull();
	// 3 points → 3 "x,y" pairs in the points attr
	expect(poly?.getAttribute("points")?.trim().split(/\s+/).length).toBe(3);
});

test("renders no polyline for fewer than 2 points", () => {
	const { container } = render(<SparkLine points={[[0, 100]]} width={120} height={40} />);
	expect(container.querySelector("polyline")).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/components/ui/spark-line.test.tsx`
Expected: FAIL — `Cannot find module './spark-line'`

- [ ] **Step 3: Implement** a small SVG component: map each `[x, y]` to viewport coords (x by index or by the x value's range; y inverted, scaled to data min/max with a small padding), emit a `<polyline>` (violet `stroke-(--primary)`, `fill="none"`) + an optional area `<polygon>` at low opacity; `aria-hidden` on the svg with an accessible label/summary on the wrapper. `<2` points → render an empty/placeholder (no polyline). Guard any transition with `motion-reduce:`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/components/ui/spark-line.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: Lint + commit**

```bash
bunx biome check --write --config-path=. src/components/ui/spark-line.tsx src/components/ui/spark-line.test.tsx
git add src/components/ui/spark-line.tsx src/components/ui/spark-line.test.tsx
git commit -m "feat(pricing): dependency-free SVG spark-line chart"
```

---

### Task 7: Card Pricing tab history — chart + range toggle + trend chips

**Files:**
- Create: `src/components/card/card-history.tsx`
- Modify: `src/components/card/card-pricing-tab.tsx`
- Test: `src/components/card/card-history.test.tsx`

**Interfaces:**
- Consumes: `useCardHistory`/`loadSetHistory` (Task 5); `useCardPriceEntry` (prices-runtime, for the cardmarket avg tuple → trend chips); `<SparkLine>` (Task 6); `FocusCardData` (has `id` + `setId`).
- Produces: `<CardHistory card={card} />` — loads the set's history on mount, renders a `<SparkLine>` of the card's points filtered to the selected range (30d/3m/6m/1y toggle), plus trend chips (7d/30d change % from the cardmarket `[trend, avg1, avg7, avg30]` tuple). Empty/sparse history → a "History builds daily" note (the trend chips still show). `card-pricing-tab.tsx` swaps the "coming soon" placeholder for `<CardHistory>`.

- [ ] **Step 1: Write the failing test**

Create `src/components/card/card-history.test.tsx`: seed `useHistoryRuntime.setState({ bySet: new Map([["base1", { "base1-4": [[100,70000],[130,72034]] }]]) })` + `usePricesRuntime` with a cm tuple for the card; render `<CardHistory card={makeFocusCard({ id: "base1-4", setId: "base1" })} />`; assert a `<polyline>` renders (chart present) and a range control (e.g. a "1Y" button) is present. Add a case: empty history for the set → the "builds daily" note renders, no polyline, but trend chips still show. Reset the runtimes in afterEach. Network-free (stub history fetchers / seed the store; pre-seed corpus if a grid is involved — it isn't here).

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/components/card/card-history.test.tsx`
Expected: FAIL — `Cannot find module './card-history'`

- [ ] **Step 3: Implement** `<CardHistory>`:
- `useEffect(() => { loadSetHistory(card.setId); }, [card.setId])`.
- `const points = useCardHistory(card.id, card.setId);` filter to the active range (a `useState<"30d"|"3m"|"6m"|"1y">`), by `epochDayUtc(today) - point[0] <= rangeDays`.
- Render `<SparkLine points={filtered.map(([d, v]) => [d, v ?? previous])} />` (skip/carry nulls sensibly — drop null-value points from the line).
- Range toggle: small pill buttons (mirror an existing segmented control if present; else simple buttons) with `aria-pressed`.
- Trend chips: from `useCardPriceEntry(card.id)?.cm` — compute 7d change = `(trend − avg7)/avg7` and 30d = `(trend − avg30)/avg30`, render as `+3.2%`/`−1.1%` with up/down color (reuse `--success`/`--danger`); omit a chip when its avg is null.
- Sparse/empty (`!points || points.length < 2`) → a `text-(--faint)` "Price history builds daily." note in place of the chart; trend chips still render if the cm tuple is present.

Then in `card-pricing-tab.tsx`: replace the `<GlassPanel>…Coming soon.</GlassPanel>` with `<CardHistory card={card} />` (keep the "Price history" section header).

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/components/card/card-history.test.tsx src/components/card/`
Expected: PASS.

- [ ] **Step 5: Lint + commit**

```bash
bunx biome check --write --config-path=. src/components/card/card-history.tsx src/components/card/card-pricing-tab.tsx src/components/card/card-history.test.tsx
git add src/components/card/card-history.tsx src/components/card/card-pricing-tab.tsx src/components/card/card-history.test.tsx
git commit -m "feat(pricing): card price-history chart + range toggle + trend chips"
```

---

### Task 8: Final verification gate + browser smoke

**Files:** none (verification only)

- [ ] **Step 1: Regenerate route tree, run all gates**

```bash
nohup bunx vite dev --port 6301 >/tmp/pr4a-rg.log 2>&1 & VP=$!; sleep 8; kill $VP 2>/dev/null
```

Then in parallel: `bunx tsc -b`; `bun test`; `bunx biome check --config-path=. src/lib/corpus/price-history.ts scripts/build-history.ts worker/src/index.ts src/store/corpus/history-runtime.ts src/store/corpus/history-store.ts src/components/ui/spark-line.tsx src/components/card/card-history.tsx src/components/card/card-pricing-tab.tsx`.

Expected: tsc 0; full suite green (baseline 1549 + new tests); biome clean. Then `rm -f src/routeTree.gen.ts`.

- [ ] **Step 2: Browser smoke** — boot the dev server, open a card's Pricing tab; confirm the history section renders (sparse "builds daily" note + trend chips is the expected day-0 state, since prod history hasn't accrued), no console errors. (If preview tooling can't bind the worktree, rely on the component tests as the gate and note it.)

- [ ] **Step 3: Fix anything red, re-run, commit. Confirm `git status --short` clean (no lockfile drift — no new deps).**

## Self-Review Notes (plan author)

- **Spec coverage (§6):** per-set rollups on R2 (T2/T3), worker route (T4), lazy client history (T5), card chart with ranges (T6/T7), day-1 trend chips without accrual (T7), downsampling daily/weekly (T1). Portfolio value-over-time + local snapshots are **PR 4b** (deliberately out of scope here).
- **The one fiddly bit is T3's prior-rollup fetch in CI** — flagged explicitly with a concrete fallback (manifest file) so the daily append is robust; if it can't be made airtight in this task, the machinery (builder/route/client/chart) still lands and only the CI prior-fetch is a tracked follow-up. The chart works from whatever history R2 holds.
- **No new deps** (custom SVG). **Day-0 UX is honest:** sparse chart + a "builds daily" note + immediate trend chips, exactly the spec's stance.
- **Type consistency:** `HistoryPoint`/`SetHistory`/`representativeMarketUsdCents`/`epochDayUtc`/`appendDailyPoint`/`downsample`/`buildSetHistories`/`useCardHistory`/`loadSetHistory`/`<SparkLine>`/`<CardHistory>` used identically across tasks.
