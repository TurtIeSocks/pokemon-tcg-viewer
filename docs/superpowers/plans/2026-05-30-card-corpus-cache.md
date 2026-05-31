# Card Corpus Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve all browse/search paths from a complete local copy of card metadata (built centrally at the edge, downloaded once per client), making search instant and offline-capable.

**Architecture:** A GitHub Action crawls pokemontcg.io weekly, builds a gzipped `CorpusCard[]` blob, and uploads it to Cloudflare R2. The existing Worker gains a `/corpus` route serving the blob with an ETag. The client downloads it once into a dedicated IndexedDB store, decompresses it into an in-memory index, and runs a pure query engine (predicates + fuzzy name match + natural sort) that implements the existing `CardFetcher` interface. `browse-page` swaps `apiFetcher → corpusFetcher` once `corpusReady`; everything downstream is unchanged.

**Tech Stack:** TypeScript, React 19, Zustand, idb-keyval, Cloudflare Workers + R2, `bun test` (happy-dom + fake-indexeddb), Biome.

**Spec:** `docs/superpowers/specs/2026-05-30-card-corpus-cache-design.md`

---

## Conventions for this plan

- **Test runner:** `bun test`. Import from `bun:test` (`test`, `expect`, `describe`, `mock`, `beforeEach`, `afterEach`). Client DOM/IDB tests rely on the existing `src/test-setup.ts` (happy-dom + `fake-indexeddb/auto`).
- **Run one test file:** `bun test <path>`.
- **Typecheck:** `bun run typecheck` (app) / `bun run typecheck:worker` (worker).
- **Lint in this worktree:** the repo lint script `biome check` trips on the nested worktree `biome.json`. Lint touched files with `biome check --config-path=. <files>` (or `--write` to fix). Run from the worktree root.
- **Commit scope:** `git add` the explicit paths each task names. Never `git add -A`.
- **TypeScript style:** `interface` for object shapes; `import type` for type-only imports.

---

## File structure

**New — client (`src/store/corpus/`):**
- `corpus-types.ts` — `CorpusCard` interface (shared with the build script via type-only import).
- `natural-compare.ts` — `compareCardNumber` (API-parity numeric sort).
- `fuzzy.ts` — `normalize`, `editDistance`, `matchName`.
- `corpus-engine.ts` — `buildIndex`, `queryCorpus` (predicates + ordering + hydrate). Pure.
- `corpus-store.ts` — dedicated idb-keyval store (gz `ArrayBuffer` + meta).
- `corpus-runtime.ts` — non-persisted Zustand store holding the in-memory index + `corpusReady`; `loadCorpus()`; `makeCorpusFetcher()`.

**New — build/CI:**
- `scripts/build-corpus.ts` — crawl + trim + gzip (Bun script).
- `.github/workflows/build-corpus.yml` — weekly + manual; runs the script, uploads to R2 via `wrangler r2 object put`.

**Modified:**
- `worker/src/index.ts` — add `/corpus` route + R2 binding usage.
- `worker/wrangler.toml` — add `[[r2_buckets]]` binding.
- `worker/src/index.test.ts` — tests for `/corpus`.
- `src/pages/browse-page.tsx` — fetcher swap behind `corpusReady`.
- `src/root-layout.tsx` — kick off `loadCorpus()` once on mount.

**Why a separate `corpus-runtime` Zustand store (not the persisted `useStore`):** the persisted store re-serializes its whole partialized state to IDB on every change. The ~20k-card index must never enter it. A separate `create()` store with no `persist` holds the index in memory only.

---

## Phase A — Server (serve path first)

### Task A1: Worker `/corpus` route + R2 binding

**Files:**
- Modify: `worker/wrangler.toml`
- Modify: `worker/src/index.ts`
- Test: `worker/src/index.test.ts`

- [ ] **Step 1: Add the R2 binding to wrangler.toml**

Append to `worker/wrangler.toml`:

```toml
# R2 bucket holding the prebuilt card corpus blob (corpus/latest.json.gz),
# uploaded by the build-corpus GitHub Action. Served by the /corpus route.
[[r2_buckets]]
binding = "CORPUS"
bucket_name = "pokemon-tcg-corpus"
```

- [ ] **Step 2: Write failing tests for `/corpus`**

Add to `worker/src/index.test.ts` (inside `describe("worker", ...)`). Extend the `env` object first — change the top-level `const env = {...}` to include a stub R2 bucket factory, and add a helper:

```ts
// Add near the top, after `env` is defined:
function envWithCorpus(obj: { body: string; etag: string } | null) {
  return {
    ...env,
    CORPUS: {
      get: async (key: string) => {
        if (key !== "corpus/latest.json.gz" || !obj) return null;
        return {
          body: obj.body,
          etag: obj.etag,
          writeHttpMetadata: (_h: Headers) => {},
        };
      },
    },
  } as unknown as typeof env;
}
```

```ts
test("/corpus serves the R2 blob with an ETag and CORS", async () => {
  const res = await worker.fetch(
    new Request("https://proxy.test/corpus"),
    envWithCorpus({ body: "GZBYTES", etag: "abc123" }),
    ctx,
  );
  expect(res.status).toBe(200);
  expect(res.headers.get("ETag")).toBe('"abc123"');
  expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
  expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
    "https://x.github.io",
  );
  expect(await res.text()).toBe("GZBYTES");
});

test("/corpus returns 304 when If-None-Match matches", async () => {
  const res = await worker.fetch(
    new Request("https://proxy.test/corpus", {
      headers: { "If-None-Match": '"abc123"' },
    }),
    envWithCorpus({ body: "GZBYTES", etag: "abc123" }),
    ctx,
  );
  expect(res.status).toBe(304);
});

test("/corpus returns 503 when the blob is absent", async () => {
  const res = await worker.fetch(
    new Request("https://proxy.test/corpus"),
    envWithCorpus(null),
    ctx,
  );
  expect(res.status).toBe(503);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `bun test worker/src/index.test.ts`
Expected: FAIL (the three new `/corpus` tests — route not implemented; likely 404).

- [ ] **Step 4: Implement the `/corpus` route**

In `worker/src/index.ts`, extend `Env`:

```ts
export interface Env {
  POKEMONTCG_API_KEY: string;
  /** Allowed browser origin for CORS; defaults to "*". */
  ALLOW_ORIGIN?: string;
  /** R2 bucket holding corpus/latest.json.gz. */
  CORPUS: R2Bucket;
}
```

Add this branch inside `fetch`, after the OPTIONS/method checks and **before** the `/v2/` block:

```ts
if (url.pathname === "/corpus") {
  const cache = (caches as unknown as { default: Cache }).default;
  const cacheKey = new Request(url.toString(), { method: "GET" });
  const cached = await cache.match(cacheKey);
  if (cached) return serveCorpus(cached, request, env);

  const obj = await env.CORPUS.get("corpus/latest.json.gz");
  if (!obj) {
    return new Response("Corpus not built yet", {
      status: 503,
      headers: corsHeaders(env),
    });
  }
  const res = new Response(obj.body, {
    headers: {
      "Content-Type": "application/octet-stream",
      ETag: `"${obj.etag}"`,
      "Cache-Control": "public, s-maxage=604800",
    },
  });
  ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return serveCorpus(res, request, env);
}
```

Add the helper near `withCors`:

```ts
// Apply CORS and honor conditional GET (If-None-Match) for the corpus blob.
function serveCorpus(res: Response, request: Request, env: Env): Response {
  const inm = request.headers.get("If-None-Match");
  const etag = res.headers.get("ETag");
  if (inm && etag && inm === etag) {
    return new Response(null, {
      status: 304,
      headers: { ...corsHeaders(env), ETag: etag },
    });
  }
  return withCors(res, env);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test worker/src/index.test.ts`
Expected: PASS (all worker tests, including the 3 new ones).

- [ ] **Step 6: Typecheck + lint**

Run: `bun run typecheck:worker` → expect no errors.
Run: `biome check --config-path=. worker/src/index.ts` → expect no errors.

- [ ] **Step 7: Commit**

```bash
git add worker/wrangler.toml worker/src/index.ts worker/src/index.test.ts
git commit -m "feat(worker): serve prebuilt card corpus blob from R2 at /corpus"
```

---

### Task A2: GitHub Action build script

**Files:**
- Create: `src/store/corpus/corpus-types.ts`
- Create: `scripts/build-corpus.ts`
- Create: `scripts/build-corpus.test.ts`
- Create: `.github/workflows/build-corpus.yml`

- [ ] **Step 1: Create the shared `CorpusCard` type**

`src/store/corpus/corpus-types.ts`:

```ts
/**
 * Per-card metadata stored in the local corpus. Trimmed from the pokemontcg.io
 * card shape: enough to render the grid, match by name, filter, and sort.
 * setName/setSeries/setReleaseDate are NOT stored — joined from the cached
 * sets list at hydration time.
 */
export interface CorpusCard {
  id: string;
  name: string;
  imageUrl: string;
  imageUrlSmall: string;
  rarity?: string;
  subtypes?: string[];
  supertype: string;
  types?: string[];
  setId: string;
  number: string;
  nationalPokedexNumbers?: number[];
  variants?: string[];
}
```

- [ ] **Step 2: Write a failing test for the trim function**

`scripts/build-corpus.test.ts`:

```ts
import { expect, test } from "bun:test";
import { trimCard } from "./build-corpus";

const apiCard = {
  id: "hgss4-1",
  name: "Aggron",
  number: "1",
  supertype: "Pokémon",
  subtypes: ["Stage 2"],
  rarity: "Rare Holo",
  types: ["Metal"],
  nationalPokedexNumbers: [306],
  set: { id: "hgss4", name: "HS—Triumphant", series: "HeartGold & SoulSilver" },
  images: {
    small: "https://images.pokemontcg.io/hgss4/1.png",
    large: "https://images.pokemontcg.io/hgss4/1_hires.png",
  },
  tcgplayer: { prices: { holofoil: {}, reverseHolofoil: {} } },
};

test("trimCard keeps only corpus fields and derives variants", () => {
  expect(trimCard(apiCard)).toEqual({
    id: "hgss4-1",
    name: "Aggron",
    imageUrl: "https://images.pokemontcg.io/hgss4/1_hires.png",
    imageUrlSmall: "https://images.pokemontcg.io/hgss4/1.png",
    rarity: "Rare Holo",
    subtypes: ["Stage 2"],
    supertype: "Pokémon",
    types: ["Metal"],
    setId: "hgss4",
    number: "1",
    nationalPokedexNumbers: [306],
    variants: ["holofoil", "reverseHolofoil"],
  });
});

test("trimCard omits variants when tcgplayer prices are absent", () => {
  const c = trimCard({ ...apiCard, tcgplayer: undefined });
  expect(c.variants).toBeUndefined();
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test scripts/build-corpus.test.ts`
Expected: FAIL ("trimCard" not exported / module not found).

- [ ] **Step 4: Implement the build script**

`scripts/build-corpus.ts`:

```ts
import { gzipSync } from "node:zlib";
import type { CorpusCard } from "../src/store/corpus/corpus-types";

const ORIGIN = "https://api.pokemontcg.io";
const PAGE_SIZE = 250;
const SELECT =
  "id,name,number,images,rarity,subtypes,supertype,types,set,nationalPokedexNumbers,tcgplayer";

interface ApiCard {
  id: string;
  name: string;
  number: string;
  supertype: string;
  subtypes?: string[];
  rarity?: string;
  types?: string[];
  nationalPokedexNumbers?: number[];
  set: { id: string };
  images: { small: string; large: string };
  tcgplayer?: { prices?: Record<string, unknown> };
}

export function trimCard(card: ApiCard): CorpusCard {
  const out: CorpusCard = {
    id: card.id,
    name: card.name,
    imageUrl: card.images.large,
    imageUrlSmall: card.images.small,
    supertype: card.supertype,
    setId: card.set.id,
    number: card.number,
  };
  if (card.rarity) out.rarity = card.rarity;
  if (card.subtypes) out.subtypes = card.subtypes;
  if (card.types) out.types = card.types;
  if (card.nationalPokedexNumbers)
    out.nationalPokedexNumbers = card.nationalPokedexNumbers;
  if (card.tcgplayer?.prices) out.variants = Object.keys(card.tcgplayer.prices);
  return out;
}

async function fetchPage(apiKey: string, page: number) {
  const url = `${ORIGIN}/v2/cards?select=${SELECT}&orderBy=set.releaseDate,number&page=${page}&pageSize=${PAGE_SIZE}`;
  const res = await fetch(url, { headers: { "X-Api-Key": apiKey } });
  if (!res.ok) throw new Error(`page ${page}: ${res.status}`);
  return (await res.json()) as { data: ApiCard[]; totalCount: number };
}

export async function buildCorpus(apiKey: string): Promise<CorpusCard[]> {
  const first = await fetchPage(apiKey, 1);
  const total = first.totalCount;
  const pages = Math.ceil(total / PAGE_SIZE);
  const cards: CorpusCard[] = first.data.map(trimCard);
  for (let p = 2; p <= pages; p++) {
    const { data } = await fetchPage(apiKey, p);
    for (const c of data) cards.push(trimCard(c));
  }
  if (cards.length < total * 0.95) {
    throw new Error(`crawl incomplete: got ${cards.length} of ${total}`);
  }
  return cards;
}

// Entrypoint: `bun run scripts/build-corpus.ts <outfile>`
if (import.meta.main) {
  const apiKey = process.env.POKEMONTCG_API_KEY;
  if (!apiKey) throw new Error("POKEMONTCG_API_KEY not set");
  const outfile = process.argv[2] ?? "corpus.json.gz";
  const cards = await buildCorpus(apiKey);
  const gz = gzipSync(Buffer.from(JSON.stringify(cards)));
  await Bun.write(outfile, gz);
  console.log(`wrote ${cards.length} cards → ${outfile} (${gz.length} bytes)`);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test scripts/build-corpus.test.ts`
Expected: PASS (both tests).

- [ ] **Step 6: Create the GitHub Actions workflow**

`.github/workflows/build-corpus.yml`:

```yaml
name: Build card corpus
on:
  schedule:
    - cron: "0 4 * * 1" # Mondays 04:00 UTC
  workflow_dispatch: {}

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - name: Build corpus blob
        env:
          POKEMONTCG_API_KEY: ${{ secrets.POKEMONTCG_API_KEY }}
        run: bun run scripts/build-corpus.ts corpus.json.gz
      - name: Upload to R2
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
        run: |
          bunx wrangler r2 object put \
            pokemon-tcg-corpus/corpus/latest.json.gz \
            --file=corpus.json.gz --remote
```

- [ ] **Step 7: Typecheck + lint**

Run: `bun run typecheck` → expect no errors.
Run: `biome check --config-path=. scripts/build-corpus.ts scripts/build-corpus.test.ts src/store/corpus/corpus-types.ts` → expect no errors.

- [ ] **Step 8: Commit**

```bash
git add scripts/build-corpus.ts scripts/build-corpus.test.ts \
  src/store/corpus/corpus-types.ts .github/workflows/build-corpus.yml
git commit -m "feat(ci): weekly GitHub Action builds card corpus blob to R2"
```

> **Manual ops (out of band, owner-only — not code):** create the R2 bucket `pokemon-tcg-corpus`; add repo secrets `POKEMONTCG_API_KEY`, `CLOUDFLARE_API_TOKEN` (scoped to R2 edit on that bucket), `CLOUDFLARE_ACCOUNT_ID`; run the workflow once via `workflow_dispatch` to seed R2; deploy the worker (`bun run deploy:worker`). Note these in the PR description.

---

## Phase B — Client pure core (no React)

### Task B1: Natural-order card-number comparator

**Files:**
- Create: `src/store/corpus/natural-compare.ts`
- Test: `src/store/corpus/natural-compare.test.ts`

- [ ] **Step 1: Write the failing test**

`src/store/corpus/natural-compare.test.ts`:

```ts
import { expect, test } from "bun:test";
import { compareCardNumber } from "./natural-compare";

test("orders numeric card numbers numerically, not lexicographically", () => {
  const sorted = ["1", "2", "10", "11", "100", "9"].sort(compareCardNumber);
  expect(sorted).toEqual(["1", "2", "9", "10", "11", "100"]);
});

test("orders alphanumeric promos lexicographically among themselves", () => {
  const sorted = ["TG02", "TG01", "TG10"].sort(compareCardNumber);
  expect(sorted).toEqual(["TG01", "TG02", "TG10"]);
});

test("numeric-leading sort before non-numeric", () => {
  expect(compareCardNumber("5", "SWSH001")).toBeLessThan(0);
  expect(compareCardNumber("SWSH001", "5")).toBeGreaterThan(0);
});

test("same leading integer falls back to string compare", () => {
  expect(compareCardNumber("1a", "1b")).toBeLessThan(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/store/corpus/natural-compare.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`src/store/corpus/natural-compare.ts`:

```ts
/**
 * Compare two card `number` strings the way the pokemontcg.io API sorts them:
 * numerically by leading integer, then lexicographically as a tiebreaker.
 * Verified against the API: yields 1,2,…,10,11 (not the lexicographic
 * 1,10,11,…,2). Numeric-leading numbers sort before purely alphabetic ones.
 */
export function compareCardNumber(a: string, b: string): number {
  const na = Number.parseInt(a, 10);
  const nb = Number.parseInt(b, 10);
  const aNum = !Number.isNaN(na);
  const bNum = !Number.isNaN(nb);
  if (aNum && bNum) {
    if (na !== nb) return na - nb;
    return a.localeCompare(b);
  }
  if (aNum) return -1;
  if (bNum) return 1;
  return a.localeCompare(b);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/store/corpus/natural-compare.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/store/corpus/natural-compare.ts src/store/corpus/natural-compare.test.ts
git commit -m "feat(corpus): natural-order card-number comparator (API parity)"
```

---

### Task B2: Fuzzy name matcher

**Files:**
- Create: `src/store/corpus/fuzzy.ts`
- Test: `src/store/corpus/fuzzy.test.ts`

- [ ] **Step 1: Write the failing test**

`src/store/corpus/fuzzy.test.ts`:

```ts
import { expect, test } from "bun:test";
import { editDistance, matchName, normalize } from "./fuzzy";

test("normalize lowercases and strips accents/punctuation/spaces", () => {
  expect(normalize("Mr. Mime")).toBe("mrmime");
  expect(normalize("Farfetch'd")).toBe("farfetchd");
  expect(normalize("Flabébé")).toBe("flabebe");
  expect(normalize("Porygon-Z")).toBe("porygonz");
});

test("editDistance handles substitutions, insertions, transpositions", () => {
  expect(editDistance("charizard", "charizard")).toBe(0);
  expect(editDistance("charizrd", "charizard")).toBe(1); // deletion
  expect(editDistance("charizadr", "charizard")).toBe(1); // transposition
});

function match(q: string, name: string) {
  const n = normalize(name);
  return matchName(normalize(q), n, n.length ? [n] : []);
}

test("tiers: exact < prefix < substring < fuzzy", () => {
  expect(match("charizard", "Charizard")?.tier).toBe(0);
  expect(match("char", "Charizard")?.tier).toBe(1);
  expect(match("izard", "Charizard")?.tier).toBe(2);
  expect(match("charizrd", "Charizard")?.tier).toBe(3); // typo
});

test("rejects non-matches beyond the edit-distance budget", () => {
  expect(match("pikachu", "Charizard")).toBeNull();
});

test("short queries get a tighter fuzzy budget", () => {
  // length <= 4 → maxDist 1
  expect(match("pikc", "Pika")?.tier).toBe(3); // distance 1 ok... ("pikc" vs "pika" = 1)
  expect(match("xyzw", "Pika")).toBeNull(); // distance > 1
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/store/corpus/fuzzy.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`src/store/corpus/fuzzy.ts`:

```ts
/** Lowercase, strip diacritics, drop all non-alphanumerics (incl. spaces). */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritical marks
    .replace(/[^a-z0-9]/g, "");
}

/** Damerau-Levenshtein (optimal string alignment) edit distance. */
export function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const d: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0),
  );
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + cost,
      );
      if (
        i > 1 &&
        j > 1 &&
        a[i - 1] === b[j - 2] &&
        a[i - 2] === b[j - 1]
      ) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[m][n];
}

export type MatchTier = 0 | 1 | 2 | 3; // exact, prefix, substring, fuzzy
export interface NameMatch {
  tier: MatchTier;
  distance: number;
}

/**
 * Tiered name match. `q` and `name` must already be normalized; `tokens` are
 * the normalized per-word tokens of the name (for fuzzy on one word of a
 * multi-word name). Returns null when nothing matches within budget.
 */
export function matchName(
  q: string,
  name: string,
  tokens: string[],
): NameMatch | null {
  if (!q) return { tier: 2, distance: 0 }; // empty query matches all (substring)
  if (name === q) return { tier: 0, distance: 0 };
  if (name.startsWith(q)) return { tier: 1, distance: 0 };
  if (name.includes(q)) return { tier: 2, distance: 0 };
  const maxDist = q.length <= 4 ? 1 : 2;
  let best = Number.POSITIVE_INFINITY;
  // Length-prune before the O(mn) distance: |len diff| can't exceed maxDist.
  if (Math.abs(name.length - q.length) <= maxDist) {
    best = editDistance(q, name);
  }
  for (const t of tokens) {
    if (Math.abs(t.length - q.length) > maxDist) continue;
    const dd = editDistance(q, t);
    if (dd < best) best = dd;
  }
  return best <= maxDist ? { tier: 3, distance: best } : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/store/corpus/fuzzy.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/store/corpus/fuzzy.ts src/store/corpus/fuzzy.test.ts
git commit -m "feat(corpus): tiered fuzzy name matcher (exact/prefix/substring/edit-distance)"
```

---

### Task B3: Query engine (predicates + ordering + hydrate)

**Files:**
- Create: `src/store/corpus/corpus-engine.ts`
- Test: `src/store/corpus/corpus-engine.test.ts`

- [ ] **Step 1: Write the failing test**

`src/store/corpus/corpus-engine.test.ts`:

```ts
import { expect, test } from "bun:test";
import type { PokemonSet } from "../../api";
import type { CorpusCard } from "./corpus-types";
import { buildIndex, queryCorpus } from "./corpus-engine";

function card(p: Partial<CorpusCard> & { id: string; name: string }): CorpusCard {
  return {
    imageUrl: `${p.id}.png`,
    imageUrlSmall: `${p.id}-s.png`,
    supertype: "Pokémon",
    setId: "base1",
    number: "1",
    ...p,
  };
}

const sets: PokemonSet[] = [
  {
    id: "base1",
    name: "Base",
    series: "Base",
    releaseDate: "1999/01/09",
    total: 102,
    images: { symbol: "", logo: "" },
  },
  {
    id: "swsh1",
    name: "Sword & Shield",
    series: "Sword & Shield",
    releaseDate: "2020/02/07",
    total: 202,
    images: { symbol: "", logo: "" },
  },
];

const corpus = [
  card({ id: "base1-4", name: "Charizard", setId: "base1", number: "4", rarity: "Rare Holo", types: ["Fire"] }),
  card({ id: "swsh1-25", name: "Charizard V", setId: "swsh1", number: "25", rarity: "Rare Holo V", types: ["Fire"] }),
  card({ id: "base1-58", name: "Pikachu", setId: "base1", number: "58", rarity: "Common", types: ["Lightning"], nationalPokedexNumbers: [25] }),
  card({ id: "base1-2", name: "Blastoise", setId: "base1", number: "2", rarity: "Rare Holo", types: ["Water"] }),
];
const index = buildIndex(corpus);
const setsById = new Map(sets.map((s) => [s.id, s]));

test("set browse: filters by setId, natural-number order, hydrates set fields", () => {
  const r = queryCorpus(index, { setId: "base1", relevance: false }, setsById);
  expect(r.map((c) => c.id)).toEqual(["base1-2", "base1-4", "base1-58"]);
  expect(r[0].setName).toBe("Base");
  expect(r[0].cardNumber).toBe("2");
});

test("name search: relevance order (exact/prefix before others)", () => {
  const r = queryCorpus(index, { query: "charizard", relevance: true }, setsById);
  expect(r.map((c) => c.id)).toEqual(["base1-4", "swsh1-25"]); // exact before prefix
});

test("name search tolerates a typo", () => {
  const r = queryCorpus(index, { query: "charizrd", relevance: true }, setsById);
  expect(r.map((c) => c.id)).toContain("base1-4");
});

test("type filter: OR within dimension, AND across", () => {
  const r = queryCorpus(
    index,
    { filters: { types: ["Water"] }, relevance: false },
    setsById,
  );
  expect(r.map((c) => c.id)).toEqual(["base1-2"]);
});

test("pokedex: filters by national dex number", () => {
  const r = queryCorpus(index, { dexNumber: 25, relevance: false }, setsById);
  expect(r.map((c) => c.id)).toEqual(["base1-58"]);
});

test("missing set falls back to setId as name", () => {
  const orphan = buildIndex([card({ id: "x-1", name: "Mew", setId: "ghost" })]);
  const r = queryCorpus(orphan, { setId: "ghost", relevance: false }, setsById);
  expect(r[0].setName).toBe("ghost");
  expect(r[0].setReleaseDate).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/store/corpus/corpus-engine.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`src/store/corpus/corpus-engine.ts`:

```ts
import type { PokemonSet } from "../../api";
import type { HoloCardData } from "../../components/holo-card";
import type { FilterClauses } from "../../utils/build-filter-clauses";
import { matchName, normalize, type NameMatch } from "./fuzzy";
import { compareCardNumber } from "./natural-compare";
import type { CorpusCard } from "./corpus-types";

export interface CorpusQuery {
  /** Free-text name search. Empty/undefined → no name filter. */
  query?: string;
  setId?: string | null;
  dexNumber?: number | null;
  filters?: FilterClauses;
  /** True for global name search (relevance order); false for set/dex (natural order). */
  relevance: boolean;
}

/** In-memory corpus + parallel precomputed name indices. */
export interface CorpusIndex {
  cards: CorpusCard[];
  nameNorm: string[];
  nameTokens: string[][];
}

export function buildIndex(cards: CorpusCard[]): CorpusIndex {
  const nameNorm = cards.map((c) => normalize(c.name));
  const nameTokens = cards.map((c) =>
    c.name.split(/[\s-]+/).map(normalize).filter(Boolean),
  );
  return { cards, nameNorm, nameTokens };
}

function intersects(a: string[] | undefined, sel: string[]): boolean {
  return !!a && a.some((v) => sel.includes(v));
}

function passesFilters(card: CorpusCard, f: FilterClauses): boolean {
  if (f.types?.length && !intersects(card.types, f.types)) return false;
  if (f.rarity?.length && !(card.rarity && f.rarity.includes(card.rarity)))
    return false;
  if (
    f.supertype?.length &&
    !(card.supertype && f.supertype.includes(card.supertype))
  )
    return false;
  if (f.subtypes?.length && !intersects(card.subtypes, f.subtypes)) return false;
  return true;
}

function hydrate(card: CorpusCard, setsById: Map<string, PokemonSet>): HoloCardData {
  const set = setsById.get(card.setId);
  return {
    id: card.id,
    imageUrl: card.imageUrl,
    imageUrlSmall: card.imageUrlSmall,
    name: card.name,
    rarity: card.rarity,
    subtypes: card.subtypes,
    supertype: card.supertype,
    setId: card.setId,
    setName: set?.name ?? card.setId,
    setSeries: set?.series ?? "",
    setReleaseDate: set?.releaseDate,
    cardNumber: card.number,
    nationalPokedexNumbers: card.nationalPokedexNumbers,
    variants: card.variants,
  };
}

interface Hit {
  card: CorpusCard;
  i: number;
  match: NameMatch | null;
}

export function queryCorpus(
  index: CorpusIndex,
  q: CorpusQuery,
  setsById: Map<string, PokemonSet>,
): HoloCardData[] {
  const queryNorm = q.query ? normalize(q.query) : "";
  const hasName = queryNorm.length > 0;
  const filters = q.filters ?? {};
  const hits: Hit[] = [];

  for (let i = 0; i < index.cards.length; i++) {
    const card = index.cards[i];
    if (q.setId && card.setId !== q.setId) continue;
    if (
      q.dexNumber != null &&
      !card.nationalPokedexNumbers?.includes(q.dexNumber)
    )
      continue;
    if (!passesFilters(card, filters)) continue;
    let match: NameMatch | null = null;
    if (hasName) {
      match = matchName(queryNorm, index.nameNorm[i], index.nameTokens[i]);
      if (!match) continue;
    }
    hits.push({ card, i, match });
  }

  const relAt = (id: string) => setsById.get(id)?.releaseDate ?? "";

  hits.sort((a, b) => {
    if (q.relevance && a.match && b.match) {
      if (a.match.tier !== b.match.tier) return a.match.tier - b.match.tier;
      if (a.match.tier === 3 && a.match.distance !== b.match.distance)
        return a.match.distance - b.match.distance;
      if (a.card.name.length !== b.card.name.length)
        return a.card.name.length - b.card.name.length;
    }
    const ra = relAt(a.card.setId);
    const rb = relAt(b.card.setId);
    if (q.dexNumber != null || q.relevance) {
      if (ra !== rb) return ra.localeCompare(rb);
    }
    return compareCardNumber(a.card.number, b.card.number);
  });

  return hits.map((h) => hydrate(h.card, setsById));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/store/corpus/corpus-engine.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + lint + commit**

Run: `bun run typecheck` → no errors.
Run: `biome check --config-path=. src/store/corpus/corpus-engine.ts src/store/corpus/corpus-engine.test.ts` → no errors.

```bash
git add src/store/corpus/corpus-engine.ts src/store/corpus/corpus-engine.test.ts
git commit -m "feat(corpus): in-memory query engine (predicates, ordering, hydrate)"
```

---

## Phase C — Storage + load

### Task C1: Corpus IndexedDB store

**Files:**
- Create: `src/store/corpus/corpus-store.ts`
- Test: `src/store/corpus/corpus-store.test.ts`

- [ ] **Step 1: Write the failing test**

`src/store/corpus/corpus-store.test.ts`:

```ts
import { expect, test } from "bun:test";
import { clearCorpus, readGz, readMeta, writeCorpus } from "./corpus-store";

test("roundtrips gz bytes and meta in a dedicated store", async () => {
  const bytes = new Uint8Array([1, 2, 3, 4]).buffer;
  await writeCorpus(bytes, { etag: '"v1"', version: "v1", fetchedAt: 123 });

  const gz = await readGz();
  expect(gz ? new Uint8Array(gz) : null).toEqual(new Uint8Array([1, 2, 3, 4]));
  expect(await readMeta()).toEqual({ etag: '"v1"', version: "v1", fetchedAt: 123 });

  await clearCorpus();
  expect(await readGz()).toBeUndefined();
  expect(await readMeta()).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/store/corpus/corpus-store.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

`src/store/corpus/corpus-store.ts`:

```ts
import { createStore, del, get, set } from "idb-keyval";

// Dedicated IDB store — kept OUT of the persisted Zustand blob, which
// re-serializes its whole state on every change. The corpus is written once
// per version and read once on startup.
const store = createStore("ptcg-corpus", "blob");

export interface CorpusMeta {
  /** ETag returned by /corpus, used for conditional GET. */
  etag: string;
  /** Content version (same value, without quotes). */
  version: string;
  /** ms since epoch of the last successful fetch. */
  fetchedAt: number;
}

export function readGz(): Promise<ArrayBuffer | undefined> {
  return get<ArrayBuffer>("gz", store);
}

export function readMeta(): Promise<CorpusMeta | undefined> {
  return get<CorpusMeta>("meta", store);
}

export async function writeCorpus(gz: ArrayBuffer, meta: CorpusMeta): Promise<void> {
  await set("gz", gz, store);
  await set("meta", meta, store);
}

export async function clearCorpus(): Promise<void> {
  await del("gz", store);
  await del("meta", store);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/store/corpus/corpus-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/store/corpus/corpus-store.ts src/store/corpus/corpus-store.test.ts
git commit -m "feat(corpus): dedicated IndexedDB store for the corpus blob"
```

---

### Task C2: Corpus runtime (load + Zustand store + fetcher)

**Files:**
- Create: `src/store/corpus/corpus-runtime.ts`
- Test: `src/store/corpus/corpus-runtime.test.ts`

- [ ] **Step 1: Write the failing test**

`src/store/corpus/corpus-runtime.test.ts`:

```ts
import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import type { CorpusCard } from "./corpus-types";
import { clearCorpus } from "./corpus-store";
import { loadCorpus, makeCorpusFetcher, useCorpusRuntime } from "./corpus-runtime";

const realFetch = globalThis.fetch;

function gzipOf(cards: CorpusCard[]): ArrayBuffer {
  const { gzipSync } = require("node:zlib");
  const buf = gzipSync(Buffer.from(JSON.stringify(cards)));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

const sample: CorpusCard[] = [
  {
    id: "base1-4",
    name: "Charizard",
    imageUrl: "a",
    imageUrlSmall: "b",
    supertype: "Pokémon",
    setId: "base1",
    number: "4",
  },
];

beforeEach(async () => {
  await clearCorpus();
  useCorpusRuntime.setState({ index: null });
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

test("loadCorpus fetches, stores, and exposes a ready index", async () => {
  const gz = gzipOf(sample);
  globalThis.fetch = mock(
    async () =>
      new Response(gz, { status: 200, headers: { ETag: '"v1"' } }),
  ) as unknown as typeof fetch;

  await loadCorpus();
  expect(useCorpusRuntime.getState().index?.cards.length).toBe(1);
});

test("loadCorpus falls back to the stored blob when offline", async () => {
  // First, seed the store with a successful load.
  globalThis.fetch = mock(
    async () => new Response(gzipOf(sample), { status: 200, headers: { ETag: '"v1"' } }),
  ) as unknown as typeof fetch;
  await loadCorpus();
  useCorpusRuntime.setState({ index: null });

  // Now simulate offline: fetch rejects. Should still load from IDB.
  globalThis.fetch = mock(async () => {
    throw new Error("offline");
  }) as unknown as typeof fetch;
  await loadCorpus();
  expect(useCorpusRuntime.getState().index?.cards.length).toBe(1);
});

test("makeCorpusFetcher returns a paginated CardFetcher over the index", async () => {
  globalThis.fetch = mock(
    async () => new Response(gzipOf(sample), { status: 200, headers: { ETag: '"v1"' } }),
  ) as unknown as typeof fetch;
  await loadCorpus();

  const fetcher = makeCorpusFetcher({ query: "char", relevance: true });
  const { cards, totalCount } = await fetcher("char", 1, 20);
  expect(totalCount).toBe(1);
  expect(cards[0].id).toBe("base1-4");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/store/corpus/corpus-runtime.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3a: Export `apiBase()` from `src/api.ts`**

So `/corpus` hits the same worker as the API. Add to `src/api.ts`, right after the
`API_BASE` definition:

```ts
/** The proxy/API base URL used for all requests (worker proxy or public origin). */
export function apiBase(): string {
  return API_BASE;
}
```

- [ ] **Step 3: Implement the runtime**

`src/store/corpus/corpus-runtime.ts`:

```ts
import { create } from "zustand";
import { apiBase } from "../../api";
import type { HoloCardData } from "../../components/holo-card";
import type { CardFetcher } from "../../hooks/use-cards";
import { useStore } from "../index";
import { buildIndex, type CorpusIndex, type CorpusQuery, queryCorpus } from "./corpus-engine";
import { type CorpusMeta, readGz, readMeta, writeCorpus } from "./corpus-store";
import type { CorpusCard } from "./corpus-types";

interface CorpusRuntimeState {
  index: CorpusIndex | null;
}

// Non-persisted store — holds the ~20k-card index in memory only. Never put
// this in the persisted useStore, which re-serializes on every change.
export const useCorpusRuntime = create<CorpusRuntimeState>(() => ({ index: null }));

const ONE_DAY = 24 * 60 * 60 * 1000;

async function gunzip(buf: ArrayBuffer): Promise<string> {
  const ds = new DecompressionStream("gzip");
  const stream = new Blob([buf]).stream().pipeThrough(ds);
  return await new Response(stream).text();
}

function setIndexFromGz(gz: ArrayBuffer): Promise<void> {
  return gunzip(gz).then((text) => {
    const cards = JSON.parse(text) as CorpusCard[];
    useCorpusRuntime.setState({ index: buildIndex(cards) });
  });
}

let loading: Promise<void> | null = null;

/**
 * Load the corpus into memory: conditional GET /corpus, store on 200, reuse
 * stored bytes on 304/offline. Idempotent within a session; skips the network
 * if the last successful fetch was < 1 day ago.
 */
export function loadCorpus(): Promise<void> {
  if (useCorpusRuntime.getState().index) return Promise.resolve();
  if (loading) return loading;
  loading = (async () => {
    const meta = await readMeta();
    const stored = await readGz();
    const fresh = meta && Date.now() - meta.fetchedAt < ONE_DAY;
    if (stored && fresh) {
      await setIndexFromGz(stored);
      return;
    }
    try {
      const res = await fetch(`${apiBase()}/corpus`, {
        headers: meta?.etag ? { "If-None-Match": meta.etag } : {},
      });
      if (res.status === 304 && stored) {
        await writeCorpus(stored, { ...(meta as CorpusMeta), fetchedAt: Date.now() });
        await setIndexFromGz(stored);
        return;
      }
      if (res.ok) {
        const gz = await res.arrayBuffer();
        const etag = res.headers.get("ETag") ?? "";
        await writeCorpus(gz, {
          etag,
          version: etag.replace(/"/g, ""),
          fetchedAt: Date.now(),
        });
        await setIndexFromGz(gz);
        return;
      }
      if (stored) await setIndexFromGz(stored);
    } catch {
      if (stored) await setIndexFromGz(stored);
    }
  })().finally(() => {
    loading = null;
  });
  return loading;
}

// Memoize the full sorted match list per (index, cacheKey). Keyed by the index
// object via a WeakMap, so a corpus reload (new index) auto-invalidates every
// cached result — no stale pages after a version bump.
const queryCache = new WeakMap<CorpusIndex, Map<string, HoloCardData[]>>();

/** Build a CardFetcher backed by the in-memory corpus for the given params. */
export function makeCorpusFetcher(params: CorpusQuery): CardFetcher {
  return (key, page, pageSize) => {
    const index = useCorpusRuntime.getState().index;
    if (!index) return Promise.resolve({ cards: [], totalCount: 0 });
    let perKey = queryCache.get(index);
    if (!perKey) {
      perKey = new Map();
      queryCache.set(index, perKey);
    }
    let all = perKey.get(key);
    if (!all) {
      const sets = useStore.getState().sets ?? [];
      const setsById = new Map(sets.map((s) => [s.id, s]));
      all = queryCorpus(index, params, setsById);
      perKey.set(key, all);
    }
    return Promise.resolve({
      cards: all.slice((page - 1) * pageSize, page * pageSize),
      totalCount: all.length,
    });
  };
}
```

This requires a tiny `apiBase()` export so `/corpus` hits the same worker as the API (Step 3a below).

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/store/corpus/corpus-runtime.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + lint + commit**

Run: `bun run typecheck` → no errors.
Run: `biome check --config-path=. src/store/corpus/corpus-runtime.ts src/store/corpus/corpus-runtime.test.ts` → no errors.

```bash
git add src/api.ts src/store/corpus/corpus-runtime.ts src/store/corpus/corpus-runtime.test.ts
git commit -m "feat(corpus): runtime loader + in-memory store + CardFetcher"
```

---

## Phase D — Integration

### Task D1: Swap the fetcher in browse-page

**Files:**
- Modify: `src/pages/browse-page.tsx`
- Modify: `src/root-layout.tsx`
- Test: `src/pages/browse-page.test.tsx` (extend existing)

- [ ] **Step 1: Write the failing test**

The existing `src/pages/browse-page.test.tsx` mocks `../api` (so the API fetcher
returns 0 cards) and uses a `renderBrowsePage(initialEntries)` helper. The
react-virtuoso grid does **not** paint in happy-dom, so assert the header's
`N loaded` count — which reflects the corpus fetcher's result — not card text.

Add these imports at the top of the file:

```ts
import { buildIndex } from "../store/corpus/corpus-engine";
import { useCorpusRuntime } from "../store/corpus/corpus-runtime";
```

Extend the existing `afterEach` to reset the corpus runtime:

```ts
afterEach(() => {
  useStore.setState({ sets: null, setsLoading: false, setsFetchedAt: null });
  useCorpusRuntime.setState({ index: null });
});
```

Add this test inside the `describe("<BrowsePage />", ...)` block:

```ts
test("set browse renders from the in-memory corpus when ready", async () => {
  useStore.setState({ sets: [fixtureSet], setsFetchedAt: Date.now() });
  useCorpusRuntime.setState({
    index: buildIndex([
      {
        id: "base1-4",
        name: "Charizard",
        imageUrl: "a",
        imageUrlSmall: "b",
        supertype: "Pokémon",
        setId: "base1",
        number: "4",
      },
    ]),
  });
  renderBrowsePage(["/?setId=base1"]);
  // The mocked api fetcher returns 0 cards; only the corpus path yields 1.
  // The corpus fetcher resolves async, so use findByText to await the re-render.
  expect(await screen.findByText(/· 1 loaded/)).toBeDefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/pages/browse-page.test.tsx`
Expected: FAIL (still uses apiFetcher / calls network).

- [ ] **Step 3: Wire the swap in `browse-page.tsx`**

Add imports:

```ts
import { makeCorpusFetcher, useCorpusRuntime } from "../store/corpus/corpus-runtime";
import { usePokedexParam } from "../hooks/use-url-selection";
```

Inside `BrowsePage`, after the existing param hooks, read dex + corpus readiness:

```ts
const [dexNumber] = usePokedexParam();
const corpusReady = useCorpusRuntime((s) => s.index !== null);
```

Rename the existing `fetcher` memo to `apiFetcher`, then add the corpus fetcher and the swap:

```ts
const corpusFetcher = useMemo(
  () =>
    makeCorpusFetcher({
      query: searching ? query : undefined,
      setId: setScoped || !searching ? selectedSetId : null,
      dexNumber: !searching ? dexNumber : null,
      filters: { types, rarity, supertype, subtypes },
      relevance: searching && !setScoped,
    }),
  [
    corpusReady, searching, setScoped, selectedSetId, dexNumber, query,
    types, rarity, supertype, subtypes,
  ],
);

const fetcher = corpusReady ? corpusFetcher : apiFetcher;
const { cards, loading, loadMore, hasMore } = useCards(cacheKey, fetcher);
```

(The `CorpusQuery` shape: `relevance` is `true` only for global name search; set-scoped search and set/dex browse use natural order.)

- [ ] **Step 4: Kick off the load in `root-layout.tsx`**

Add to `src/root-layout.tsx`:

```ts
import { useEffect } from "react";
import { loadCorpus } from "./store/corpus/corpus-runtime";

// inside RootLayout component body:
useEffect(() => {
  const start = () => void loadCorpus();
  const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => void })
    .requestIdleCallback;
  if (ric) ric(start);
  else setTimeout(start, 1500);
}, []);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test src/pages/browse-page.test.tsx`
Expected: PASS.

- [ ] **Step 6: Run the relevant suites + typecheck + lint**

Run (parallel): `bun run typecheck` ; `bun test src/pages/browse-page.test.tsx src/store/corpus/` ; `biome check --config-path=. src/pages/browse-page.tsx src/root-layout.tsx`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/pages/browse-page.tsx src/root-layout.tsx src/pages/browse-page.test.tsx
git commit -m "feat(corpus): serve all browse/search paths from the local corpus when ready"
```

---

### Task D2 (optional, ship-later): "Preparing instant search" pill

**Files:**
- Modify: `src/pages/browse-page.tsx`

- [ ] **Step 1:** Render a small fixed pill when `!corpusReady` and a corpus load is in flight (reuse the existing `Loading…` pill styling). Text: "Preparing instant search…". Remove when `corpusReady`.
- [ ] **Step 2:** Lint + manual preview check. Commit:

```bash
git add src/pages/browse-page.tsx
git commit -m "feat(corpus): subtle indicator while the corpus loads"
```

---

## Final verification (end of plan, not per-task)

- [ ] Full suite: `bun test` → all green.
- [ ] `bun run typecheck` and `bun run typecheck:worker` → clean.
- [ ] `biome check --config-path=.` over all touched files → clean.
- [ ] Preview smoke (per `project_preview_verification`): with a seeded corpus, search returns instantly; with no corpus, behavior is unchanged (API path); offline (DevTools) still searches from IDB.

## Spec-coverage check

- Edge build + R2 + `/corpus` → Task A1, A2.
- $0 build host (GitHub Actions) → A2.
- Store URLs + join set fields + `types` → `corpus-types` (A2), `hydrate` (B3).
- One-shot client download + offline fallback → C2.
- Dedicated IDB store (not Zustand persist) → C1, C2.
- All paths local (name/set/dex/filters) → B3 predicates + D1 wiring.
- Fuzzy custom tiered matcher → B2.
- Natural-order parity → B1.
- Relevance ordering for global name search → B3 (`relevance` flag), D1.
- Fetcher swap, downstream unchanged → D1.
- Freshness (weekly cron + conditional GET) → A2 workflow + C2 loader.
