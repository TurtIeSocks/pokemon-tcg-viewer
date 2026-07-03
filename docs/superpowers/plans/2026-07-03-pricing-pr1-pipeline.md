# Pricing PR 1 — Price Data Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the server-side price pipeline: harvest marketplace product ids during the weekly corpus crawl, join cardmarket + tcgcsv + ECB FX into a daily price blob on R2, and serve it from the worker.

**Architecture:** The weekly corpus build (which already fetches every card's full TCGdex record, pricing included) additionally writes a `cardId → [cmIdProduct, tpProductId]` crosswalk to R2. A new daily GitHub Action downloads the crosswalk, fetches cardmarket's public price guide (1 GET), tcgcsv's per-group price feeds (~250 GETs), and the ECB FX table, joins them into `corpus/prices/latest.json.gz` (integer cents, per-finish tcgplayer + cardmarket trend tuple), and uploads it plus a dated archive copy. The worker serves it via two new routes cloning the `/corpus-detail` pattern.

**Tech Stack:** Bun (scripts + tests), TypeScript, Cloudflare Worker + R2, GitHub Actions, wrangler CLI.

**Spec:** `docs/superpowers/specs/2026-07-03-pricing-implementation-design.md` (§1–§3, error handling, testing).

## Global Constraints

- All money values are **integer minor units (cents)**; `null` = unknown, never `undefined` and never `0`-as-unknown.
- Blob format version field `v: 1`; `date` fields are `YYYY-MM-DD` UTC.
- Keep-last-good: the build script must **throw** (exit non-zero) on catastrophic shortfall so the Action never overwrites a good blob with a bad one.
- Tests must not hit the network — inject fetch/fixtures.
- Run tests with `bun test <file>`; lint with `bunx biome check --write --config-path=. <files>` (worktree gotcha: plain `bun run lint` can fail on a nested biome.json).
- Commit after every task. Do not run the full suite mid-plan; final task runs `bunx tsc -b` + full `bun test`.
- New files use `interface` for object shapes; `type` only for unions/tuples/aliases.

---

### Task 1: Shared price types + helpers (`src/lib/corpus/price-types.ts`)

**Files:**
- Create: `src/lib/corpus/price-types.ts`
- Test: `src/lib/corpus/price-types.test.ts`

**Interfaces:**
- Consumes: nothing (leaf module; shared by build scripts now, client runtime in PR 2).
- Produces:
  - `type PriceIdEntry = [cm: number | null, tp: number | null]`
  - `type PriceIdsMap = Record<string, PriceIdEntry>`
  - `type FinishCode = "N" | "H" | "R" | "1H" | "1N"`
  - `type TpPricePair = [marketCents: number | null, lowCents: number | null]`
  - `type CmTuple = [trend: number | null, avg1: number | null, avg7: number | null, avg30: number | null]`
  - `interface CardPriceEntry { tp?: Partial<Record<FinishCode, TpPricePair>>; cm?: CmTuple }`
  - `interface FxTable { base: "EUR"; date: string; rates: Record<string, number> }`
  - `interface PricesBlob { v: 1; date: string; fx: FxTable; sources: { tp: string | null; cm: string | null }; cards: Record<string, CardPriceEntry> }`
  - `interface PricesMeta { date: string; count: number; builtAt: string }`
  - `const TP_SUBTYPE_TO_CODE: Record<string, FinishCode>`
  - `function toCents(value: number | null | undefined): number | null`

- [ ] **Step 1: Write the failing test**

Create `src/lib/corpus/price-types.test.ts`:

```ts
import { expect, test } from "bun:test";
import { TP_SUBTYPE_TO_CODE, toCents } from "./price-types";

test("toCents converts float major units to integer cents", () => {
	expect(toCents(720.34)).toBe(72034);
	expect(toCents(0.07)).toBe(7);
	// Classic float trap: 19.99 * 100 = 1998.9999999999998
	expect(toCents(19.99)).toBe(1999);
	expect(toCents(0)).toBe(0);
});

test("toCents passes null/undefined through as null", () => {
	expect(toCents(null)).toBeNull();
	expect(toCents(undefined)).toBeNull();
});

test("TP_SUBTYPE_TO_CODE maps tcgcsv subTypeName vocabulary", () => {
	expect(TP_SUBTYPE_TO_CODE.Normal).toBe("N");
	expect(TP_SUBTYPE_TO_CODE.Holofoil).toBe("H");
	expect(TP_SUBTYPE_TO_CODE["Reverse Holofoil"]).toBe("R");
	expect(TP_SUBTYPE_TO_CODE["1st Edition Holofoil"]).toBe("1H");
	expect(TP_SUBTYPE_TO_CODE["1st Edition Normal"]).toBe("1N");
	// Vintage "Unlimited" rows are the same physical printing as the plain names.
	expect(TP_SUBTYPE_TO_CODE["Unlimited Holofoil"]).toBe("H");
	expect(TP_SUBTYPE_TO_CODE["Unlimited Normal"]).toBe("N");
	expect(TP_SUBTYPE_TO_CODE["Some Future Subtype"]).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/corpus/price-types.test.ts`
Expected: FAIL — `Cannot find module './price-types'`

- [ ] **Step 3: Write the implementation**

Create `src/lib/corpus/price-types.ts`:

```ts
// Shared price-pipeline types. Used by scripts/build-corpus.ts (crosswalk
// harvest), scripts/build-prices.ts (daily join), and — from PR 2 on — the
// client prices runtime. Lives in src/lib/corpus/ so build and client cannot
// drift (same pattern as tcgdex-card-fields.ts).

/** cardId → [cardmarket idProduct | null, tcgplayer productId | null]. */
export type PriceIdEntry = [cm: number | null, tp: number | null];
export type PriceIdsMap = Record<string, PriceIdEntry>;

/** N Normal · H Holofoil · R Reverse Holofoil · 1H/1N 1st Edition Holofoil/Normal. */
export type FinishCode = "N" | "H" | "R" | "1H" | "1N";

/** tcgcsv subTypeName → finish code. Unknown names are logged + skipped at join. */
export const TP_SUBTYPE_TO_CODE: Record<string, FinishCode> = {
	Normal: "N",
	Holofoil: "H",
	"Reverse Holofoil": "R",
	"1st Edition Holofoil": "1H",
	"1st Edition Normal": "1N",
	// "Unlimited" is tcgplayer's name for the non-1st-edition printing of
	// vintage products; physically identical to the plain finish.
	"Unlimited Holofoil": "H",
	"Unlimited Normal": "N",
};

export type TpPricePair = [marketCents: number | null, lowCents: number | null];
export type CmTuple = [
	trend: number | null,
	avg1: number | null,
	avg7: number | null,
	avg30: number | null,
];

export interface CardPriceEntry {
	/** tcgplayer per-finish [market, low], USD cents. */
	tp?: Partial<Record<FinishCode, TpPricePair>>;
	/** cardmarket [trend, avg1, avg7, avg30], EUR cents. */
	cm?: CmTuple;
}

/** ECB reference table (frankfurter.dev shape), EUR-based. */
export interface FxTable {
	base: "EUR";
	date: string;
	rates: Record<string, number>;
}

export interface PricesBlob {
	v: 1;
	/** Build date, YYYY-MM-DD UTC. Clients compare against today for staleness. */
	date: string;
	fx: FxTable;
	/** Upstream data dates (null = source unavailable this build). */
	sources: { tp: string | null; cm: string | null };
	cards: Record<string, CardPriceEntry>;
}

/** Served at /corpus-prices/version for cheap staleness polls. */
export interface PricesMeta {
	date: string;
	count: number;
	builtAt: string;
}

/** Float major units → integer cents; null/undefined stay null (unknown). */
export function toCents(value: number | null | undefined): number | null {
	if (value == null) return null;
	return Math.round(value * 100);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/lib/corpus/price-types.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Lint + commit**

```bash
bunx biome check --write --config-path=. src/lib/corpus/price-types.ts src/lib/corpus/price-types.test.ts
git add src/lib/corpus/price-types.ts src/lib/corpus/price-types.test.ts
git commit -m "feat(pricing): shared price-pipeline types + cents/finish helpers"
```

---

### Task 2: Crosswalk harvest in the corpus build

**Files:**
- Modify: `scripts/build-corpus.ts` (TcgdexCard type ~line 38-71; export `pLimit` ~line 270; entrypoint after `const raw = await buildCorpus(...)` ~line 490)
- Modify: `.github/workflows/build-corpus.yml` ("Upload to R2" step)
- Test: `scripts/build-corpus.test.ts` (append)

**Interfaces:**
- Consumes: `PriceIdEntry`, `PriceIdsMap` from `src/lib/corpus/price-types.ts` (Task 1).
- Produces:
  - `TcgdexCard.pricing?: TcgdexPricing | null` field on the existing interface
  - `function priceIdsOf(card: TcgdexCard): PriceIdEntry | null` (exported from `scripts/build-corpus.ts`)
  - `pLimit` becomes exported (Task 4 reuses it)
  - Build artifacts `price-ids.json.gz` / `price-ids.asia.json.gz` → R2 keys `corpus/price-ids.json.gz` / `corpus/region/asia/price-ids.json.gz`

- [ ] **Step 1: Write the failing tests**

Append to `scripts/build-corpus.test.ts`:

```ts
import { priceIdsOf } from "./build-corpus";

test("priceIdsOf extracts both marketplace ids", () => {
	const card = {
		...withImage,
		pricing: {
			cardmarket: { idProduct: 273699, avg: 512.96 },
			tcgplayer: {
				unit: "USD",
				updated: "2026-07-02T22:58:38.029Z",
				holofoil: { productId: 42382, marketPrice: 720.34 },
			},
		},
	} as TcgdexCard;
	expect(priceIdsOf(card)).toEqual([273699, 42382]);
});

test("priceIdsOf takes the first finish block's productId (shared across finishes)", () => {
	const card = {
		...withImage,
		pricing: {
			cardmarket: null,
			tcgplayer: {
				unit: "USD",
				updated: "x",
				normal: { productId: 219333 },
				"reverse-holofoil": { productId: 219333 },
			},
		},
	} as TcgdexCard;
	expect(priceIdsOf(card)).toEqual([null, 219333]);
});

test("priceIdsOf handles cardmarket-only (ja) and unpriced cards", () => {
	const jaCard = {
		...withImage,
		pricing: { cardmarket: { idProduct: 719604 }, tcgplayer: null },
	} as TcgdexCard;
	expect(priceIdsOf(jaCard)).toEqual([719604, null]);
	expect(priceIdsOf(withImage)).toBeNull(); // no pricing field at all
	expect(priceIdsOf({ ...withImage, pricing: null } as TcgdexCard)).toBeNull();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test scripts/build-corpus.test.ts`
Expected: FAIL — `priceIdsOf` is not exported

- [ ] **Step 3: Implement**

In `scripts/build-corpus.ts`:

3a. Add the pricing shape to the `TcgdexCard` interface (after `illustrator?: string;`):

```ts
	// Live marketplace pricing attached by the TCGdex server (present when the
	// mirror's price providers loaded; see build-prices pipeline). Only the
	// product ids are harvested at build time — prices themselves come from the
	// marketplaces' bulk feeds in scripts/build-prices.ts.
	pricing?: {
		cardmarket?: { idProduct?: number } | null;
		tcgplayer?:
			| ({ unit?: string; updated?: string } & Record<string, unknown>)
			| null;
	} | null;
```

3b. Change `async function pLimit` to `export async function pLimit` (Task 4 reuses it).

3c. Add `priceIdsOf` after `detailVersion` (imports: add `import type { PriceIdEntry, PriceIdsMap } from "../src/lib/corpus/price-types";`):

```ts
/**
 * Extract the marketplace product ids from a card's live pricing block.
 * tcgplayer finish blocks share one productId per card (the finish lives in
 * the marketplace's subtype axis), so the first block's id is THE id.
 */
export function priceIdsOf(card: TcgdexCard): PriceIdEntry | null {
	const cm = card.pricing?.cardmarket?.idProduct ?? null;
	let tp: number | null = null;
	const block = card.pricing?.tcgplayer;
	if (block) {
		for (const v of Object.values(block)) {
			if (v && typeof v === "object") {
				const pid = (v as { productId?: unknown }).productId;
				if (typeof pid === "number") {
					tp = pid;
					break;
				}
			}
		}
	}
	return cm === null && tp === null ? null : [cm, tp];
}
```

3d. In the entrypoint (`if (import.meta.main)`), right after `const raw = await buildCorpus({ baseLang });`, add:

```ts
	// Price crosswalk: cardId → marketplace product ids, for the daily
	// build-prices join. Emitted before trimming (trimCard drops pricing).
	const priceIds: PriceIdsMap = {};
	for (const c of raw) {
		const entry = priceIdsOf(c);
		if (entry) priceIds[c.id] = entry;
	}
	const priceIdsFile = isAsia ? "price-ids.asia.json.gz" : "price-ids.json.gz";
	await Bun.write(priceIdsFile, gzipSync(Buffer.from(JSON.stringify(priceIds))));
	console.log(
		`price crosswalk: ${Object.keys(priceIds).length}/${raw.length} cards carry marketplace ids → ${priceIdsFile}`,
	);
```

3e. In `.github/workflows/build-corpus.yml`, "Upload to R2" step, add after the Western corpus puts:

```yaml
          bunx wrangler r2 object put \
            pokemon-tcg-corpus/corpus/price-ids.json.gz \
            --file=price-ids.json.gz --remote
```

and after the Asian puts:

```yaml
          bunx wrangler r2 object put \
            pokemon-tcg-corpus/corpus/region/asia/price-ids.json.gz \
            --file=price-ids.asia.json.gz --remote
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test scripts/build-corpus.test.ts`
Expected: PASS (all existing + 3 new)

- [ ] **Step 5: Lint + commit**

```bash
bunx biome check --write --config-path=. scripts/build-corpus.ts scripts/build-corpus.test.ts
git add scripts/build-corpus.ts scripts/build-corpus.test.ts .github/workflows/build-corpus.yml
git commit -m "feat(pricing): harvest marketplace product-id crosswalk in corpus build"
```

---

### Task 3: `joinPrices` — the pure daily join (`scripts/build-prices.ts`)

**Files:**
- Create: `scripts/build-prices.ts` (join function only in this task; orchestration is Task 4)
- Test: `scripts/build-prices.test.ts`

**Interfaces:**
- Consumes: Task 1 types; `PriceIdsMap`.
- Produces:
  - `interface CmGuideRecord { idProduct: number; trend: number | null; avg1: number | null; avg7: number | null; avg30: number | null }`
  - `interface TcgcsvPriceRecord { productId: number; marketPrice: number | null; lowPrice: number | null; subTypeName: string }`
  - `function joinPrices(input: { priceIds: PriceIdsMap; cmGuide: CmGuideRecord[]; tpPrices: TcgcsvPriceRecord[]; fx: FxTable; date: string; sources: { tp: string | null; cm: string | null } }): { blob: PricesBlob; unknownSubtypes: string[] }`

- [ ] **Step 1: Write the failing tests**

Create `scripts/build-prices.test.ts`:

```ts
import { expect, test } from "bun:test";
import type { FxTable, PriceIdsMap } from "../src/lib/corpus/price-types";
import {
	type CmGuideRecord,
	joinPrices,
	type TcgcsvPriceRecord,
} from "./build-prices";

const fx: FxTable = { base: "EUR", date: "2026-07-03", rates: { USD: 1.09 } };
const sources = { tp: "2026-07-03", cm: "2026-07-03" };

const priceIds: PriceIdsMap = {
	"base1-4": [273699, 42382], // both marketplaces
	"sv2a-151": [719604, null], // cardmarket only (ja)
	"swsh3-136": [null, 219333], // tcgplayer only, two finishes
	"xy1-1": [999999, 888888], // ids present but absent from both feeds
};

const cmGuide: CmGuideRecord[] = [
	{ idProduct: 273699, trend: 501.68, avg1: 276.74, avg7: 400.96, avg30: 563.91 },
	{ idProduct: 719604, trend: 0.94, avg1: 1.5, avg7: null, avg30: 0.92 },
];

const tpPrices: TcgcsvPriceRecord[] = [
	{ productId: 42382, marketPrice: 720.34, lowPrice: 534.99, subTypeName: "Holofoil" },
	{ productId: 219333, marketPrice: 0.07, lowPrice: 0.04, subTypeName: "Normal" },
	{ productId: 219333, marketPrice: 0.36, lowPrice: 0.15, subTypeName: "Reverse Holofoil" },
	{ productId: 219333, marketPrice: 1.23, lowPrice: null, subTypeName: "Weird Future Subtype" },
];

test("joinPrices joins both sources into cents", () => {
	const { blob } = joinPrices({ priceIds, cmGuide, tpPrices, fx, date: "2026-07-03", sources });
	expect(blob.v).toBe(1);
	expect(blob.date).toBe("2026-07-03");
	expect(blob.fx.rates.USD).toBe(1.09);
	expect(blob.cards["base1-4"]).toEqual({
		tp: { H: [72034, 53499] },
		cm: [50168, 27674, 40096, 56391],
	});
});

test("joinPrices handles single-source cards and multi-finish products", () => {
	const { blob } = joinPrices({ priceIds, cmGuide, tpPrices, fx, date: "2026-07-03", sources });
	expect(blob.cards["sv2a-151"]).toEqual({ cm: [94, 150, null, 92] });
	expect(blob.cards["swsh3-136"]).toEqual({
		tp: { N: [7, 4], R: [36, 15] },
	});
});

test("joinPrices drops feedless cards and reports unknown subtypes", () => {
	const { blob, unknownSubtypes } = joinPrices({
		priceIds, cmGuide, tpPrices, fx, date: "2026-07-03", sources,
	});
	expect(blob.cards["xy1-1"]).toBeUndefined();
	expect(unknownSubtypes).toEqual(["Weird Future Subtype"]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test scripts/build-prices.test.ts`
Expected: FAIL — `Cannot find module './build-prices'`

- [ ] **Step 3: Implement the join**

Create `scripts/build-prices.ts`:

```ts
// Daily price-blob builder. Joins the corpus-build crosswalk
// (cardId → marketplace product ids) with the marketplaces' public bulk
// feeds — cardmarket's daily price guide and tcgcsv's TCGplayer mirror —
// plus the ECB FX table, into corpus/prices/latest.json.gz.
// Spec: docs/superpowers/specs/2026-07-03-pricing-implementation-design.md §2.
import {
	type CardPriceEntry,
	type CmTuple,
	type FxTable,
	type PriceIdsMap,
	type PricesBlob,
	TP_SUBTYPE_TO_CODE,
	toCents,
} from "../src/lib/corpus/price-types";

/** The fields we read from cardmarket's price_guide_6.json records. */
export interface CmGuideRecord {
	idProduct: number;
	trend: number | null;
	avg1: number | null;
	avg7: number | null;
	avg30: number | null;
}

/** The fields we read from tcgcsv /tcgplayer/3/{groupId}/prices records. */
export interface TcgcsvPriceRecord {
	productId: number;
	marketPrice: number | null;
	lowPrice: number | null;
	subTypeName: string;
}

export function joinPrices(input: {
	priceIds: PriceIdsMap;
	cmGuide: CmGuideRecord[];
	tpPrices: TcgcsvPriceRecord[];
	fx: FxTable;
	date: string;
	sources: { tp: string | null; cm: string | null };
}): { blob: PricesBlob; unknownSubtypes: string[] } {
	const cmById = new Map(input.cmGuide.map((r) => [r.idProduct, r]));
	const tpById = new Map<number, TcgcsvPriceRecord[]>();
	for (const r of input.tpPrices) {
		const list = tpById.get(r.productId);
		if (list) list.push(r);
		else tpById.set(r.productId, [r]);
	}

	const cards: PricesBlob["cards"] = {};
	const unknown = new Set<string>();
	for (const [cardId, [cmId, tpId]] of Object.entries(input.priceIds)) {
		const entry: CardPriceEntry = {};
		if (tpId !== null) {
			for (const rec of tpById.get(tpId) ?? []) {
				const code = TP_SUBTYPE_TO_CODE[rec.subTypeName];
				if (!code) {
					unknown.add(rec.subTypeName);
					continue;
				}
				const market = toCents(rec.marketPrice);
				const low = toCents(rec.lowPrice);
				if (market !== null || low !== null) {
					(entry.tp ??= {})[code] = [market, low];
				}
			}
		}
		if (cmId !== null) {
			const g = cmById.get(cmId);
			if (g) {
				const tuple: CmTuple = [
					toCents(g.trend),
					toCents(g.avg1),
					toCents(g.avg7),
					toCents(g.avg30),
				];
				if (tuple.some((x) => x !== null)) entry.cm = tuple;
			}
		}
		if (entry.tp || entry.cm) cards[cardId] = entry;
	}

	return {
		blob: {
			v: 1,
			date: input.date,
			fx: input.fx,
			sources: input.sources,
			cards,
		},
		unknownSubtypes: [...unknown].sort(),
	};
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test scripts/build-prices.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Lint + commit**

```bash
bunx biome check --write --config-path=. scripts/build-prices.ts scripts/build-prices.test.ts
git add scripts/build-prices.ts scripts/build-prices.test.ts
git commit -m "feat(pricing): pure daily price join (crosswalk × cardmarket × tcgcsv × fx)"
```

---

### Task 4: Fetch orchestration + entrypoint in `build-prices.ts`

**Files:**
- Modify: `scripts/build-prices.ts` (append fetchers + entrypoint)
- Test: `scripts/build-prices.test.ts` (append)

**Interfaces:**
- Consumes: `fetchJson`, `pLimit` from `scripts/build-corpus.ts` (Task 2 exported `pLimit`); `joinPrices` (Task 3).
- Produces:
  - `type FetchJsonFn = (url: string) => Promise<unknown>`
  - `function fetchCmGuide(fetchJsonFn?: FetchJsonFn): Promise<{ records: CmGuideRecord[]; date: string }>`
  - `function fetchTpPrices(fetchJsonFn?: FetchJsonFn): Promise<{ records: TcgcsvPriceRecord[]; groupCount: number }>`
  - `function fetchFx(fetchJsonFn?: FetchJsonFn): Promise<FxTable>`
  - Entrypoint writes `prices.json.gz` + `prices-meta.json` locally.

Constants (top of the appended section):

```ts
const CM_GUIDE_URL =
	"https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_6.json";
const TCGCSV_BASE = "https://tcgcsv.com/tcgplayer/3"; // Pokemon (EN) category
const FX_URL = "https://api.frankfurter.dev/v1/latest";
const TP_GROUP_CONCURRENCY = 8;
/** Catastrophic-shortfall floor: EN corpus alone yields ~19k priced cards. */
const MIN_PRICED_CARDS = 5000;
```

- [ ] **Step 1: Write the failing tests**

Append to `scripts/build-prices.test.ts`:

```ts
import { fetchCmGuide, fetchFx, fetchTpPrices } from "./build-prices";

function fakeFetch(routes: Record<string, unknown>) {
	return async (url: string) => {
		for (const [prefix, body] of Object.entries(routes)) {
			if (url.startsWith(prefix)) return body;
		}
		throw new Error(`unexpected fetch: ${url}`);
	};
}

test("fetchCmGuide extracts records + guide date", async () => {
	const { records, date } = await fetchCmGuide(
		fakeFetch({
			"https://downloads.s3.cardmarket.com": {
				version: 1,
				createdAt: "2026-07-03T02:46:05+0200",
				priceGuides: [
					{ idProduct: 273699, avg: 512.96, low: 98, trend: 501.68, avg1: 276.74, avg7: 400.96, avg30: 563.91 },
				],
			},
		}),
	);
	expect(date).toBe("2026-07-03");
	expect(records).toEqual([
		{ idProduct: 273699, trend: 501.68, avg1: 276.74, avg7: 400.96, avg30: 563.91 },
	]);
});

test("fetchTpPrices fans out over every group and flattens results", async () => {
	const { records, groupCount } = await fetchTpPrices(
		fakeFetch({
			"https://tcgcsv.com/tcgplayer/3/groups": {
				success: true,
				errors: [],
				results: [{ groupId: 3170 }, { groupId: 604 }],
			},
			"https://tcgcsv.com/tcgplayer/3/3170/prices": {
				success: true,
				errors: [],
				results: [
					{ productId: 42382, lowPrice: 534.99, midPrice: 709.99, highPrice: 1500, marketPrice: 720.34, directLowPrice: 678.81, subTypeName: "Holofoil" },
				],
			},
			"https://tcgcsv.com/tcgplayer/3/604/prices": {
				success: true,
				errors: [],
				results: [
					{ productId: 219333, lowPrice: 0.04, midPrice: 0.2, highPrice: 25.11, marketPrice: 0.07, directLowPrice: null, subTypeName: "Normal" },
				],
			},
		}),
	);
	expect(groupCount).toBe(2);
	expect(records).toEqual([
		{ productId: 42382, marketPrice: 720.34, lowPrice: 534.99, subTypeName: "Holofoil" },
		{ productId: 219333, marketPrice: 0.07, lowPrice: 0.04, subTypeName: "Normal" },
	]);
});

test("fetchFx returns the ECB table and requires USD", async () => {
	const fx = await fetchFx(
		fakeFetch({
			"https://api.frankfurter.dev": {
				amount: 1.0,
				base: "EUR",
				date: "2026-07-03",
				rates: { USD: 1.09, GBP: 0.8572, JPY: 184.48 },
			},
		}),
	);
	expect(fx).toEqual({
		base: "EUR",
		date: "2026-07-03",
		rates: { USD: 1.09, GBP: 0.8572, JPY: 184.48 },
	});
	await expect(
		fetchFx(fakeFetch({ "https://api.frankfurter.dev": { base: "EUR", date: "x", rates: {} } })),
	).rejects.toThrow(/USD/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test scripts/build-prices.test.ts`
Expected: FAIL — `fetchCmGuide` is not exported

- [ ] **Step 3: Implement fetchers + entrypoint**

Append to `scripts/build-prices.ts` (extend the existing import from build-corpus and add node imports):

```ts
import { readFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";
import { fetchJson, pLimit } from "./build-corpus";

const CM_GUIDE_URL =
	"https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_6.json";
const TCGCSV_BASE = "https://tcgcsv.com/tcgplayer/3"; // Pokemon (EN) category
const FX_URL = "https://api.frankfurter.dev/v1/latest";
const TP_GROUP_CONCURRENCY = 8;
/** Catastrophic-shortfall floor: EN corpus alone yields ~19k priced cards. */
const MIN_PRICED_CARDS = 5000;

export type FetchJsonFn = (url: string) => Promise<unknown>;

/** Cardmarket's public daily price guide (all games; caller filters via crosswalk). */
export async function fetchCmGuide(
	fetchJsonFn: FetchJsonFn = fetchJson,
): Promise<{ records: CmGuideRecord[]; date: string }> {
	const raw = (await fetchJsonFn(CM_GUIDE_URL)) as {
		createdAt: string;
		priceGuides: Array<
			{ idProduct: number } & Partial<
				Record<"trend" | "avg1" | "avg7" | "avg30", number | null>
			>
		>;
	};
	const records = raw.priceGuides.map((g) => ({
		idProduct: g.idProduct,
		trend: g.trend ?? null,
		avg1: g.avg1 ?? null,
		avg7: g.avg7 ?? null,
		avg30: g.avg30 ?? null,
	}));
	return { records, date: raw.createdAt.slice(0, 10) };
}

/** All tcgcsv Pokemon-EN group price feeds, flattened. */
export async function fetchTpPrices(
	fetchJsonFn: FetchJsonFn = fetchJson,
): Promise<{ records: TcgcsvPriceRecord[]; groupCount: number }> {
	const groups = (await fetchJsonFn(`${TCGCSV_BASE}/groups`)) as {
		results: { groupId: number }[];
	};
	const lists = await pLimit(
		groups.results.map((g) => async () => {
			const res = (await fetchJsonFn(`${TCGCSV_BASE}/${g.groupId}/prices`)) as {
				results: Array<
					{ productId: number; subTypeName: string } & Partial<
						Record<"marketPrice" | "lowPrice", number | null>
					>
				>;
			};
			return res.results;
		}),
		TP_GROUP_CONCURRENCY,
	);
	const records = lists.flat().map((r) => ({
		productId: r.productId,
		marketPrice: r.marketPrice ?? null,
		lowPrice: r.lowPrice ?? null,
		subTypeName: r.subTypeName,
	}));
	return { records, groupCount: groups.results.length };
}

/** ECB reference rates via frankfurter.dev. USD is load-bearing (rollup currency). */
export async function fetchFx(
	fetchJsonFn: FetchJsonFn = fetchJson,
): Promise<FxTable> {
	const raw = (await fetchJsonFn(FX_URL)) as {
		base: string;
		date: string;
		rates: Record<string, number>;
	};
	if (typeof raw.rates?.USD !== "number") {
		throw new Error("FX table missing USD rate — refusing to build");
	}
	return { base: "EUR", date: raw.date, rates: raw.rates };
}

function loadPriceIds(path: string): PriceIdsMap {
	const bytes = gunzipSync(readFileSync(path));
	return JSON.parse(bytes.toString()) as PriceIdsMap;
}

// Entrypoint: `bun run scripts/build-prices.ts`
// Expects price-ids.json.gz (+ optional price-ids.asia.json.gz) in cwd,
// fetched from R2 by the workflow. Writes prices.json.gz + prices-meta.json.
if (import.meta.main) {
	const startedAt = Date.now();
	const priceIds: PriceIdsMap = {
		...loadPriceIds("price-ids.json.gz"),
		...(await Bun.file("price-ids.asia.json.gz").exists()
			? loadPriceIds("price-ids.asia.json.gz")
			: {}),
	};
	if (!Object.keys(priceIds).length) {
		throw new Error("no crosswalk entries loaded — is price-ids.json.gz present?");
	}
	console.log(`crosswalk: ${Object.keys(priceIds).length} cards`);

	const [cm, tp, fx] = await Promise.all([
		fetchCmGuide(),
		fetchTpPrices(),
		fetchFx(),
	]);
	console.log(
		`fetched: cardmarket ${cm.records.length} products (${cm.date}), tcgplayer ${tp.records.length} price rows across ${tp.groupCount} groups, fx ${Object.keys(fx.rates).length} rates`,
	);

	const date = new Date().toISOString().slice(0, 10);
	const { blob, unknownSubtypes } = joinPrices({
		priceIds,
		cmGuide: cm.records,
		tpPrices: tp.records,
		fx,
		date,
		sources: { tp: date, cm: cm.date },
	});
	if (unknownSubtypes.length) {
		console.warn(`unknown tcgplayer subtypes skipped: ${unknownSubtypes.join(", ")}`);
	}

	const count = Object.keys(blob.cards).length;
	// Keep-last-good: a catastrophic join (bad crosswalk, empty feeds) must not
	// overwrite yesterday's blob — fail the Action instead.
	if (count < MIN_PRICED_CARDS) {
		throw new Error(`only ${count} priced cards (< ${MIN_PRICED_CARDS}) — refusing to publish`);
	}

	const gz = gzipSync(Buffer.from(JSON.stringify(blob)));
	await Bun.write("prices.json.gz", gz);
	await Bun.write(
		"prices-meta.json",
		JSON.stringify({ date, count, builtAt: new Date().toISOString() }),
	);
	const kb = (gz.length / 1024).toFixed(0);
	const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
	console.log(`Wrote ${count} priced cards → prices.json.gz (${kb} KB) in ${secs}s`);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test scripts/build-prices.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Lint + commit**

```bash
bunx biome check --write --config-path=. scripts/build-prices.ts scripts/build-prices.test.ts
git add scripts/build-prices.ts scripts/build-prices.test.ts
git commit -m "feat(pricing): daily price-blob builder (fetch + join + keep-last-good gate)"
```

---

### Task 5: Worker routes `/corpus-prices` + `/corpus-prices/version`

**Files:**
- Modify: `worker/src/index.ts` (insert after the `/corpus-detail` block, ~line 173)
- Test: `worker/src/index.test.ts` (extend the `CORPUS` fake + append tests)

**Interfaces:**
- Consumes: R2 keys `corpus/prices/latest.json.gz`, `corpus/prices/meta.json` (written by Task 6's workflow).
- Produces: `GET /corpus-prices` (gz blob, ETag, 304, SWR) and `GET /corpus-prices/version` (meta JSON) — PR 2's client runtime consumes these.

- [ ] **Step 1: Write the failing tests**

In `worker/src/index.test.ts`, add to the `CORPUS.get` fake (before `return null;`):

```ts
		if (key === "corpus/prices/latest.json.gz")
			return { body: "PRICES_GZ", etag: "pricestag" };
		if (key === "corpus/prices/meta.json")
			return {
				body: new Blob(['{"date":"2026-07-03","count":19000,"builtAt":"x"}']).stream(),
				etag: "pricesmetatag",
			};
```

Append tests (mirror the existing `/corpus-detail` test style in this file):

```ts
describe("/corpus-prices", () => {
	test("serves the prices blob with ETag + SWR caching", async () => {
		const res = await worker.fetch(
			new Request("https://w.dev/corpus-prices"),
			env,
			ctx,
		);
		expect(res.status).toBe(200);
		expect(res.headers.get("ETag")).toBe('"pricestag"');
		expect(res.headers.get("Cache-Control")).toContain("s-maxage=3600");
		expect(await res.text()).toBe("PRICES_GZ");
	});

	test("returns 304 on matching If-None-Match", async () => {
		const res = await worker.fetch(
			new Request("https://w.dev/corpus-prices", {
				headers: { "If-None-Match": '"pricestag"' },
			}),
			env,
			ctx,
		);
		expect(res.status).toBe(304);
	});

	test("version route serves the meta JSON", async () => {
		const res = await worker.fetch(
			new Request("https://w.dev/corpus-prices/version"),
			env,
			ctx,
		);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			date: "2026-07-03",
			count: 19000,
			builtAt: "x",
		});
	});

	test("503s before the first build", async () => {
		const emptyEnv = { ...env, CORPUS: { get: async () => null } };
		// @ts-expect-error — minimal env stand-in.
		const res = await worker.fetch(new Request("https://w.dev/corpus-prices"), emptyEnv, ctx);
		expect(res.status).toBe(503);
	});
});
```

(Match the file's actual `worker.fetch(...)` call/env casting conventions — read the surrounding tests first and mirror them exactly.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test worker/src/index.test.ts`
Expected: FAIL — new tests get 404/mismatched responses

- [ ] **Step 3: Implement the routes**

In `worker/src/index.ts`, insert after the `/corpus-detail` block (after line ~173):

```ts
		// Daily market-price blob (spec 2026-07-03-pricing-implementation-design §3).
		if (url.pathname === "/corpus-prices/version") {
			const obj = await env.CORPUS.get("corpus/prices/meta.json");
			if (!obj) {
				return new Response("Prices not built yet", {
					status: 503,
					headers: corsHeaders(env),
				});
			}
			return new Response(obj.body, {
				headers: {
					...corsHeaders(env),
					"Content-Type": "application/json",
					"Cache-Control":
						"public, max-age=60, s-maxage=300, stale-while-revalidate=86400",
				},
			});
		}

		if (url.pathname === "/corpus-prices") {
			const obj = await env.CORPUS.get("corpus/prices/latest.json.gz");
			if (!obj) {
				return new Response("Prices not built yet", {
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

(Order matters: the `/version` check must precede the bare `/corpus-prices` check only if using prefix matching — with exact `===` matches as above, order is cosmetic; keep version first to mirror the i18n block style.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test worker/src/index.test.ts`
Expected: PASS (all existing + 4 new)

- [ ] **Step 5: Lint + commit**

```bash
bunx biome check --write --config-path=. worker/src/index.ts worker/src/index.test.ts
git add worker/src/index.ts worker/src/index.test.ts
git commit -m "feat(pricing): worker routes for the daily price blob"
```

---

### Task 6: Daily GitHub Action (`.github/workflows/build-prices.yml`)

**Files:**
- Create: `.github/workflows/build-prices.yml`

**Interfaces:**
- Consumes: R2 crosswalk keys (Task 2), `scripts/build-prices.ts` entrypoint (Task 4), repo secrets `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` (already exist for build-corpus).
- Produces: R2 keys `corpus/prices/latest.json.gz`, `corpus/prices/meta.json`, `corpus/prices/archive/YYYY-MM-DD.json.gz`.

- [ ] **Step 1: Write the workflow**

Create `.github/workflows/build-prices.yml`:

```yaml
name: Build price blob
on:
  schedule:
    - cron: "30 21 * * *" # daily 21:30 UTC — tcgcsv refreshes ~20:00 UTC
  workflow_dispatch: {}

# Least privilege: read the repo; R2 access via API token.
permissions:
  contents: read

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - name: Fetch crosswalks from R2
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
        run: |
          bunx wrangler r2 object get \
            pokemon-tcg-corpus/corpus/price-ids.json.gz \
            --file=price-ids.json.gz --remote
          # Asia crosswalk is optional until the next asia corpus rebuild ships it.
          bunx wrangler r2 object get \
            pokemon-tcg-corpus/corpus/region/asia/price-ids.json.gz \
            --file=price-ids.asia.json.gz --remote || true
      - name: Build price blob
        # Throws (fails the job) on catastrophic shortfall — yesterday's blob
        # stays live in R2 (keep-last-good).
        run: bun run scripts/build-prices.ts
      - name: Upload to R2
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
        run: |
          bunx wrangler r2 object put \
            pokemon-tcg-corpus/corpus/prices/latest.json.gz \
            --file=prices.json.gz --remote
          bunx wrangler r2 object put \
            pokemon-tcg-corpus/corpus/prices/meta.json \
            --file=prices-meta.json --remote
          # Dated archive: raw material for PR 4's history rollups. Starts
          # accruing from the first successful run.
          bunx wrangler r2 object put \
            "pokemon-tcg-corpus/corpus/prices/archive/$(date -u +%F).json.gz" \
            --file=prices.json.gz --remote
```

- [ ] **Step 2: Validate the YAML**

Run: `bunx yaml-lint .github/workflows/build-prices.yml 2>/dev/null || python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/build-prices.yml')); print('yaml ok')"`
Expected: `yaml ok` (or yaml-lint pass)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/build-prices.yml
git commit -m "ci(pricing): daily price-blob build + R2 upload with dated archive"
```

Post-merge verification note (cannot run locally): trigger once via `gh workflow run build-prices.yml` after the next corpus build has published the crosswalk, then `curl -sI https://pokemon-tcg-proxy.ptcg-viewer.workers.dev/corpus-prices` expecting 200 + ETag.

---

### Task 7: Final verification gate

**Files:** none (verification only)

- [ ] **Step 1: Full checks in parallel**

Run (single batch, background the slow ones):
- `bunx tsc -b`
- `bun test`
- `bunx biome check --config-path=. scripts/ src/lib/corpus/ worker/src/`

Expected: tsc 0 errors; full suite ≥ 1430 pass / 0 fail (baseline 2026-07-02) + the ~16 new tests; biome clean.

- [ ] **Step 2: Fix anything red, re-run, commit fixes**

No known-red advance: all three gates green before the PR.

- [ ] **Step 3: Verify no lockfile/manifest drift**

Run: `git status --short`
Expected: clean (no dependency changes in this PR — if `bun.lock` changed, something added a dep that shouldn't exist).
