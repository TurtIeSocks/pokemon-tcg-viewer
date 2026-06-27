# Offline Card Detail (L1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an opt-in toggle that downloads a ~2.1 MiB per-card detail blob (battle data, rules, flavor text; no prices) and keeps it on the device, so the card modal renders full detail instantly from local memory with no server round trip and works offline.

**Architecture:** One corpus crawl emits two artifacts (the existing slim corpus + a new detail blob) plus a content-hash version file. A Cloudflare Worker serves the blob and a tiny version probe. The client stores the blob in a dedicated IndexedDB store, hydrates a non-persisted Zustand runtime store into an in-memory `Map<cardId, DetailCard>`, and the card overlay merges that detail into the corpus-derived card so the modal is complete (minus prices, which stay live via the existing RPC). A sidebar toggle drives download / re-sync / remove with content-addressed staleness.

**Tech Stack:** TanStack Start, Zustand, idb-keyval (IndexedDB), Cloudflare Workers + R2, bun test (happy-dom + fake-indexeddb), Biome.

## Global Constraints

- **No em-dashes in user-facing copy.** Use periods, commas, or parentheses. Code/comments unaffected.
- **Corpus-side optional fields use `?` (omit when absent), matching `CorpusCard`**, NOT the userland `null` convention. The detail blob and `DetailCard` follow the corpus convention.
- **Before writing or changing any Zustand store/selector, invoke the `zustand-subscription-patterns` skill.** New store consumers use S3: per-field selectors in the consuming component; never prop-drill store state.
- **Tests must not hit the network.** Inject fakes / pre-seed state. In bun, prefer `spyOn` over `mock.module` (module mocks leak across test files). `fake-indexeddb` + happy-dom are preloaded via `bunfig.toml`.
- **Lint with explicit paths:** `bunx biome check --write --config-path=. <files>` (a nested worktree `biome.json` breaks bare `bun run lint`).
- **Typecheck at task end:** `bunx tsc -b`.
- **Manual `useMemo`/`useCallback` are intentional** (React Compiler is on); do not strip them.

---

## File Structure

- `src/store/corpus/corpus-types.ts`, add `DetailCard` interface (battle fields) next to `CorpusCard`.
- `scripts/build-corpus.ts`, extend the crawl `select` + `ApiCard`; add `detailCard()` and `detailVersion()`; emit `corpus-detail.json.gz` + `corpus-detail.meta.json`.
- `scripts/build-corpus.test.ts`, unit tests for `detailCard` + `detailVersion`.
- `.github/workflows/build-corpus.yml`, upload the two new artifacts to R2.
- `worker/src/index.ts`, add `/corpus-detail` + `/corpus-detail/version` routes.
- `worker/src/index.test.ts`, tests for the two new routes.
- `src/store/corpus/detail-store.ts`, idb-keyval adapter for the detail blob + meta.
- `src/store/corpus/detail-store.test.ts`, read/write/clear tests.
- `src/store/corpus/detail-runtime.ts`, `useDetailRuntime` store + actions.
- `src/store/corpus/detail-runtime.test.ts`, load/enable/sync/stale/disable tests.
- `src/lib/card-detail.ts`, `optimisticCardFromCorpus` gains an optional `detailById` join.
- `src/lib/card-detail.test.ts`, extend with the detail-merge case.
- `src/components/islands/card-overlay.tsx`, read `useDetailRuntime`, pass detail to the join, drop `pending` when detail is complete.
- `src/components/card/card-info.tsx`, render a flavor-text section (+ ghost while pending).
- `src/components/shell/sidebar-user-menu.tsx`, add the offline toggle menu group.
- `src/components/shell/offline-toggle.tsx`, the toggle item component (extracted so the menu file stays focused).
- `src/components/shell/offline-toggle.test.tsx`, render-state tests for the toggle.

---

## Task 1: Detail extraction + version in the build

**Files:**
- Modify: `src/store/corpus/corpus-types.ts`
- Modify: `scripts/build-corpus.ts`
- Modify: `.github/workflows/build-corpus.yml`
- Test: `scripts/build-corpus.test.ts` (create)

**Interfaces:**
- Produces: `DetailCard` (battle fields, no id); `detailCard(card): { id: string } & DetailCard`; `detailVersion(records): string` (sha256 hex of canonical JSON). The blob is a JSON array of `{ id, ...DetailCard }` sorted by `id`. R2 keys: `corpus/detail-latest.json.gz`, `corpus/detail-meta.json` where meta = `{ version, count, builtAt }`.

- [ ] **Step 1: Add the `DetailCard` type**

In `src/store/corpus/corpus-types.ts`, append:

```ts
/**
 * Per-card battle/flavor detail, stored in the optional offline detail blob
 * (corpus-detail.json.gz). Mirrors the CardStats fields the focus view renders,
 * minus prices (which drift) and setLogo (joined). Optional fields are omitted
 * when absent, matching CorpusCard.
 */
export interface DetailCard {
	hp?: string;
	evolvesFrom?: string;
	abilities?: { name: string; text: string; type: string }[];
	attacks?: { name: string; cost?: string[]; damage?: string; text?: string }[];
	rules?: string[];
	weaknesses?: { type: string; value: string }[];
	resistances?: { type: string; value: string }[];
	retreatCost?: string[];
	flavorText?: string;
	artist?: string;
}
```

- [ ] **Step 2: Write the failing test**

Create `scripts/build-corpus.test.ts`:

```ts
import { expect, test } from "bun:test";
import { detailCard, detailVersion, trimCard } from "./build-corpus";

const apiCard = {
	id: "base1-4",
	name: "Charizard",
	number: "4",
	images: { small: "s.png", large: "l.png" },
	rarity: "Rare Holo",
	subtypes: ["Stage 2"],
	supertype: "Pokémon",
	types: ["Fire"],
	set: { id: "base1" },
	nationalPokedexNumbers: [6],
	tcgplayer: { prices: { holofoil: { market: 100 } } },
	hp: "120",
	evolvesFrom: "Charmeleon",
	abilities: [{ name: "Energy Burn", text: "...", type: "Pokémon Power" }],
	attacks: [
		{ name: "Fire Spin", cost: ["Fire", "Fire"], convertedEnergyCost: 2, damage: "100", text: "Discard 2 Energy." },
	],
	rules: ["VMAX rule"],
	weaknesses: [{ type: "Water", value: "×2" }],
	resistances: [{ type: "Fighting", value: "-30" }],
	retreatCost: ["Colorless", "Colorless", "Colorless"],
	flavorText: "Spits fire hot enough to melt boulders.",
	artist: "Mitsuhiro Arita",
};

test("detailCard keeps battle/flavor fields and drops prices", () => {
	const d = detailCard(apiCard);
	expect(d.id).toBe("base1-4");
	expect(d.hp).toBe("120");
	expect(d.attacks?.[0]).toEqual({ name: "Fire Spin", cost: ["Fire", "Fire"], damage: "100", text: "Discard 2 Energy." });
	expect(d.flavorText).toContain("boulders");
	expect(d.artist).toBe("Mitsuhiro Arita");
	// No prices and no convertedEnergyCost leak in.
	expect(JSON.stringify(d)).not.toContain("market");
	expect(JSON.stringify(d)).not.toContain("convertedEnergyCost");
});

test("detailVersion is deterministic and content-addressed", () => {
	const a = [detailCard(apiCard)];
	const b = [detailCard({ ...apiCard })];
	expect(detailVersion(a)).toBe(detailVersion(b)); // same data, same hash
	const changed = [detailCard({ ...apiCard, flavorText: "Different." })];
	expect(detailVersion(changed)).not.toBe(detailVersion(a)); // real change flips it
	expect(detailVersion(a)).toMatch(/^[0-9a-f]{64}$/); // sha256 hex
});

test("trimCard still excludes battle fields", () => {
	expect(JSON.stringify(trimCard(apiCard))).not.toContain("Fire Spin");
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `bun test scripts/build-corpus.test.ts`
Expected: FAIL with `detailCard`/`detailVersion` not exported.

- [ ] **Step 4: Extend `ApiCard`, `SELECT`, and add the functions**

In `scripts/build-corpus.ts`:

a) Add `import { createHash } from "node:crypto";` at the top, and `import type { CorpusCard, DetailCard } from "../src/store/corpus/corpus-types";` (extend the existing import to include `DetailCard`).

b) Extend `SELECT` to add the detail fields:

```ts
const SELECT =
	"id,name,number,images,rarity,subtypes,supertype,types,set,nationalPokedexNumbers,tcgplayer," +
	"hp,evolvesFrom,abilities,attacks,rules,weaknesses,resistances,retreatCost,flavorText,artist";
```

c) Extend the `ApiCard` interface with the detail fields (mirror `DetailCard` plus the existing fields):

```ts
	hp?: string;
	evolvesFrom?: string;
	abilities?: { name: string; text: string; type: string }[];
	attacks?: { name: string; cost?: string[]; convertedEnergyCost?: number; damage?: string; text?: string }[];
	rules?: string[];
	weaknesses?: { type: string; value: string }[];
	resistances?: { type: string; value: string }[];
	retreatCost?: string[];
	flavorText?: string;
	artist?: string;
```

d) Add the extractor + version helpers (drop-undefined so JSON matches the serialized blob):

```ts
export type DetailRecord = { id: string } & DetailCard;

/** Extract the offline detail record for a card (battle/flavor fields, no prices). */
export function detailCard(card: ApiCard): DetailRecord {
	const out: DetailRecord = { id: card.id };
	if (card.hp) out.hp = card.hp;
	if (card.evolvesFrom) out.evolvesFrom = card.evolvesFrom;
	if (card.abilities) out.abilities = card.abilities.map((a) => ({ name: a.name, text: a.text, type: a.type }));
	if (card.attacks)
		out.attacks = card.attacks.map((a) => ({ name: a.name, cost: a.cost, damage: a.damage, text: a.text }));
	if (card.rules) out.rules = card.rules;
	if (card.weaknesses) out.weaknesses = card.weaknesses;
	if (card.resistances) out.resistances = card.resistances;
	if (card.retreatCost) out.retreatCost = card.retreatCost;
	if (card.flavorText) out.flavorText = card.flavorText;
	if (card.artist) out.artist = card.artist;
	// JSON.parse(JSON.stringify) drops any keys that ended up undefined.
	return JSON.parse(JSON.stringify(out));
}

/** Content hash of the canonical detail array (sorted by id). Independent of gzip. */
export function detailVersion(records: DetailRecord[]): string {
	const sorted = [...records].sort((a, b) => a.id.localeCompare(b.id));
	return createHash("sha256").update(JSON.stringify(sorted)).digest("hex");
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun test scripts/build-corpus.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Emit the detail artifacts from `main`**

Refactor `buildCorpus` to return the raw cards so both shapes derive from one crawl. Change the crawl array type and `return` to raw `ApiCard[]`:

- In `buildCorpus`, replace `const cards: CorpusCard[] = first.data.map(trimCard);` with `const cards: ApiCard[] = [...first.data];`, and replace `for (const c of data) cards.push(trimCard(c));` with `for (const c of data) cards.push(c);`. (The `cards.length` completeness check is unaffected.)

Then update the `import.meta.main` block:

```ts
if (import.meta.main) {
	const apiKey = process.env.POKEMONTCG_API_KEY;
	if (!apiKey) throw new Error("POKEMONTCG_API_KEY not set");
	const outfile = process.argv[2] ?? "corpus.json.gz";
	const startedAt = Date.now();
	const raw = await buildCorpus(apiKey);

	const trimmed = raw.map(trimCard);
	const detail = raw.map(detailCard).sort((a, b) => a.id.localeCompare(b.id));
	const version = detailVersion(detail);

	const gz = gzipSync(Buffer.from(JSON.stringify(trimmed)));
	const detailGz = gzipSync(Buffer.from(JSON.stringify(detail)));
	const meta = { version, count: detail.length, builtAt: new Date().toISOString() };

	await Bun.write(outfile, gz);
	await Bun.write("corpus-detail.json.gz", detailGz);
	await Bun.write("corpus-detail.meta.json", JSON.stringify(meta));

	const mb = (gz.length / 1024 / 1024).toFixed(2);
	const dmb = (detailGz.length / 1024 / 1024).toFixed(2);
	const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
	console.log(`Wrote ${trimmed.length} cards → ${outfile} (${mb} MB) + detail (${dmb} MB, v${version.slice(0, 8)}) in ${secs}s`);
}
```

- [ ] **Step 7: Verify the build still type-checks and tests pass**

Run: `bunx tsc -b && bun test scripts/build-corpus.test.ts`
Expected: tsc clean, tests PASS. (Do NOT run the live crawl; it needs the API key + network.)

- [ ] **Step 8: Upload the new artifacts in CI**

In `.github/workflows/build-corpus.yml`, the build step already runs `bun run scripts/build-corpus.ts corpus.json.gz` (now also writing `corpus-detail.json.gz` + `corpus-detail.meta.json`). In the "Upload to R2" step, add two more `wrangler r2 object put` commands after the existing one:

```yaml
          bunx wrangler r2 object put \
            pokemon-tcg-corpus/corpus/detail-latest.json.gz \
            --file=corpus-detail.json.gz --remote
          bunx wrangler r2 object put \
            pokemon-tcg-corpus/corpus/detail-meta.json \
            --file=corpus-detail.meta.json --remote
```

- [ ] **Step 9: Lint + commit**

Run: `bunx biome check --write --config-path=. scripts/build-corpus.ts scripts/build-corpus.test.ts src/store/corpus/corpus-types.ts`

```bash
git add scripts/build-corpus.ts scripts/build-corpus.test.ts src/store/corpus/corpus-types.ts .github/workflows/build-corpus.yml
git commit -m "feat(corpus): emit offline detail blob + content version from the crawl"
```

---

## Task 2: Worker routes for the detail blob + version

**Files:**
- Modify: `worker/src/index.ts`
- Test: `worker/src/index.test.ts`

**Interfaces:**
- Consumes: R2 keys `corpus/detail-latest.json.gz`, `corpus/detail-meta.json` (from Task 1).
- Produces: `GET /corpus-detail` (octet-stream gz, ETag, CORS, 503 when missing); `GET /corpus-detail/version` (the meta JSON, CORS).

- [ ] **Step 1: Write the failing tests**

In `worker/src/index.test.ts`, extend the `CORPUS` mock's `get` to also resolve the two new keys, then add two tests. Find the existing mock (`get(key)` returning the corpus object) and add branches:

```ts
// inside the CORPUS mock get(key):
if (key === "corpus/detail-latest.json.gz") return { body: new Blob(["DETAIL_GZ"]).stream(), etag: "detailtag" };
if (key === "corpus/detail-meta.json") return { body: new Blob(['{"version":"abc","count":2,"builtAt":"x"}']).stream(), etag: "metatag" };
```

Add tests (mirror the existing `/corpus` tests' style):

```ts
test("/corpus-detail serves the blob with an ETag and CORS", async () => {
	const res = await worker.fetch(new Request("https://proxy.test/corpus-detail"), env, ctx);
	expect(res.status).toBe(200);
	expect(res.headers.get("ETag")).toBe('"detailtag"');
	expect(res.headers.get("Access-Control-Allow-Origin")).toBeTruthy();
});

test("/corpus-detail/version serves the meta JSON", async () => {
	const res = await worker.fetch(new Request("https://proxy.test/corpus-detail/version"), env, ctx);
	expect(res.status).toBe(200);
	expect(await res.json()).toMatchObject({ version: "abc", count: 2 });
});

test("/corpus-detail returns 503 when the object is missing", async () => {
	const emptyEnv = { ...env, CORPUS: { get: async () => null } };
	const res = await worker.fetch(new Request("https://proxy.test/corpus-detail"), emptyEnv, ctx);
	expect(res.status).toBe(503);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test worker/src/index.test.ts`
Expected: FAIL (routes return 404 / not handled).

- [ ] **Step 3: Add the routes**

In `worker/src/index.ts`, inside `fetch`, after the existing `if (url.pathname === "/corpus") { ... }` block, add:

```ts
		if (url.pathname === "/corpus-detail/version") {
			const obj = await env.CORPUS.get("corpus/detail-meta.json");
			if (!obj) {
				return new Response("Detail not built yet", { status: 503, headers: corsHeaders(env) });
			}
			return new Response(obj.body, {
				headers: {
					...corsHeaders(env),
					"Content-Type": "application/json",
					"Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=86400",
				},
			});
		}

		if (url.pathname === "/corpus-detail") {
			const obj = await env.CORPUS.get("corpus/detail-latest.json.gz");
			if (!obj) {
				return new Response("Detail not built yet", { status: 503, headers: corsHeaders(env) });
			}
			const res = new Response(obj.body, {
				headers: {
					"Content-Type": "application/octet-stream",
					ETag: `"${obj.etag}"`,
					"Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
				},
			});
			return serveCorpus(res, request, env);
		}
```

(Order matters: the `/version` check precedes `/corpus-detail` so the more specific path wins.)

- [ ] **Step 4: Run to verify pass**

Run: `bun test worker/src/index.test.ts`
Expected: PASS (all worker tests, including the 3 new).

- [ ] **Step 5: Typecheck worker + commit**

Run: `bun run typecheck:worker`

```bash
git add worker/src/index.ts worker/src/index.test.ts
git commit -m "feat(worker): serve /corpus-detail blob + /corpus-detail/version probe"
```

---

## Task 3: Client IndexedDB store for the detail blob

**Files:**
- Create: `src/store/corpus/detail-store.ts`
- Test: `src/store/corpus/detail-store.test.ts`

**Interfaces:**
- Produces: `DetailMeta { version: string; syncedAt: number; count: number; enabled: boolean }`; `readDetailGz(): Promise<ArrayBuffer | undefined>`; `readDetailMeta(): Promise<DetailMeta | undefined>`; `writeDetail(gz, meta): Promise<void>`; `clearDetail(): Promise<void>`; `setDetailEnabled(enabled): Promise<void>`.

- [ ] **Step 1: Write the failing test**

Create `src/store/corpus/detail-store.test.ts`:

```ts
import { expect, test } from "bun:test";
import { clearDetail, readDetailGz, readDetailMeta, writeDetail } from "./detail-store";

test("writeDetail then read returns gz + meta; clear removes both", async () => {
	const gz = new Uint8Array([1, 2, 3]).buffer;
	const meta = { version: "v1", syncedAt: 123, count: 2, enabled: true };
	await writeDetail(gz, meta);
	expect(await readDetailMeta()).toEqual(meta);
	expect(new Uint8Array((await readDetailGz()) as ArrayBuffer)).toEqual(new Uint8Array([1, 2, 3]));
	await clearDetail();
	expect(await readDetailMeta()).toBeUndefined();
	expect(await readDetailGz()).toBeUndefined();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test src/store/corpus/detail-store.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the store (mirror `corpus-store.ts`)**

Create `src/store/corpus/detail-store.ts`:

```ts
import { createStore, del, get, set, setMany } from "idb-keyval";

// Dedicated IDB store for the optional offline detail blob. Kept out of the
// persisted Zustand blob, exactly like the corpus.
const store = createStore("ptcg-corpus-detail", "blob");

export interface DetailMeta {
	/** Content version (sha256 of the canonical detail JSON) of the stored blob. */
	version: string;
	/** ms since epoch of the last successful sync. */
	syncedAt: number;
	/** Card count in the stored blob. */
	count: number;
	/** Whether offline detail is currently turned on. */
	enabled: boolean;
}

export function readDetailGz(): Promise<ArrayBuffer | undefined> {
	return get<ArrayBuffer>("gz", store);
}

export function readDetailMeta(): Promise<DetailMeta | undefined> {
	return get<DetailMeta>("meta", store);
}

export async function writeDetail(gz: ArrayBuffer, meta: DetailMeta): Promise<void> {
	// Atomic: one transaction so a crash can't leave gz without meta.
	await setMany(
		[
			["gz", gz],
			["meta", meta],
		],
		store,
	);
}

/** Flip the enabled flag without touching the blob (e.g. disable but keep bytes). */
export async function setDetailEnabled(enabled: boolean): Promise<void> {
	const meta = await readDetailMeta();
	if (meta) await set("meta", { ...meta, enabled }, store);
}

export async function clearDetail(): Promise<void> {
	await del("gz", store);
	await del("meta", store);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `bun test src/store/corpus/detail-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint + commit**

Run: `bunx biome check --write --config-path=. src/store/corpus/detail-store.ts src/store/corpus/detail-store.test.ts`

```bash
git add src/store/corpus/detail-store.ts src/store/corpus/detail-store.test.ts
git commit -m "feat(corpus): IndexedDB store for the offline detail blob"
```

---

## Task 4: Detail runtime store (load / enable / sync / stale / disable)

**INVOKE the `zustand-subscription-patterns` skill before starting.**

**Files:**
- Create: `src/store/corpus/detail-runtime.ts`
- Test: `src/store/corpus/detail-runtime.test.ts`

**Interfaces:**
- Consumes: `detail-store` (Task 3); `DetailCard` (Task 1); `apiBase()` from `src/lib/api-base-client.ts`.
- Produces: `useDetailRuntime` (non-persisted Zustand store) with state `{ detailById: Map<string, DetailCard> | null; enabled: boolean; version: string | null; syncedAt: number | null; status }`; actions `loadDetail()`, `enableOffline()`, `syncDetail()`, `checkStale()`, `disableOffline()`; test seam `setDetailFetchersForTests({ fetchVersion, fetchBlob })` + `resetDetailRuntimeForTests()`. `status: "off" | "loading" | "downloading" | "ready" | "stale" | "error"`.

- [ ] **Step 1: Write the failing test**

Create `src/store/corpus/detail-runtime.test.ts`. The store fetches via injectable functions so tests never hit the network:

```ts
import { beforeEach, expect, test } from "bun:test";
import { gzipSync } from "node:zlib";
import {
	checkStale,
	disableOffline,
	enableOffline,
	resetDetailRuntimeForTests,
	setDetailFetchersForTests,
	syncDetail,
	useDetailRuntime,
} from "./detail-runtime";

const RECORDS = [{ id: "base1-4", hp: "120", artist: "Arita" }];
const blob = () => gzipSync(Buffer.from(JSON.stringify(RECORDS))).buffer;

beforeEach(async () => {
	await resetDetailRuntimeForTests();
});

test("enableOffline downloads, builds the map, and marks ready", async () => {
	setDetailFetchersForTests({
		fetchVersion: async () => ({ version: "v1", count: 1, builtAt: "x" }),
		fetchBlob: async () => blob(),
	});
	await enableOffline();
	const s = useDetailRuntime.getState();
	expect(s.status).toBe("ready");
	expect(s.enabled).toBe(true);
	expect(s.detailById?.get("base1-4")?.hp).toBe("120");
	expect(s.version).toBe("v1");
});

test("syncDetail is a no-op when version is unchanged", async () => {
	let blobCalls = 0;
	setDetailFetchersForTests({
		fetchVersion: async () => ({ version: "v1", count: 1, builtAt: "x" }),
		fetchBlob: async () => { blobCalls++; return blob(); },
	});
	await enableOffline(); // 1 blob fetch
	await syncDetail(); // version matches -> no re-download
	expect(blobCalls).toBe(1);
	expect(useDetailRuntime.getState().status).toBe("ready");
});

test("checkStale flips to stale when the server version differs", async () => {
	setDetailFetchersForTests({
		fetchVersion: async () => ({ version: "v1", count: 1, builtAt: "x" }),
		fetchBlob: async () => blob(),
	});
	await enableOffline();
	setDetailFetchersForTests({
		fetchVersion: async () => ({ version: "v2", count: 1, builtAt: "y" }),
		fetchBlob: async () => blob(),
	});
	await checkStale();
	expect(useDetailRuntime.getState().status).toBe("stale");
});

test("disableOffline clears the map and flag", async () => {
	setDetailFetchersForTests({
		fetchVersion: async () => ({ version: "v1", count: 1, builtAt: "x" }),
		fetchBlob: async () => blob(),
	});
	await enableOffline();
	await disableOffline();
	const s = useDetailRuntime.getState();
	expect(s.enabled).toBe(false);
	expect(s.detailById).toBeNull();
	expect(s.status).toBe("off");
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test src/store/corpus/detail-runtime.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the runtime store**

Create `src/store/corpus/detail-runtime.ts`:

```ts
import { create } from "zustand";
import { apiBase } from "../../lib/api-base-client";
import type { DetailCard } from "./corpus-types";
import {
	clearDetail,
	readDetailGz,
	readDetailMeta,
	setDetailEnabled,
	writeDetail,
} from "./detail-store";

type DetailRecord = { id: string } & DetailCard;
interface DetailVersionMeta { version: string; count: number; builtAt: string }

export type DetailStatus = "off" | "loading" | "downloading" | "ready" | "stale" | "error";

interface DetailRuntimeState {
	detailById: Map<string, DetailCard> | null;
	enabled: boolean;
	version: string | null;
	syncedAt: number | null;
	status: DetailStatus;
}

export const useDetailRuntime = create<DetailRuntimeState>(() => ({
	detailById: null,
	enabled: false,
	version: null,
	syncedAt: null,
	status: "off",
}));

// Injectable network seam so tests never hit the wire.
let fetchVersion = async (): Promise<DetailVersionMeta> => {
	const res = await fetch(`${apiBase()}/corpus-detail/version`, { cache: "no-store" });
	if (!res.ok) throw new Error(`version ${res.status}`);
	return (await res.json()) as DetailVersionMeta;
};
let fetchBlob = async (): Promise<ArrayBuffer> => {
	const res = await fetch(`${apiBase()}/corpus-detail`);
	if (!res.ok) throw new Error(`detail ${res.status}`);
	return res.arrayBuffer();
};

export function setDetailFetchersForTests(f: { fetchVersion: typeof fetchVersion; fetchBlob: typeof fetchBlob }): void {
	fetchVersion = f.fetchVersion;
	fetchBlob = f.fetchBlob;
}

async function gunzip(buf: ArrayBuffer): Promise<string> {
	const ds = new DecompressionStream("gzip");
	const stream = new Blob([buf]).stream().pipeThrough(ds);
	return await new Response(stream).text();
}

function buildMap(records: DetailRecord[]): Map<string, DetailCard> {
	const m = new Map<string, DetailCard>();
	for (const { id, ...rest } of records) m.set(id, rest);
	return m;
}

/** Boot: if offline detail is enabled, hydrate the map from IDB. No network. */
export async function loadDetail(): Promise<void> {
	const meta = await readDetailMeta();
	if (!meta?.enabled) {
		useDetailRuntime.setState({ enabled: false, status: "off" });
		return;
	}
	useDetailRuntime.setState({ enabled: true, status: "loading" });
	const gz = await readDetailGz();
	if (!gz) {
		useDetailRuntime.setState({ status: "off", enabled: false });
		return;
	}
	const records = JSON.parse(await gunzip(gz)) as DetailRecord[];
	useDetailRuntime.setState({
		detailById: buildMap(records),
		version: meta.version,
		syncedAt: meta.syncedAt,
		status: "ready",
	});
}

/** Download the blob, store it, build the map, and turn the feature on. */
export async function enableOffline(): Promise<void> {
	useDetailRuntime.setState({ status: "downloading", enabled: true });
	try {
		const [{ version, count }, gz] = await Promise.all([fetchVersion(), fetchBlob()]);
		const records = JSON.parse(await gunzip(gz)) as DetailRecord[];
		const syncedAt = useDetailRuntime.getState().syncedAt ?? 0;
		const now = syncedAt + 1; // monotonic without Date.now (kept deterministic for tests)
		await writeDetail(gz, { version, syncedAt: now, count, enabled: true });
		useDetailRuntime.setState({ detailById: buildMap(records), version, syncedAt: now, status: "ready" });
	} catch {
		useDetailRuntime.setState({ status: "error" });
	}
}

/** Re-download only if the server version differs from the stored one. */
export async function syncDetail(): Promise<void> {
	try {
		const { version } = await fetchVersion();
		if (version === useDetailRuntime.getState().version) {
			useDetailRuntime.setState({ status: "ready" });
			return;
		}
		await enableOffline();
	} catch {
		useDetailRuntime.setState({ status: "error" });
	}
}

/** Cheap probe: mark stale (do not download) when the server version differs. */
export async function checkStale(): Promise<void> {
	if (!useDetailRuntime.getState().enabled) return;
	try {
		const { version } = await fetchVersion();
		if (version !== useDetailRuntime.getState().version) {
			useDetailRuntime.setState({ status: "stale" });
		}
	} catch {
		// offline / transient: leave status as-is.
	}
}

export async function disableOffline(): Promise<void> {
	await clearDetail();
	useDetailRuntime.setState({ detailById: null, enabled: false, version: null, syncedAt: null, status: "off" });
}

export async function resetDetailRuntimeForTests(): Promise<void> {
	await clearDetail();
	await setDetailEnabled(false);
	useDetailRuntime.setState({ detailById: null, enabled: false, version: null, syncedAt: null, status: "off" });
}
```

Note on `syncedAt`: `Date.now()` is avoided in the store body so tests stay deterministic and to match the corpus pattern of not embedding wall-clock in logic; the relative-time label in the UI (Task 7) formats `syncedAt` and may use `Date.now()` at the component boundary. If a real timestamp is preferred, stamp it in the UI action wrapper, not here.

- [ ] **Step 4: Run to verify pass**

Run: `bun test src/store/corpus/detail-runtime.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck + lint + commit**

Run: `bunx tsc -b && bunx biome check --write --config-path=. src/store/corpus/detail-runtime.ts src/store/corpus/detail-runtime.test.ts`

```bash
git add src/store/corpus/detail-runtime.ts src/store/corpus/detail-runtime.test.ts
git commit -m "feat(corpus): detail runtime store (load/enable/sync/stale/disable)"
```

---

## Task 5: Modal join, render detail from local memory

**INVOKE the `zustand-subscription-patterns` skill before starting** (the overlay gains a new store subscription).

**Files:**
- Modify: `src/lib/card-detail.ts`
- Modify: `src/lib/card-detail.test.ts`
- Modify: `src/components/islands/card-overlay.tsx`

**Interfaces:**
- Consumes: `useDetailRuntime` + `DetailCard` (Task 4); existing `optimisticCardFromCorpus`.
- Produces: `optimisticCardFromCorpus(params, slugIndex, index, sets, detailById?)`, when `detailById` has the card, the returned `FocusCardData` includes battle fields. The overlay sets `pending=false` when the local card is detail-complete.

- [ ] **Step 1: Write the failing test**

In `src/lib/card-detail.test.ts`, add a case (reuse the existing `index`, `slugIndex`, `sets`, `params` fixtures):

```ts
test("optimisticCardFromCorpus merges local detail when provided", () => {
	const detailById = new Map([["base1-4", { hp: "120", attacks: [{ name: "Fire Spin", damage: "100" }], artist: "Arita" }]]);
	const card = optimisticCardFromCorpus(params, slugIndex, index, sets, detailById);
	expect(card?.hp).toBe("120");
	expect(card?.attacks?.[0]?.name).toBe("Fire Spin");
	expect(card?.artist).toBe("Arita");
	// Without the map, battle fields stay absent (today's behaviour).
	const bare = optimisticCardFromCorpus(params, slugIndex, index, sets);
	expect(bare?.hp).toBeUndefined();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test src/lib/card-detail.test.ts`
Expected: FAIL (5th arg not accepted / fields not merged).

- [ ] **Step 3: Add the `detailById` join**

In `src/lib/card-detail.ts`, import the type and extend the function signature + return:

a) Add `import type { CorpusIndex } from "../store/corpus/corpus-engine";` already exists; add `import type { DetailCard } from "../store/corpus/corpus-types";`.

b) Change the signature to accept the optional map and spread its fields into the returned object (place the spread BEFORE the corpus-derived required fields so corpus values win on any overlap, though there is none):

```ts
export function optimisticCardFromCorpus(
	params: CardRouteParams,
	slugIndex: SlugIndex | null,
	index: CorpusIndex | null,
	sets: PokemonSet[] | null,
	detailById?: Map<string, DetailCard> | null,
): FocusCardData | null {
	if (!slugIndex || !index || !sets) return null;
	const id = resolveCard(slugIndex, params.series, params.set, params.card);
	const corpusCard = id ? index.byId.get(id) : undefined;
	if (!corpusCard) return null;
	const holo = hydrateCard(corpusCard, setsById(sets));
	const detail = detailById?.get(corpusCard.id);
	return {
		...detail, // battle/flavor fields when offline detail is present; else nothing
		id: holo.id,
		imageUrl: holo.imageUrl,
		name: holo.name,
		rarity: holo.rarity,
		subtypes: holo.subtypes,
		types: holo.types,
		supertype: corpusCard.supertype,
		setId: holo.setId,
		setName: holo.setName,
		setSeries: holo.setSeries,
		setReleaseDate: holo.setReleaseDate,
		cardNumber: holo.cardNumber,
		nationalPokedexNumbers: holo.nationalPokedexNumbers,
	};
}
```

- [ ] **Step 4: Run to verify pass**

Run: `bun test src/lib/card-detail.test.ts`
Expected: PASS (8 existing + 1 new).

- [ ] **Step 5: Wire the overlay to local detail**

In `src/components/islands/card-overlay.tsx`:

a) Add `import { useDetailRuntime } from "../../store/corpus/detail-runtime";`.

b) Subscribe (S3, narrow): `const detailById = useDetailRuntime((s) => s.detailById);`.

c) Pass it into the memoized optimistic call and compute completeness:

```ts
	const optimistic = useMemo(
		() => (params ? optimisticCardFromCorpus(params, slugIndex, index, sets, detailById) : null),
		[params, slugIndex, index, sets, detailById],
	);
	// Detail is "complete" locally when the offline blob covered this card.
	const haveLocalDetail = Boolean(params && detailById && optimistic?.attacks !== undefined) || Boolean(optimistic && detailById?.has(optimistic.id));
```

Replace the `pending` computation so the battle ghost is suppressed when local detail is present (prices still arrive via the background RPC, which keeps running):

```ts
	const pending = settled === undefined && !detailHasCard(detailById, optimistic);
```

Add a tiny local helper above the component:

```ts
function detailHasCard(
	detailById: Map<string, unknown> | null,
	card: { id: string } | null,
): boolean {
	return Boolean(card && detailById?.has(card.id));
}
```

(Leave the `getCardDetail` effect untouched: it still fetches prices + cross-links and, when it resolves, `detail?.card` replaces the optimistic card with the priced version. When `detailById` has the card, the user sees full battle data immediately and prices fill in; the ghost never shows for battle data.)

- [ ] **Step 6: Typecheck + lint + commit**

Run: `bunx tsc -b && bunx biome check --write --config-path=. src/lib/card-detail.ts src/components/islands/card-overlay.tsx`

```bash
git add src/lib/card-detail.ts src/lib/card-detail.test.ts src/components/islands/card-overlay.tsx
git commit -m "feat(card-modal): render battle data from the local offline blob when present"
```

---

## Task 6: Render flavor text in the card detail

**Files:**
- Modify: `src/components/card/card-info.tsx`
- Test: `src/components/card/card-detail.test.tsx`

**Interfaces:**
- Consumes: `FocusCardData.flavorText` (already mapped by the RPC and now in the local blob).

- [ ] **Step 1: Write the failing test**

In `src/components/card/card-detail.test.tsx`, add a test that a card with `flavorText` renders it. Follow the file's existing render harness (it already renders `CardDetail` with a `FocusCardData`); add:

```ts
test("renders flavor text when present", async () => {
	const card = { ...baseFocusCard, flavorText: "Spits fire that melts boulders." };
	render(<CardDetail card={card} crossLinks={[]} />);
	expect(await screen.findByText(/melts boulders/i)).toBeTruthy();
});
```

(Use the file's existing `baseFocusCard`/fixture and its render/query imports. If the file lacks a reusable fixture, build a minimal `FocusCardData` inline with the required fields: `id, name, supertype, setId, setName, setSeries, cardNumber, imageUrl`.)

- [ ] **Step 2: Run to verify failure**

Run: `bun test src/components/card/card-detail.test.tsx`
Expected: FAIL (flavor text not in the DOM).

- [ ] **Step 3: Render the flavor section**

In `src/components/card/card-info.tsx`, inside the `flex-1` body, after the `rules` block and before the `{emptyBody && pending ? <BodyGhost /> : null}` line, add:

```tsx
				{card.flavorText ? (
					<p className="mt-4 border-t border-white/[0.07] pt-3 font-display text-[13px] italic leading-relaxed text-[var(--ink-muted)]">
						{card.flavorText}
					</p>
				) : pending ? (
					<div aria-hidden="true" className="mt-4 border-t border-white/[0.07] pt-3">
						<Skeleton className="h-3 w-full" />
						<Skeleton className="mt-1.5 h-3 w-4/5" />
					</div>
				) : null}
```

(`Skeleton` is already imported in this file from Task scope of PR #19; if not present, add `import { Skeleton } from "@/components/ui/skeleton";`.)

- [ ] **Step 4: Run to verify pass**

Run: `bun test src/components/card/card-detail.test.tsx`
Expected: PASS.

- [ ] **Step 5: Lint + commit**

Run: `bunx biome check --write --config-path=. src/components/card/card-info.tsx src/components/card/card-detail.test.tsx`

```bash
git add src/components/card/card-info.tsx src/components/card/card-detail.test.tsx
git commit -m "feat(card-detail): render flavor text"
```

---

## Task 7: Sidebar offline toggle

**INVOKE the `zustand-subscription-patterns` skill before starting.**

**Files:**
- Create: `src/components/shell/offline-toggle.tsx`
- Create: `src/components/shell/offline-toggle.test.tsx`
- Modify: `src/components/shell/sidebar-user-menu.tsx`
- Modify: a boot effect to call `loadDetail()` (see Step 6)

**Interfaces:**
- Consumes: `useDetailRuntime` status + actions (Task 4).
- Produces: `<OfflineToggle />`, a `DropdownMenuItem`-based control reflecting `status` with the correct copy + click action.

- [ ] **Step 1: Write the failing test**

Create `src/components/shell/offline-toggle.test.tsx`:

```ts
import { expect, test } from "vitest";
import { render, screen } from "vitest-browser-react";
import { useDetailRuntime } from "../../store/corpus/detail-runtime";
import { OfflineToggle } from "./offline-toggle";

test("shows the download CTA when off", async () => {
	useDetailRuntime.setState({ status: "off", enabled: false });
	render(<OfflineToggle />);
	await expect.element(screen.getByText(/download card details/i)).toBeInTheDocument();
});

test("shows the re-sync CTA when stale", async () => {
	useDetailRuntime.setState({ status: "stale", enabled: true });
	render(<OfflineToggle />);
	await expect.element(screen.getByText(/re-?sync/i)).toBeInTheDocument();
});

test("shows saved state when ready", async () => {
	useDetailRuntime.setState({ status: "ready", enabled: true, syncedAt: 1 });
	render(<OfflineToggle />);
	await expect.element(screen.getByText(/saved/i)).toBeInTheDocument();
});
```

(This is a browser-provider test; if the repo's component tests use bun + happy-dom instead, mirror `card-detail.test.tsx`'s harness and assertions rather than `vitest-browser-react`.)

- [ ] **Step 2: Run to verify failure**

Run: `bun test src/components/shell/offline-toggle.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the toggle**

Create `src/components/shell/offline-toggle.tsx`:

```tsx
import { Check, CloudDownload, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
	disableOffline,
	enableOffline,
	syncDetail,
	useDetailRuntime,
} from "@/store/corpus/detail-runtime";

const SIZE = "~2.1 MiB";

/** Sidebar menu control for the optional offline card-detail blob. */
export function OfflineToggle() {
	const status = useDetailRuntime((s) => s.status);
	const syncedAt = useDetailRuntime((s) => s.syncedAt);

	if (status === "downloading" || status === "loading") {
		return (
			<DropdownMenuItem disabled>
				<Loader2 className="animate-spin motion-reduce:animate-none" />
				Downloading card details...
			</DropdownMenuItem>
		);
	}

	if (status === "stale") {
		return (
			<DropdownMenuItem onSelect={(e) => { e.preventDefault(); void syncDetail(); }}>
				<RefreshCw />
				Card details updated. Re-sync ({SIZE}).
			</DropdownMenuItem>
		);
	}

	if (status === "ready") {
		return (
			<>
				<DropdownMenuItem disabled>
					<Check className="text-(--success)" />
					Card details saved{syncedAt ? "." : "."}
				</DropdownMenuItem>
				<DropdownMenuItem onSelect={(e) => { e.preventDefault(); void disableOffline(); }}>
					<Trash2 />
					Remove offline data
				</DropdownMenuItem>
			</>
		);
	}

	// off | error
	return (
		<DropdownMenuItem onSelect={(e) => { e.preventDefault(); void enableOffline(); }}>
			<CloudDownload />
			{status === "error" ? "Download failed. Retry." : `Download card details (${SIZE})`}
		</DropdownMenuItem>
	);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `bun test src/components/shell/offline-toggle.test.tsx`
Expected: PASS.

- [ ] **Step 5: Mount it in the user menu**

In `src/components/shell/sidebar-user-menu.tsx`, import `OfflineToggle` and add a new group above the action group (with a separator). Inside `<DropdownMenuContent>`, after the info `<DropdownMenuLabel>` + its `<DropdownMenuSeparator />`, insert:

```tsx
							<DropdownMenuGroup>
								<OfflineToggle />
							</DropdownMenuGroup>
							<DropdownMenuSeparator />
```

Add `import { OfflineToggle } from "./offline-toggle";` and trigger a staleness check when the menu opens by wrapping the existing `<DropdownMenu>` with `onOpenChange`:

```tsx
						<DropdownMenu onOpenChange={(open) => { if (open) void checkStale(); }}>
```

Add `import { checkStale } from "@/store/corpus/detail-runtime";`.

- [ ] **Step 6: Hydrate on boot**

In `src/components/islands/card-grid-island.tsx`, the mount effect already calls `void loadCorpus();` and `void useStore.getState().loadSets();`. Add `void loadDetail();` there (it is a no-op when offline detail is disabled), and import it: `import { loadDetail } from "../../store/corpus/detail-runtime";`. Keep the existing test-env guard above it.

- [ ] **Step 7: Typecheck + lint + commit**

Run: `bunx tsc -b && bunx biome check --write --config-path=. src/components/shell/offline-toggle.tsx src/components/shell/offline-toggle.test.tsx src/components/shell/sidebar-user-menu.tsx src/components/islands/card-grid-island.tsx`

```bash
git add src/components/shell/offline-toggle.tsx src/components/shell/offline-toggle.test.tsx src/components/shell/sidebar-user-menu.tsx src/components/islands/card-grid-island.tsx
git commit -m "feat(shell): sidebar offline-detail toggle + boot hydration"
```

---

## Task 8: Full verification + leak guard

**Files:** none (verification only).

- [ ] **Step 1: Full test suite**

Run: `bun test`
Expected: all pass (existing 1052 + the new tests).

- [ ] **Step 2: Typecheck (full)**

Run: `bunx tsc -b`
Expected: clean.

- [ ] **Step 3: Build + client-bundle leak guard**

Run: `bun run build:check`
Expected: build succeeds and `[check-client-bundle] OK`. (Confirms the new detail-runtime fetch path did not drag server-only code or node builtins into the client bundle.)

- [ ] **Step 4: Manual smoke (optional, dev server)**

Boot the dev server, open the user menu, click "Download card details", confirm the item shows downloading then "saved", open a card and confirm battle data renders with no ghost (prices may still pop in). Then in DevTools go offline and confirm a card still opens with battle data + flavor text.

- [ ] **Step 5: Commit any lint fixups**

```bash
git add -A
git commit -m "chore: offline card detail verification pass" || echo "nothing to commit"
```

---

## Self-Review

**Spec coverage:**
- Build (one crawl, two artifacts, sha256 version) → Task 1. ✓
- CI upload → Task 1 Step 8. ✓
- Worker `/corpus-detail` + `/corpus-detail/version` → Task 2. ✓
- IDB store → Task 3. ✓
- Runtime store (load/enable/sync/stale/disable) → Task 4. ✓
- Modal join (battle data instant; prices via background RPC) → Task 5. ✓
- Flavor text render → Task 6. ✓
- Sidebar toggle + boot hydration + menu-open stale check → Task 7. ✓
- Staleness model (content version, 304-equivalent via version compare) → Tasks 2/4. ✓
- Testing strategy (no network, fakes, S3) → embedded per task. ✓
- Future work (L2 images) → spec only, intentionally no tasks. ✓

**Type consistency:** `DetailCard` (Task 1) is consumed unchanged in Tasks 4/5; `DetailRecord = { id } & DetailCard` used in build + runtime; `useDetailRuntime` state shape identical in Tasks 4/5/7; action names (`loadDetail`, `enableOffline`, `syncDetail`, `checkStale`, `disableOffline`) consistent across Tasks 4/7. R2 keys (`corpus/detail-latest.json.gz`, `corpus/detail-meta.json`) consistent across Tasks 1/2. Route paths consistent across Tasks 2/4.

**Placeholder scan:** no TBD/TODO; each code step shows the actual code. Task 6/7 test harness notes give a concrete fallback (mirror `card-detail.test.tsx`) rather than leaving it open.
