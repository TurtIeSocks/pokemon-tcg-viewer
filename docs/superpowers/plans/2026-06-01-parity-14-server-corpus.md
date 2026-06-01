# Parity Plan 14 — Server-Side Corpus + Loader/Env Fixes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three production bugs — corpus 404 (client hits `api.pokemontcg.io/corpus`), slow/empty set pages, and prerender hammering the public API — by (Tier 1) wiring both env vars at build + routing loaders through server functions, and (Tier 2) loading the card corpus server-side so set/search/pokemon loaders read it instead of the API.

**Architecture:** The pure corpus engine (`buildIndex`/`queryCorpus`, no browser deps) is reused server-side via a new memoized `server/corpus-server.ts` that fetches the Worker's `/corpus` blob once per process and builds the in-memory index. List loaders (set/search/pokemon) query the corpus; `$card` keeps the API (full focus data the corpus lacks). The deploy build step gains `API_BASE` (was missing) so any residual API calls + the corpus fetch hit the Worker, not the public origin.

**Tech Stack:** existing pure `corpus-engine.ts` (`buildIndex`, `queryCorpus`, `CorpusQuery`, `CorpusIndex`), `corpus-types.ts` (`CorpusCard`), `node:zlib` `gunzipSync` (server gunzip — NOT the browser `DecompressionStream`), `server/nav-tree.ts` (the memoized-server-fetch pattern to mirror), `buildCorpusQuery` (`lib/card-query.ts`), Bun test.

---

## Root causes (proven in Phase 1 investigation — see chapter)

- **RC-1 corpus 404:** `lib/api-base-client.ts` falls back to `https://api.pokemontcg.io` when `VITE_API_BASE` is empty. It was empty in the prod build → client fetched `api.pokemontcg.io/corpus` (404). Worker never called.
- **RC-2 prerender hit public API:** `deploy.yml` build step sets only `VITE_API_BASE`, not `API_BASE`. Server loaders read `process.env.API_BASE` → unset at build → public-API fallback → 170-set prerender crawled the anonymous (~1000/day) public API.
- **RC-3 slow/empty cards:** loaders call **raw** `fetchCards`/`fetchCardById`/`fetchCardsByName`/`fetchCardsByPokedex` (not the `createServerFn` wrappers). TanStack loaders are isomorphic → these run in the browser on client-nav + post-hydration revalidation, where `process.env.API_BASE` is undefined → throw (no cards) or public-API fallback (slow). PROVEN: `/v2/cards` + `api.pokemontcg.io` are in the client bundle (`index-*.js`); `/v2/sets` (via `getNavTreeFn`, a `createServerFn`) is NOT.
- **RC-4 architectural:** loaders fetch from the API though the corpus already holds every card. Corpus was client-only; the server couldn't read it.

---

## File structure

- `src/server/corpus-server.ts` — **new**: memoized server-side corpus (fetch `/corpus`, gunzip, `buildIndex`) + `queryCorpusServer(q)`. Sibling test for the pure-glue parts.
- `.github/workflows/deploy.yml` — **modify**: add `API_BASE` to the build env.
- `.env.example` — already documents both (Plan 08); confirm.
- `src/routes/$series/$set/index.tsx` — **modify**: loader queries the corpus.
- `src/routes/search.tsx` — **modify**: loader queries the corpus.
- `src/routes/pokemon/$name.tsx` — **modify**: loader queries the corpus.
- `src/routes/$series/$set/$card.tsx` — **modify**: use `getCardByIdFn` (server fn) not raw `fetchCardById` (keep on API, but server-only).

---

### Task 1: Server-side corpus module

**Files:**
- Create: `src/server/corpus-server.ts`
- Test: `src/server/corpus-server.test.ts`

**Context:** `buildIndex(cards: CorpusCard[]): CorpusIndex` and `queryCorpus(index, q: CorpusQuery, setsById: Map<string, PokemonSet>): HoloCardData[]` are pure (`corpus-engine.ts`). `CorpusCard` from `corpus-types.ts`. The Worker serves gzipped `CorpusCard[]` at `/corpus`. Server gunzip uses `node:zlib`. The sets map comes from `fetchAllSets()` (already used by `getNavTreeFn`).

- [ ] **Step 1: Write a failing test for the pure decode glue.** The fetch+memoize is the network boundary; test the gunzip+parse+index path with a synthetic gz.

```ts
import { gzipSync } from "node:zlib";
import { describe, expect, test } from "bun:test";
import { decodeCorpusGz } from "./corpus-server";
import type { CorpusCard } from "../store/corpus/corpus-types";

const cards: CorpusCard[] = [
	{ id: "swsh9-1", name: "Exeggcute", imageUrl: "l", imageUrlSmall: "s", supertype: "Pokémon", setId: "swsh9", number: "1" },
];

describe("decodeCorpusGz", () => {
	test("gunzips + parses a CorpusCard[] blob", () => {
		const gz = gzipSync(Buffer.from(JSON.stringify(cards)));
		const out = decodeCorpusGz(gz.buffer.slice(gz.byteOffset, gz.byteOffset + gz.byteLength));
		expect(out).toHaveLength(1);
		expect(out[0].name).toBe("Exeggcute");
	});
});
```

- [ ] **Step 2: Run, verify FAIL** — `bun test src/server/corpus-server.test.ts`

- [ ] **Step 3: Implement `src/server/corpus-server.ts`.**

```ts
import { gunzipSync } from "node:zlib";
import { apiBase } from "./card-data";
import { fetchAllSets } from "./card-data";
import type { PokemonSet } from "./card-mappers";
import {
	buildIndex,
	type CorpusIndex,
	type CorpusQuery,
	queryCorpus,
} from "../store/corpus/corpus-engine";
import type { CorpusCard } from "../store/corpus/corpus-types";
import type { HoloCardData } from "../components/holo-card";

/** Gunzip + parse a gzipped CorpusCard[] blob (server-side; node:zlib). */
export function decodeCorpusGz(gz: ArrayBuffer): CorpusCard[] {
	const text = gunzipSync(Buffer.from(gz)).toString("utf8");
	return JSON.parse(text) as CorpusCard[];
}

interface ServerCorpus {
	index: CorpusIndex;
	setsById: Map<string, PokemonSet>;
}

// Memoize for the process lifetime — a deploy restart picks up a fresh corpus.
// Mirrors the getNavTreeFn memoization pattern.
let cached: Promise<ServerCorpus> | null = null;

async function loadServerCorpus(): Promise<ServerCorpus> {
	const [gzRes, sets] = await Promise.all([
		fetch(`${apiBase()}/corpus`),
		fetchAllSets(),
	]);
	if (!gzRes.ok) throw new Error(`/corpus fetch failed: ${gzRes.status}`);
	const gz = await gzRes.arrayBuffer();
	const cards = decodeCorpusGz(gz);
	return {
		index: buildIndex(cards),
		setsById: new Map(sets.map((s) => [s.id, s])),
	};
}

function getServerCorpus(): Promise<ServerCorpus> {
	if (!cached) cached = loadServerCorpus().catch((e) => {
		cached = null; // allow retry on next request after a transient failure
		throw e;
	});
	return cached;
}

/** Query the server-side corpus. Returns the full sorted match list. */
export async function queryCorpusServer(q: CorpusQuery): Promise<HoloCardData[]> {
	const { index, setsById } = await getServerCorpus();
	return queryCorpus(index, q, setsById);
}
```
Note: `apiBase()` (server, `process.env.API_BASE`) is exported from `card-data.ts` — confirm; if not exported, export it. The corpus fetch uses the SAME base as the API (the Worker serves both `/corpus` and `/v2/`).

- [ ] **Step 4: Run, verify PASS** — `bun test src/server/corpus-server.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/server/corpus-server.ts src/server/corpus-server.test.ts
git commit -m "feat(server): server-side corpus (fetch /corpus once, query in loaders)"
```

---

### Task 2: Wire `API_BASE` into the deploy build

**Files:**
- Modify: `.github/workflows/deploy.yml`

- [ ] **Step 1: Add `API_BASE` to the build step env** (it currently sets only `VITE_API_BASE`). Both come from the same repo Variable (the Worker URL).

In `deploy.yml`, the "Build (Vite + Nitro)" step `env:` block:
```yaml
        env:
          VITE_API_BASE: ${{ vars.VITE_API_BASE }}
          API_BASE: ${{ vars.VITE_API_BASE }}
```
Comment above it:
```yaml
        # VITE_API_BASE → client bundle (corpus fetch). API_BASE → server loaders +
        # the server-side corpus fetch during prerender. Both = the CF Worker URL
        # (repo Variable). Without API_BASE, prerender falls back to the public API.
```

- [ ] **Step 2: No build to run here (CI-only change); confirm YAML is valid.**

```bash
node -e "const y=require('node:fs').readFileSync('.github/workflows/deploy.yml','utf8'); console.log('API_BASE present:', y.includes('API_BASE:'))"
```
Expected: `API_BASE present: true`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "build(deploy): pass API_BASE at build so prerender + corpus use the Worker"
```

---

### Task 3: Set loader → corpus

**Files:**
- Modify: `src/routes/$series/$set/index.tsx`

- [ ] **Step 1: Replace the raw `fetchCards` loop with a single corpus query.** The loader still resolves the set via `getNavTreeFn`/`findSet`, then queries the corpus for the whole set (setId-scoped, no name/filters → returns all set cards sorted by number).

Replace the loader body's fetch loop:
```tsx
// imports: drop `fetchCards`; add:
import { queryCorpusServer } from "../../../server/corpus-server";

// loader, after `if (!set) throw notFound();`:
		const all = await queryCorpusServer({ setId: set.id, relevance: false });
		const slugs = buildSetCardSlugs(all);
		const cards = all.map((c) => ({ ...c, slug: slugs.slugById.get(c.id) ?? c.id }));
		return { set, cards, facets: deriveFacets(all) };
```
This removes the `page<=10` API loop entirely. `queryCorpus` with `{setId, relevance:false}` returns all cards in the set in natural (number) order — same ordering the API loop produced. `deriveFacets` + `buildSetCardSlugs` are unchanged.

- [ ] **Step 2: Build + SSR-verify the set page renders cards from the corpus.**

```bash
bun run build && node .output/server/index.mjs & SERVER_PID=$!
sleep 3
curl -s -o /tmp/p14set.html -w "set=%{http_code}\n" "http://localhost:3000/sword-shield/brilliant-stars"
kill $SERVER_PID
node -e 'const h=require("fs").readFileSync("/tmp/p14set.html","utf8"); console.log("lazy imgs:", (h.match(/loading="lazy"/g)||[]).length); console.log("card links:", new Set(h.match(/\/sword-shield\/brilliant-stars\/[a-z0-9-]+/g)||[]).size)'
```
Expected: many imgs + links (corpus-sourced). Report counts. Requires the dev `.env` to have `API_BASE` set to the Worker (so the build's prerender + this server can fetch `/corpus`). If `/corpus` is unreachable in the dev env, the loader throws — note it and confirm `API_BASE` is set locally.

- [ ] **Step 3: Commit**

```bash
git add "src/routes/\$series/\$set/index.tsx"
git commit -m "feat(routes): set loader reads the server-side corpus (no API crawl)"
```

---

### Task 4: Search + pokemon loaders → corpus

**Files:**
- Modify: `src/routes/search.tsx`
- Modify: `src/routes/pokemon/$name.tsx`

- [ ] **Step 1: Search loader → corpus.** Replace `fetchCardsByName(q,1,40)` with a corpus query (global, relevance order), sliced to a first page for the SSR seed.

```tsx
// imports: drop `fetchCardsByName`; add:
import { queryCorpusServer } from "../server/corpus-server";

// loader:
	loader: async ({ deps }) => {
		const q = deps.q.trim();
		if (!q) return { q, cards: [], total: 0 };
		const all = await queryCorpusServer({ query: q, setId: null, relevance: true });
		return { q, cards: all.slice(0, 40), total: all.length };
	},
```

- [ ] **Step 2: Pokemon loader → corpus.** Replace `fetchCardsByPokedex(dex,1,60)` with a corpus dex query. Keep `getPokemonListCached` for name→dex (it's a small server fn; the corpus has no species list).

```tsx
// imports: drop `fetchCardsByPokedex` (keep getPokemonListCached); add:
import { queryCorpusServer } from "../../server/corpus-server";

// loader, after resolving `dex`:
		const all = await queryCorpusServer({ dexNumber: dex, setId: null, relevance: false });
		return { display: titleCase(params.name), dex, cards: all.slice(0, 60), total: all.length };
```

- [ ] **Step 3: Build + SSR-verify both.**

```bash
bun run build && node .output/server/index.mjs & SERVER_PID=$!
sleep 3
curl -s -o /tmp/p14se.html -w "search=%{http_code}\n" "http://localhost:3000/search?q=charizard"
curl -s -o /tmp/p14pk.html -w "pokemon=%{http_code}\n" "http://localhost:3000/pokemon/charizard"
kill $SERVER_PID
node -e 'for(const f of ["/tmp/p14se.html","/tmp/p14pk.html"]){const h=require("fs").readFileSync(f,"utf8");console.log(f, "imgs:", (h.match(/loading="lazy"/g)||[]).length)}'
```
Expected: both 200, imgs present. Report.

- [ ] **Step 4: Commit**

```bash
git add src/routes/search.tsx "src/routes/pokemon/\$name.tsx"
git commit -m "feat(routes): search + pokemon loaders read the server-side corpus"
```

---

### Task 5: `$card` loader → server fn (keep API, kill browser leak)

**Files:**
- Modify: `src/routes/$series/$set/$card.tsx`

- [ ] **Step 1: Swap raw `fetchCardById` → the `getCardByIdFn` server fn.** The card route keeps the API (full focus data the corpus lacks), but via the server fn so it never runs in the browser. `getPokemonListCached` (cross-link names) — wrap via `getPokemonListFn` (server fn) OR keep `getCardByIdFn`'s server boundary and call `getPokemonListCached` only inside that server context. Simplest: both through their server fns.

Confirm the existing server fns: `getCardByIdFn` (`.inputValidator((id:string)=>id)`) and `getPokemonListFn` exist in `card-data.ts` (Plan 02/04). Replace in the loader:
```tsx
// imports: drop `fetchCardById, getPokemonListCached`; add:
import { getCardByIdFn, getPokemonListFn } from "../../../server/card-data";

// loader:
		const card = await getCardByIdFn({ data: cardId });
		const list = await getPokemonListFn();
```
Rationale: a `createServerFn` called from a loader runs server-direct during SSR and RPCs to OUR server on client-nav — never the public API from the browser. This is the RC-3 fix for the card route. (Plan 04 used raw `fetchCardById` "to avoid the RPC hop"; that hop is what keeps browser nav off the public API.)

- [ ] **Step 2: Build + SSR-verify a card still renders + og:image, and confirm `/v2/cards` is GONE from the client bundle.**

```bash
bun run build && node .output/server/index.mjs & SERVER_PID=$!
sleep 3
curl -s http://localhost:3000/sword-shield/brilliant-stars > /tmp/p14s.html
node -e 'const h=require("fs").readFileSync("/tmp/p14s.html","utf8");require("fs").writeFileSync("/tmp/p14card.txt", (h.match(/\/sword-shield\/brilliant-stars\/[a-z0-9-]+/)||[""])[0])'
CARD=$(cat /tmp/p14card.txt)
curl -s -o /tmp/p14c.html -w "card=%{http_code}\n" "http://localhost:3000${CARD}"
kill $SERVER_PID
echo "/v2/cards in client bundle? (want NONE):"
grep -rl '/v2/cards' .output/public 2>/dev/null || echo "ABSENT — browser leak fixed"
node -e 'const h=require("fs").readFileSync("/tmp/p14c.html","utf8");console.log("og:image:", h.includes("og:image"))'
```
Expected: card 200, og:image true, **`/v2/cards` ABSENT from `.output/public`** (the RC-3 proof — no raw fetch leaks to the browser now). Report.

- [ ] **Step 3: Commit**

```bash
git add "src/routes/\$series/\$set/\$card.tsx"
git commit -m "fix(routes): card loader uses getCardByIdFn server fn (no browser API leak)"
```

---

### Task 6: Verification gate + leak audit

- [ ] **Step 1: Full gate (parallel):** `bun run typecheck` (0), `biome check --config-path=. src` (clean), `bun test` (all pass + corpus-server), `bun run build` (0, prerender ~189 pages — now corpus-backed, should be FASTER).
- [ ] **Step 2: Client-bundle leak audit (the RC-3 regression guard):**

```bash
echo "=== these must ALL be ABSENT from the client bundle ==="
for pat in '/v2/cards' '/v2/sets' 'process.env.API_BASE'; do
  echo -n "$pat: "; grep -rl "$pat" .output/public 2>/dev/null | head -1 || echo "ABSENT ✓"
done
echo "=== api.pokemontcg.io should appear ONLY as the client corpus fallback (api-base-client), not as a fetch path ==="
grep -rl 'api.pokemontcg.io' .output/public 2>/dev/null
```
Expected: `/v2/cards`, `/v2/sets`, `process.env.API_BASE` all ABSENT. `api.pokemontcg.io` may still appear as the `VITE_API_BASE` fallback string in `api-base-client` (harmless when the env var is set) — note it.
- [ ] **Step 3: Per-route SSR smoke** (6 routes 200; set/search/pokemon corpus-sourced). Same loop as prior plans.
- [ ] **Step 4: Commit lint autofixes** if any (`git add -u src/`).

---

## Self-review

- **RC coverage:** RC-1 (Task 2 — `VITE_API_BASE` already referenced; the real-world fix is setting the repo Variable + local `.env`, documented below). RC-2 (Task 2 — `API_BASE` added to build). RC-3 (Tasks 3/4/5 — loaders no longer ship raw fetch; Task 6 audits `/v2/*` absent from client bundle). RC-4 (Tasks 1/3/4 — list loaders read the corpus, not the API).
- **Placeholders:** none.
- **Type consistency:** `queryCorpusServer(q: CorpusQuery): Promise<HoloCardData[]>` (T1) consumed by set/search/pokemon loaders (T3/T4). `CorpusQuery` is the existing type (`{query?,setId?,dexNumber?,filters?,relevance}`). `decodeCorpusGz` tested pure (T1). `getCardByIdFn`/`getPokemonListFn` are existing server fns (T5).
- **Prerender effect:** set loaders now do ONE `/corpus` fetch (memoized) + in-memory query per page instead of paged API crawls → prerendering 170 sets makes ~1 corpus fetch total, not ~170×N API calls. Public-API quota risk eliminated.
- **`$card` stays on the API** (full focus data) but via the server fn — SSR-on-demand, edge/nginx-cached, one keyed Worker call per unique card, never from the browser.
- **Hydration/SEO:** unchanged — loaders still produce the same SSR HTML; only the data SOURCE moved (corpus vs API). Client islands unchanged.

## REQUIRED human action (cannot be done in code)

These are config values the implementer/user must set (the Worker URL is the user's):

1. **Local `.env`:** add `VITE_API_BASE=<worker-url>` AND `API_BASE=<worker-url>` (the lost-worktree var — also why the corpus 404s locally). Without these, Task 3/4 SSR-verify steps will fail to fetch `/corpus`.
2. **GitHub repo Variable:** Settings → Secrets and variables → Actions → Variables → `VITE_API_BASE = <worker-url>`. The workflow injects it (+ `API_BASE` from the same, after Task 2).

Flagged in the handoff so the user sets them before the next deploy.

## Carried forward

- Tilt-to-shine, hover-prefetch, global Open-Packs button (minor polish, deferred from Plans 10/12).
- Optional: drop the now-unused raw `fetchCards`/`fetchCardsByName`/`fetchCardsByPokedex`/`fetchCardById` from `card-data.ts` if nothing else imports them (a cleanup pass — verify no importers first).
