# Pricing PR 2 — Card Price Surfaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make card market prices go live — a client price-data runtime that caches the daily blob, a real `buildPriceLines`, the Card Pricing tab showing native-currency price lines per source with finish labels + timestamps + attribution deep links, and the `PRICING_ENABLED` flag flipped on.

**Architecture:** A single global price blob (built by PR 1, served at `/corpus-prices`) is fetched once, gunzipped, cached in a dedicated IndexedDB store, and held in a non-persisted Zustand runtime as `Map<cardId, CardPriceEntry>` + blob meta — mirroring the existing i18n/corpus runtime lanes but simpler (one blob, no per-language axis). The Pricing tab's island subscribes per-card (narrow selector, S3), passes the entry to a **pure** `buildPriceLines`, and renders. FX-currency conversion and portfolio valuation are PR 3; history charts are PR 4.

**Tech Stack:** TypeScript, React 19, Zustand, idb-keyval, TanStack Start, Bun test (happy-dom + fake-indexeddb), Tailwind v4 (Liquid Glass tokens).

**Spec:** `docs/superpowers/specs/2026-07-03-pricing-implementation-design.md` (§4 client runtime, §7 UI, §8 licensing).

## Global Constraints

- Money is **integer minor units (cents)**; `null` = unknown (never `undefined`, never 0-as-unknown). Format via `formatPrice(minor, currency)` from `src/store/userland/money.ts` (USD→`$`, EUR→`€`).
- **Tests must not hit the network.** The prices runtime has injectable fetch seams (`setPricesFetchersForTests`); components that render prices pre-seed the runtime store via `usePricesRuntime.setState(...)`. Any test rendering a card grid must also pre-seed `useCorpusRuntime` (project rule).
- **Zustand subscriptions:** subscribe to the narrowest value in the consuming component (S3). The per-card entry selector returns a stable `Map.get` reference (`Object.is`); the two source-date fields use a narrow `useShallow`. Do NOT drill store state through props or wrap wide slices in `useShallow`.
- `interface` for object shapes; `type` only for unions/tuples/aliases.
- Native-currency display only in this PR (tcgplayer = USD, cardmarket = EUR). No `displayCurrency`/FX conversion UI (PR 3).
- **Attribution (licensing):** every tcgplayer surface shows the mandated notice "TCGplayer data — not endorsed or certified by TCGplayer." Every price line links back to the source (a search-result URL satisfies TCGplayer's terms).
- Lint: `bunx biome check --write --config-path=. <files>` (NOT `bun run lint`). Tabs for indent.
- Do NOT `git add -A` — add only the files each task names. Commit after every task.
- Do not run the full suite mid-plan except where a task explicitly flips a global flag; the final task runs `bunx tsc -b` (regenerate `routeTree.gen.ts` first by booting `vite dev` briefly — it is gitignored) + full `bun test` + biome.

## File Structure

- `src/store/corpus/prices-store.ts` — NEW. IDB adapter for the single price blob (gz + meta), `ptcg-corpus-prices` store. Mirrors `i18n-store.ts` minus the per-language keying.
- `src/store/corpus/prices-runtime.ts` — NEW. Non-persisted Zustand runtime + load/download/sync + injectable fetchers + consumer hooks. Mirrors `i18n-runtime.ts` for a single blob.
- `src/lib/price-lines.ts` — MODIFIED. Grow `PriceLine`; rewrite `buildPriceLines` as a pure `(card, entry, meta) → PriceLine[]`.
- `src/components/islands/card-prices.tsx` — MODIFIED. Subscribe to the runtime, render real lines + attribution, load-on-mount.
- `src/components/card/card-pricing-tab.tsx` — MODIFIED. Un-gate the market-prices section (history section stays "coming soon" = PR 4).
- `src/lib/pricing-flag.ts` — MODIFIED. Flip `PRICING_ENABLED` to `true`.

---

### Task 1: Prices IDB store (`prices-store.ts`)

**Files:**
- Create: `src/store/corpus/prices-store.ts`
- Test: `src/store/corpus/prices-store.test.ts`

**Interfaces:**
- Consumes: `idb-keyval` (already a dep, used by `i18n-store.ts`).
- Produces:
  - `interface PricesStoreMeta { date: string; syncedAt: number; count: number }`
  - `function readPricesGz(): Promise<ArrayBuffer | undefined>`
  - `function readPricesMeta(): Promise<PricesStoreMeta | undefined>`
  - `function writePrices(gz: ArrayBuffer, meta: PricesStoreMeta): Promise<void>`
  - `function clearPrices(): Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `src/store/corpus/prices-store.test.ts`:

```ts
import { afterEach, expect, test } from "bun:test";
import {
	clearPrices,
	readPricesGz,
	readPricesMeta,
	writePrices,
} from "./prices-store";

afterEach(async () => {
	await clearPrices();
});

test("writePrices then readPricesGz/Meta roundtrips", async () => {
	const gz = new TextEncoder().encode("PRICES_GZ").buffer;
	await writePrices(gz, { date: "2026-07-03", syncedAt: 111, count: 42 });
	const readGz = await readPricesGz();
	expect(readGz && new TextDecoder().decode(readGz)).toBe("PRICES_GZ");
	expect(await readPricesMeta()).toEqual({
		date: "2026-07-03",
		syncedAt: 111,
		count: 42,
	});
});

test("clearPrices removes both keys", async () => {
	await writePrices(new ArrayBuffer(2), {
		date: "2026-07-03",
		syncedAt: 1,
		count: 1,
	});
	await clearPrices();
	expect(await readPricesGz()).toBeUndefined();
	expect(await readPricesMeta()).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/store/corpus/prices-store.test.ts`
Expected: FAIL — `Cannot find module './prices-store'`

- [ ] **Step 3: Write the implementation**

Create `src/store/corpus/prices-store.ts`:

```ts
import { createStore, del, get, setMany } from "idb-keyval";

// Dedicated IDB store for the daily price blob. Kept out of the persisted
// Zustand blob, exactly like the corpus + i18n blobs. A single global blob
// (not per-language), so fixed keys — no per-lang keying like i18n-store.
const store = createStore("ptcg-corpus-prices", "blob");

export interface PricesStoreMeta {
	/** Build date (YYYY-MM-DD UTC) of the stored blob; the staleness key. */
	date: string;
	/** ms since epoch of the last successful sync. */
	syncedAt: number;
	/** Priced-card count in the stored blob. */
	count: number;
}

const GZ_KEY = "gz";
const META_KEY = "meta";

export function readPricesGz(): Promise<ArrayBuffer | undefined> {
	return get<ArrayBuffer>(GZ_KEY, store);
}

export function readPricesMeta(): Promise<PricesStoreMeta | undefined> {
	return get<PricesStoreMeta>(META_KEY, store);
}

export async function writePrices(
	gz: ArrayBuffer,
	meta: PricesStoreMeta,
): Promise<void> {
	// Atomic: one transaction so a crash can't leave gz without meta.
	await setMany(
		[
			[GZ_KEY, gz],
			[META_KEY, meta],
		],
		store,
	);
}

export async function clearPrices(): Promise<void> {
	await del(GZ_KEY, store);
	await del(META_KEY, store);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/store/corpus/prices-store.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Lint + commit**

```bash
bunx biome check --write --config-path=. src/store/corpus/prices-store.ts src/store/corpus/prices-store.test.ts
git add src/store/corpus/prices-store.ts src/store/corpus/prices-store.test.ts
git commit -m "feat(pricing): IDB store for the client price blob"
```

---

### Task 2: Prices runtime (`prices-runtime.ts`)

**Files:**
- Create: `src/store/corpus/prices-runtime.ts`
- Test: `src/store/corpus/prices-runtime.test.ts`

**Interfaces:**
- Consumes: `apiBase` (`src/lib/api-base-client.ts`); `CardPriceEntry`, `PricesBlob` (`src/lib/corpus/price-types.ts`); Task 1's store fns.
- Produces:
  - `type PricesStatus = "idle" | "loading" | "downloading" | "ready" | "unavailable" | "error"`
  - `const usePricesRuntime` — Zustand store `{ byId: Map<string, CardPriceEntry> | null; meta: PricesMetaState | null; status: PricesStatus }`
  - `interface PricesMetaState { date: string; sources: { tp: string | null; cm: string | null }; fx: PricesBlob["fx"] }`
  - `function loadPrices(): Promise<void>` — IDB-first, network fallback, idempotent
  - `function downloadPrices(): Promise<void>` — fetch + gunzip + persist + commit (deduped)
  - `function syncPrices(): Promise<void>` — ETag/date-revalidate
  - `function setPricesFetchersForTests(f): void`
  - `function useCardPriceEntry(cardId: string): CardPriceEntry | null`
  - `function usePriceSourceDates(): { tpDate: string | null; cmDate: string | null }`
  - `function resetPricesRuntimeForTests(): Promise<void>`

- [ ] **Step 1: Write the failing tests**

Create `src/store/corpus/prices-runtime.test.ts`:

```ts
import { afterEach, expect, test } from "bun:test";
import { gzipSync } from "node:zlib";
import type { PricesBlob } from "../../lib/corpus/price-types";
import {
	downloadPrices,
	loadPrices,
	resetPricesRuntimeForTests,
	setPricesFetchersForTests,
	syncPrices,
	usePricesRuntime,
} from "./prices-runtime";

const BLOB: PricesBlob = {
	v: 1,
	date: "2026-07-03",
	fx: { base: "EUR", date: "2026-07-03", rates: { USD: 1.09 } },
	sources: { tp: "2026-07-03", cm: "2026-07-03" },
	cards: {
		"base1-4": { tp: { H: [72034, 53499] }, cm: [50168, 27674, 40096, 56391] },
	},
};

function gzBlob(blob: PricesBlob): ArrayBuffer {
	const buf = gzipSync(Buffer.from(JSON.stringify(blob)));
	return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

afterEach(async () => {
	await resetPricesRuntimeForTests();
});

test("downloadPrices fetches, gunzips, commits the map + meta", async () => {
	setPricesFetchersForTests({
		fetchVersion: async () => ({ date: "2026-07-03", count: 1, builtAt: "x" }),
		fetchBlob: async () => gzBlob(BLOB),
	});
	await downloadPrices();
	const s = usePricesRuntime.getState();
	expect(s.status).toBe("ready");
	expect(s.byId?.get("base1-4")).toEqual(BLOB.cards["base1-4"]);
	expect(s.meta).toEqual({
		date: "2026-07-03",
		sources: { tp: "2026-07-03", cm: "2026-07-03" },
		fx: BLOB.fx,
	});
});

test("loadPrices is idempotent once ready", async () => {
	let blobFetches = 0;
	setPricesFetchersForTests({
		fetchVersion: async () => ({ date: "2026-07-03", count: 1, builtAt: "x" }),
		fetchBlob: async () => {
			blobFetches++;
			return gzBlob(BLOB);
		},
	});
	await loadPrices();
	await loadPrices();
	expect(blobFetches).toBe(1);
	expect(usePricesRuntime.getState().status).toBe("ready");
});

test("a 503 leaves the runtime 'unavailable', not 'error'", async () => {
	setPricesFetchersForTests({
		fetchVersion: async () => {
			throw new Response(null, { status: 503 });
		},
		fetchBlob: async () => {
			throw new Response(null, { status: 503 });
		},
	});
	await downloadPrices();
	expect(usePricesRuntime.getState().status).toBe("unavailable");
});

test("syncPrices re-downloads when the server date differs", async () => {
	setPricesFetchersForTests({
		fetchVersion: async () => ({ date: "2026-07-03", count: 1, builtAt: "x" }),
		fetchBlob: async () => gzBlob(BLOB),
	});
	await downloadPrices();
	const next: PricesBlob = { ...BLOB, date: "2026-07-04" };
	setPricesFetchersForTests({
		fetchVersion: async () => ({ date: "2026-07-04", count: 1, builtAt: "x" }),
		fetchBlob: async () => gzBlob(next),
	});
	await syncPrices();
	expect(usePricesRuntime.getState().meta?.date).toBe("2026-07-04");
});
```

Note on the 503 seam: the real `fetchVersion`/`fetchBlob` translate an HTTP 503 into an internal "unavailable" signal. The test throws a `Response` with status 503 to stand in for that; the implementation's catch must recognize a 503 (whether it arrives as the internal marker or a thrown `Response`) and set `status: "unavailable"`. Implement the internal marker (below) AND treat a caught `Response`/error whose `.status === 503` as unavailable, so both the real path and this test agree.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/store/corpus/prices-runtime.test.ts`
Expected: FAIL — `Cannot find module './prices-runtime'`

- [ ] **Step 3: Write the implementation**

Create `src/store/corpus/prices-runtime.ts`:

```ts
import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { apiBase } from "../../lib/api-base-client";
import type { CardPriceEntry, PricesBlob } from "../../lib/corpus/price-types";
import {
	clearPrices,
	readPricesGz,
	readPricesMeta,
	writePrices,
} from "./prices-store";

export type PricesStatus =
	| "idle" // not loaded yet
	| "loading" // hydrating from IDB
	| "downloading" // fetching over the network
	| "ready" // blob in memory
	| "unavailable" // server has no blob yet (503) — expected before first build
	| "error";

/** In-memory blob meta (everything except the per-card map). */
export interface PricesMetaState {
	date: string;
	sources: { tp: string | null; cm: string | null };
	fx: PricesBlob["fx"];
}

interface PricesRuntimeState {
	/** cardId → price entry; null before load. */
	byId: Map<string, CardPriceEntry> | null;
	meta: PricesMetaState | null;
	status: PricesStatus;
}

// Non-persisted, like the corpus + i18n runtimes. One global blob.
export const usePricesRuntime = create<PricesRuntimeState>(() => ({
	byId: null,
	meta: null,
	status: "idle",
}));

interface VersionMeta {
	date: string;
	count: number;
	builtAt: string;
}

/** Thrown when the server has no blob yet (503) — an expected pre-launch state. */
class PricesUnavailable extends Error {}

function isUnavailable(e: unknown): boolean {
	return (
		e instanceof PricesUnavailable ||
		(typeof e === "object" && e !== null && "status" in e && (e as { status: unknown }).status === 503)
	);
}

// Injectable network seams so tests never hit the wire (mirrors i18n-runtime).
let fetchVersion = async (): Promise<VersionMeta> => {
	const res = await fetch(`${apiBase()}/corpus-prices/version`, {
		cache: "no-store",
	});
	if (res.status === 503) throw new PricesUnavailable();
	if (!res.ok) throw new Error(`prices version ${res.status}`);
	return (await res.json()) as VersionMeta;
};
let fetchBlob = async (): Promise<ArrayBuffer> => {
	const res = await fetch(`${apiBase()}/corpus-prices`);
	if (res.status === 503) throw new PricesUnavailable();
	if (!res.ok) throw new Error(`prices ${res.status}`);
	return res.arrayBuffer();
};

export function setPricesFetchersForTests(f: {
	fetchVersion: typeof fetchVersion;
	fetchBlob: typeof fetchBlob;
}): void {
	fetchVersion = f.fetchVersion;
	fetchBlob = f.fetchBlob;
}

async function gunzip(buf: ArrayBuffer): Promise<string> {
	const ds = new DecompressionStream("gzip");
	const stream = new Blob([buf]).stream().pipeThrough(ds);
	return await new Response(stream).text();
}

function commit(blob: PricesBlob): void {
	usePricesRuntime.setState({
		byId: new Map(Object.entries(blob.cards)),
		meta: { date: blob.date, sources: blob.sources, fx: blob.fx },
		status: "ready",
	});
}

// De-dupe concurrent downloads (e.g. two tabs mounting at once).
let inFlight: Promise<void> | null = null;

/** Hydrate IDB-first (no network); download once when nothing is stored. Idempotent. */
export async function loadPrices(): Promise<void> {
	const s = usePricesRuntime.getState();
	if (s.status === "ready" || s.status === "loading" || s.status === "downloading")
		return;
	usePricesRuntime.setState({ status: "loading" });
	const meta = await readPricesMeta();
	const gz = meta ? await readPricesGz() : undefined;
	if (meta && gz) {
		commit(JSON.parse(await gunzip(gz)) as PricesBlob);
		return;
	}
	await downloadPrices();
}

/** Download the blob, persist it, commit to memory. Deduped. */
export async function downloadPrices(): Promise<void> {
	if (inFlight) return inFlight;
	const task = (async () => {
		usePricesRuntime.setState({ status: "downloading" });
		try {
			const [{ date, count }, gz] = await Promise.all([
				fetchVersion(),
				fetchBlob(),
			]);
			const blob = JSON.parse(await gunzip(gz)) as PricesBlob;
			await writePrices(gz, { date, syncedAt: Date.now(), count });
			commit(blob);
		} catch (e) {
			usePricesRuntime.setState({
				status: isUnavailable(e) ? "unavailable" : "error",
			});
		}
	})().finally(() => {
		inFlight = null;
	});
	inFlight = task;
	return task;
}

/** Re-download only when the server's blob date differs from the stored one. */
export async function syncPrices(): Promise<void> {
	try {
		const { date } = await fetchVersion();
		const stored = await readPricesMeta();
		if (stored && stored.date === date) {
			if (usePricesRuntime.getState().status !== "ready") await loadPrices();
			return;
		}
		await downloadPrices();
	} catch (e) {
		if (isUnavailable(e))
			usePricesRuntime.setState({ status: "unavailable" });
	}
}

/** Per-card price entry. Stable `Map.get` reference → cheap S3 subscription. */
export function useCardPriceEntry(cardId: string): CardPriceEntry | null {
	return usePricesRuntime((s) => s.byId?.get(cardId) ?? null);
}

/** The two source dates for line timestamps — narrow fixed slice. */
export function usePriceSourceDates(): {
	tpDate: string | null;
	cmDate: string | null;
} {
	return usePricesRuntime(
		useShallow((s) => ({
			tpDate: s.meta?.sources.tp ?? null,
			cmDate: s.meta?.sources.cm ?? null,
		})),
	);
}

export async function resetPricesRuntimeForTests(): Promise<void> {
	await clearPrices();
	inFlight = null;
	usePricesRuntime.setState({ byId: null, meta: null, status: "idle" });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/store/corpus/prices-runtime.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Lint + commit**

```bash
bunx biome check --write --config-path=. src/store/corpus/prices-runtime.ts src/store/corpus/prices-runtime.test.ts
git add src/store/corpus/prices-runtime.ts src/store/corpus/prices-runtime.test.ts
git commit -m "feat(pricing): client price-blob runtime (IDB-cached, ETag-revalidated)"
```

---

### Task 3: Real `buildPriceLines` (pure)

**Files:**
- Modify: `src/lib/price-lines.ts`
- Test: `src/lib/price-lines.test.ts` (replace the stub test)

**Interfaces:**
- Consumes: `FocusCardData` (`src/server/card-mappers.ts`); `CardPriceEntry`, `FinishCode` (`src/lib/corpus/price-types.ts`); `formatPrice` (`src/store/userland/money.ts`).
- Produces:
  - `interface PriceLine { source: "TCGplayer" | "Cardmarket"; finish: string | null; priceLabel: string; url: string; updatedAt: string | null }`
  - `interface PriceLinesMeta { tpDate: string | null; cmDate: string | null }`
  - `function buildPriceLines(card: FocusCardData, entry: CardPriceEntry | null, meta: PriceLinesMeta): PriceLine[]`

- [ ] **Step 1: Write the failing tests**

Replace the entire contents of `src/lib/price-lines.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import type { CardPriceEntry } from "./corpus/price-types";
import { makeFocusCard } from "../test-utils";
import { buildPriceLines } from "./price-lines";

const card = makeFocusCard({ id: "base1-4", name: "Charizard", cardNumber: "4" });
const meta = { tpDate: "2026-07-03", cmDate: "2026-07-02" };

describe("buildPriceLines", () => {
	test("returns [] for a card with no price entry", () => {
		expect(buildPriceLines(card, null, meta)).toEqual([]);
	});

	test("builds a tcgplayer line per finish + a cardmarket line", () => {
		const entry: CardPriceEntry = {
			tp: { N: [700, 400], H: [72034, 53499] },
			cm: [50168, 27674, 40096, 56391],
		};
		const lines = buildPriceLines(card, entry, meta);
		// tcgplayer finishes first (in N,H,R,1H,1N order), then cardmarket.
		expect(lines.map((l) => [l.source, l.finish, l.priceLabel])).toEqual([
			["TCGplayer", "Normal", "$7.00"],
			["TCGplayer", "Holofoil", "$720.34"],
			["Cardmarket", null, "€501.68"],
		]);
		expect(lines[0].updatedAt).toBe("2026-07-03");
		expect(lines[2].updatedAt).toBe("2026-07-02");
	});

	test("tcgplayer line links to a TCGplayer search for the card", () => {
		const entry: CardPriceEntry = { tp: { H: [72034, 53499] } };
		const [line] = buildPriceLines(card, entry, meta);
		expect(line.url).toBe(
			"https://www.tcgplayer.com/search/pokemon/product?q=Charizard%204",
		);
	});

	test("cardmarket line links to a Cardmarket search for the card", () => {
		const entry: CardPriceEntry = { cm: [50168, 27674, 40096, 56391] };
		const [line] = buildPriceLines(card, entry, meta);
		expect(line.source).toBe("Cardmarket");
		expect(line.url).toBe(
			"https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=Charizard",
		);
	});

	test("skips a finish whose market price is null", () => {
		const entry: CardPriceEntry = { tp: { N: [null, 400], H: [72034, null] } };
		const lines = buildPriceLines(card, entry, meta);
		expect(lines.map((l) => l.finish)).toEqual(["Holofoil"]);
	});

	test("skips the cardmarket line when trend is null", () => {
		const entry: CardPriceEntry = { cm: [null, 27674, 40096, 56391] };
		expect(buildPriceLines(card, entry, meta)).toEqual([]);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/lib/price-lines.test.ts`
Expected: FAIL — new signature/behavior not implemented (old `buildPriceLines(card)` returns `[]`).

- [ ] **Step 3: Write the implementation**

Replace the entire contents of `src/lib/price-lines.ts`:

```ts
import { formatPrice } from "@/store/userland/money";
import type { CardPriceEntry, FinishCode } from "./corpus/price-types";
import type { FocusCardData } from "../server/card-mappers";

export interface PriceLine {
	source: "TCGplayer" | "Cardmarket";
	/** Printing label for tcgplayer lines; null for cardmarket (no finish axis). */
	finish: string | null;
	/** Native-currency formatted price (tcgplayer USD, cardmarket EUR). */
	priceLabel: string;
	/** Deep link back to the source (a search result satisfies TCGplayer's terms). */
	url: string;
	/** Source data date (YYYY-MM-DD); null when unknown. */
	updatedAt: string | null;
}

export interface PriceLinesMeta {
	tpDate: string | null;
	cmDate: string | null;
}

/** Stable render order + human label for each tcgplayer finish. */
const FINISH_ORDER: FinishCode[] = ["N", "H", "R", "1H", "1N"];
const FINISH_LABEL: Record<FinishCode, string> = {
	N: "Normal",
	H: "Holofoil",
	R: "Reverse Holofoil",
	"1H": "1st Ed. Holofoil",
	"1N": "1st Ed. Normal",
};

function tpSearchUrl(card: FocusCardData): string {
	const q = encodeURIComponent(`${card.name} ${card.cardNumber}`);
	return `https://www.tcgplayer.com/search/pokemon/product?q=${q}`;
}

function cmSearchUrl(card: FocusCardData): string {
	const q = encodeURIComponent(card.name);
	return `https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=${q}`;
}

/**
 * Build the per-source price lines for a card from its blob entry. Pure: takes
 * the already-selected entry + source dates, so it is trivially testable and
 * holds no store dependency. tcgplayer lines (USD, per finish) come first in a
 * fixed finish order; the cardmarket line (EUR trend) comes last. A finish with
 * a null market price, or a cardmarket entry with a null trend, is skipped.
 */
export function buildPriceLines(
	card: FocusCardData,
	entry: CardPriceEntry | null,
	meta: PriceLinesMeta,
): PriceLine[] {
	if (!entry) return [];
	const lines: PriceLine[] = [];

	if (entry.tp) {
		for (const code of FINISH_ORDER) {
			const pair = entry.tp[code];
			if (!pair) continue;
			const [market] = pair;
			if (market === null) continue;
			lines.push({
				source: "TCGplayer",
				finish: FINISH_LABEL[code],
				priceLabel: formatPrice(market, "USD"),
				url: tpSearchUrl(card),
				updatedAt: meta.tpDate,
			});
		}
	}

	if (entry.cm) {
		const trend = entry.cm[0];
		if (trend !== null) {
			lines.push({
				source: "Cardmarket",
				finish: null,
				priceLabel: formatPrice(trend, "EUR"),
				url: cmSearchUrl(card),
				updatedAt: meta.cmDate,
			});
		}
	}

	return lines;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/lib/price-lines.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Lint + commit**

```bash
bunx biome check --write --config-path=. src/lib/price-lines.ts src/lib/price-lines.test.ts
git add src/lib/price-lines.ts src/lib/price-lines.test.ts
git commit -m "feat(pricing): real buildPriceLines (per-finish native prices + source links)"
```

---

### Task 4: Live `card-prices.tsx` island

**Files:**
- Modify: `src/components/islands/card-prices.tsx`
- Test: `src/components/islands/card-prices.test.tsx` (create)

**Interfaces:**
- Consumes: `useCardPriceEntry`, `usePriceSourceDates`, `loadPrices`, `usePricesRuntime` (Task 2); `buildPriceLines` (Task 3); `FocusCardData`.
- Produces: `<CardPrices card={card} />` renders live price lines + the attribution notice; loads the blob on mount. It no longer self-gates on `PRICING_ENABLED` (the Pricing tab controls visibility).

**Design tokens:** source label `font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--faint)]`; price value `font-mono text-[13px] font-bold tabular-nums text-[var(--success)]`; finish/qualifier `font-mono text-[11px] text-[var(--ink-muted)]`; link `text-[var(--primary)]`. Notice `text-[10px] text-[var(--faint)]`. Wrap in `GlassPanel` (`@/components/ui/glass`).

- [ ] **Step 1: Write the failing test**

Create `src/components/islands/card-prices.test.tsx`:

```tsx
import { afterEach, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import type { PricesBlob } from "@/lib/corpus/price-types";
import { makeFocusCard } from "@/test-utils";
import {
	resetPricesRuntimeForTests,
	usePricesRuntime,
} from "@/store/corpus/prices-runtime";
import { CardPrices } from "./card-prices";

const card = makeFocusCard({ id: "base1-4", name: "Charizard", cardNumber: "4" });

function seed(cards: PricesBlob["cards"]) {
	usePricesRuntime.setState({
		byId: new Map(Object.entries(cards)),
		meta: {
			date: "2026-07-03",
			sources: { tp: "2026-07-03", cm: "2026-07-02" },
			fx: { base: "EUR", date: "2026-07-03", rates: { USD: 1.09 } },
		},
		status: "ready",
	});
}

afterEach(async () => {
	await resetPricesRuntimeForTests();
});

test("renders a price line per source for a priced card", () => {
	seed({ "base1-4": { tp: { H: [72034, 53499] }, cm: [50168, 27674, 40096, 56391] } });
	render(<CardPrices card={card} />);
	expect(screen.getByText("$720.34")).toBeTruthy();
	expect(screen.getByText("€501.68")).toBeTruthy();
});

test("shows the mandated TCGplayer attribution when a tcgplayer line renders", () => {
	seed({ "base1-4": { tp: { H: [72034, 53499] } } });
	render(<CardPrices card={card} />);
	expect(
		screen.getByText(/not endorsed or certified by TCGplayer/i),
	).toBeTruthy();
});

test("renders nothing extra for a card absent from the blob", () => {
	seed({ "other-1": { tp: { H: [100, 90] } } });
	const { container } = render(<CardPrices card={card} />);
	expect(container.querySelector("a")).toBeNull();
});
```

Note: read the existing `card-prices.tsx` to reuse its exact `GlassPanel` markup + link styling; keep the visual structure, swap the data source. Confirm the test-render helper import path (`@testing-library/react`) matches other island tests in the repo — mirror a sibling island test's imports if they differ.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/components/islands/card-prices.test.tsx`
Expected: FAIL — current `CardPrices` returns null (gated) / no attribution.

- [ ] **Step 3: Write the implementation**

Replace the contents of `src/components/islands/card-prices.tsx` with a version that:
- keeps the `ClientOnly` wrapper and `GlassPanel` line markup,
- drops the `PRICING_ENABLED` early return (the tab gate controls visibility now),
- subscribes via the Task 2 hooks and builds lines with the Task 3 pure fn,
- runs `useEffect(() => { loadPrices(); }, [])` to load the blob on first mount,
- renders the attribution notice whenever at least one TCGplayer line is present.

```tsx
import { ClientOnly } from "@tanstack/react-router";
import { useEffect } from "react";
import { GlassPanel } from "@/components/ui/glass";
import { buildPriceLines } from "@/lib/price-lines";
import {
	loadPrices,
	useCardPriceEntry,
	usePriceSourceDates,
} from "@/store/corpus/prices-runtime";
import type { FocusCardData } from "../../server/card-mappers";

const TCGPLAYER_NOTICE =
	"TCGplayer data — not endorsed or certified by TCGplayer.";

export function CardPrices({ card }: { card: FocusCardData }) {
	return (
		<ClientOnly fallback={null}>
			<PriceLines card={card} />
		</ClientOnly>
	);
}

function PriceLines({ card }: { card: FocusCardData }) {
	// Load once on mount; idempotent (IDB-first, deduped). A 503 before the first
	// prod build resolves to status "unavailable" and simply renders no lines.
	useEffect(() => {
		loadPrices();
	}, []);

	const entry = useCardPriceEntry(card.id);
	const dates = usePriceSourceDates();
	const lines = buildPriceLines(card, entry, {
		tpDate: dates.tpDate,
		cmDate: dates.cmDate,
	});
	if (!lines.length) return null;

	const hasTcgplayer = lines.some((l) => l.source === "TCGplayer");
	return (
		<GlassPanel className="mt-2 p-3.5">
			<div className="flex flex-col gap-1.5">
				{lines.map((l) => (
					<div
						key={`${l.source}:${l.finish ?? ""}`}
						className="flex items-center justify-between gap-3"
					>
						<span className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--faint)]">
							{l.source}
						</span>
						<div className="flex items-center gap-2">
							<span className="font-mono text-[13px] font-bold tabular-nums text-[var(--success)]">
								{l.priceLabel}
							</span>
							{l.finish ? (
								<span className="font-mono text-[11px] text-[var(--ink-muted)]">
									{l.finish}
								</span>
							) : null}
							<a
								href={l.url}
								target="_blank"
								rel="noopener noreferrer"
								className="font-mono text-[11px] text-[var(--primary)] no-underline transition-colors hover:opacity-80 focus-visible:outline-none focus-visible:opacity-80"
							>
								↗
							</a>
						</div>
					</div>
				))}
			</div>
			{hasTcgplayer ? (
				<p className="mt-2.5 font-mono text-[10px] leading-tight text-[var(--faint)]">
					{TCGPLAYER_NOTICE}
				</p>
			) : null}
		</GlassPanel>
	);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/components/islands/card-prices.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Lint + commit**

```bash
bunx biome check --write --config-path=. src/components/islands/card-prices.tsx src/components/islands/card-prices.test.tsx
git add src/components/islands/card-prices.tsx src/components/islands/card-prices.test.tsx
git commit -m "feat(pricing): live card price lines + TCGplayer attribution"
```

---

### Task 5: Un-gate the Pricing tab + flip the flag

**Files:**
- Modify: `src/components/card/card-pricing-tab.tsx`
- Modify: `src/lib/pricing-flag.ts`
- Test: `src/components/card/card-pricing-tab.test.tsx` (update existing)

**Interfaces:**
- Consumes: `CardPrices` (Task 4).
- Produces: `PRICING_ENABLED === true`; the Pricing tab renders the live market-prices section; the history section still shows a "coming soon" placeholder (PR 4).

**Context:** `card-tabs.tsx` filters the Pricing tab with `t.value !== "pricing" || PRICING_ENABLED`, so flipping the flag surfaces the tab app-wide. `card-pricing-tab.tsx` currently early-returns `null` when `!PRICING_ENABLED`; remove that gate (the tab won't mount unless the flag is on anyway). Flipping the flag WILL change existing tests that assert the tab is hidden — this task must find and update them.

- [ ] **Step 1: Flip the flag**

Edit `src/lib/pricing-flag.ts`:

```ts
/** Pricing is live. Kept as a kill switch — set false to hide every price surface. */
export const PRICING_ENABLED = true;
```

- [ ] **Step 2: Remove the gate in `card-pricing-tab.tsx`**

In `src/components/card/card-pricing-tab.tsx`, delete the `if (!PRICING_ENABLED) return null;` line and its now-unused `PRICING_ENABLED` import. Leave the two sections intact: the "Market prices" section (renders `<CardPrices card={card}/>` / `<PriceGhost/>` while pending) and the "Price history" section (still the "Price history. Coming soon." placeholder — PR 4).

- [ ] **Step 3: Update the tab's own test + find flag-flip fallout**

Run the two files most likely to assert the old hidden-state, then a broad search:

```bash
bun test src/components/card/card-pricing-tab.test.tsx src/components/card/card-tabs.test.tsx 2>&1 | tail -20
grep -rn "PRICING_ENABLED" src --include=*.tsx --include=*.ts | grep -i test
grep -rln "Coming soon\|pricing" src/routes --include=*.test.tsx
```

Update `card-pricing-tab.test.tsx`: replace any assertion that the tab renders `null` when disabled with assertions that (a) the market-prices section renders, and (b) the history section still shows "Coming soon." Seed the prices runtime (as in Task 4's test) for any case that expects live lines. For any OTHER test that asserted the Pricing tab was absent (e.g. `src/routes/$series/$set/$card_.prices.test.tsx`, card-cockpit tests, or a vault test), update its expectation to the tab now being present. Do NOT weaken a test to pass — change the expectation to the new correct behavior and keep the assertion meaningful.

- [ ] **Step 4: Verify the full suite (this task changes global behavior)**

Run: `bun test 2>&1 | tail -15`
Expected: all pass. Because the flag is global, this is the one task that legitimately runs the whole suite mid-plan — every previously-hidden-pricing assertion must now be updated and green. Fix each failure by correcting the expectation to the tab-present behavior (never by re-hiding the tab).

- [ ] **Step 5: Lint + commit**

```bash
bunx biome check --write --config-path=. src/lib/pricing-flag.ts src/components/card/card-pricing-tab.tsx src/components/card/card-pricing-tab.test.tsx
# add any other test files you had to update:
git add -p
git commit -m "feat(pricing): surface the live Pricing tab (flip PRICING_ENABLED)"
```

(Use `git add <path>` for each file you touched — never `git add -A`.)

---

### Task 6: Final verification gate

**Files:** none (verification only)

- [ ] **Step 1: Regenerate the gitignored route tree, then run all gates**

```bash
# routeTree.gen.ts is gitignored; tsc needs it. Boot vite dev briefly to emit it.
nohup bunx vite dev --port 6301 >/tmp/pr2-routegen.log 2>&1 & VP=$!; sleep 8; kill $VP 2>/dev/null
```

Then run in parallel (background the slow ones):
- `bunx tsc -b`
- `bun test`
- `bunx biome check --config-path=. src/store/corpus/ src/lib/price-lines.ts src/components/islands/card-prices.tsx src/components/card/card-pricing-tab.tsx src/lib/pricing-flag.ts`

Expected: tsc 0 errors; full suite green (baseline 1474 + the ~15 new tests, minus/plus any pricing-tab test expectations updated in Task 5); biome clean. After the run, `rm -f src/routeTree.gen.ts` (it is a gitignored build artifact).

- [ ] **Step 2: Fix anything red, re-run, commit fixes.** No known-red advance.

- [ ] **Step 3: Confirm no lockfile/manifest drift**

Run: `git status --short`
Expected: clean (no `bun.lock`/`package.json` change — this PR adds no dependencies).

## Self-Review Notes (plan author)

- **Spec coverage:** §4 client runtime → Tasks 1-2. §7 Pricing tab (lines, source, timestamp, deep link, attribution notice) → Tasks 3-5. §8 licensing (attribution + link-back, never paywalled) → Task 4's notice + search-URL links. `PRICING_ENABLED` flip → Task 5. Deferred to later PRs (correctly out of scope here): FX/`displayCurrency` conversion (PR 3), history charts (PR 4), portfolio valuation (PR 3), stack-row/vault price surfaces (PR 3).
- **Graceful pre-launch:** flipping the flag is safe before the prod daily Action runs — the worker 503s, the runtime resolves to `status:"unavailable"`, and `CardPrices` renders no lines (no error UI). Recommend running `gh workflow run build-prices.yml` once after deploy for real data; not a code gate.
- **Type consistency:** `useCardPriceEntry`/`usePriceSourceDates`/`buildPriceLines`/`PriceLine`/`PricesMetaState` names are used identically across Tasks 2-4.
