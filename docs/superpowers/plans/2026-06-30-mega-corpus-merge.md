# Mega Corpus Merge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge pokemontcg.io's richer English metadata (foil-encoding rarity, multi-tag subtypes, hires images, set logos) onto the localized TCGdex base corpus, then surface it with a grouped Subtypes filter and per-card locale signals.

**Architecture:** A second crawl of pokemontcg.io runs in the corpus-build GitHub Action alongside the existing TCGdex crawl. A merge phase overlays ptcg.io fields onto each TCGdex `CorpusCard` (English base only) via the existing `id-crosswalk`. Overlaying ptcg.io's rarity string restores holo CSS (the foil tables are keyed on that vocab). UI work — grouped Subtypes facet, plural labels, modal language control, per-card "EN" fallback badge — consumes the enriched corpus. The four phases are independently committable; Phases 2–4 depend only on Phase 1 landing.

**Tech Stack:** Bun (runner + `bun:test`), TypeScript, TanStack Start/Router, React 19, shadcn/Radix `Select`, Zustand, Cloudflare Workers.

## Global Constraints

- **Optional fields are `null`, never `undefined`** at persistence boundaries; corpus optional fields are simply omitted when absent (matches `trimCard`).
- **Tests must not hit the network.** Inject fakes (the repo pattern: `setI18nFetchersForTests`, fixture objects). Pre-seed `useCorpusRuntime.setState(...)` in any test that renders a card grid.
- **The overlay touches the English base corpus only.** The per-language i18n overlays (`corpus/i18n/{fr,de,es,it,pt}/`) stay TCGdex-only. `imageBase` is never dropped (non-EN images derive from it via `cardImage(card, lang)`).
- **No em-dashes in user-facing copy** (brand rule — use periods/commas). Code/comments unaffected.
- **Manual `useMemo`/`useCallback` are intentional** (React Compiler is on; the codebase memoizes by hand). Do not strip them.
- **Lint:** `bunx biome check --write <files>` (pass explicit paths; `bun run lint` fails on nested worktree config).
- **Money/irreversible:** none in this plan.

---

# Phase 1 — Build pipeline: pokemontcg.io overlay

## Task 1.1: pokemontcg.io overlay crawl

**Files:**
- Create: `scripts/ptcg-overlay.ts`
- Test: `scripts/ptcg-overlay.test.ts`

**Interfaces:**
- Produces: `interface PtcgOverlayEntry { rarity?: string; subtypes?: string[] }`, `type PtcgOverlay = Map<string, PtcgOverlayEntry>` (keyed by pokemontcg.io card id), `fetchPtcgOverlay(opts?: { fetchImpl?: typeof fetch }): Promise<PtcgOverlay>`.

- [ ] **Step 1: Write the failing test**

```ts
// scripts/ptcg-overlay.test.ts
import { expect, test } from "bun:test";
import { fetchPtcgOverlay } from "./ptcg-overlay";

// A fake fetch that pages: page 1 returns a full page (250) so the loop continues,
// page 2 returns a short page so the loop stops.
function fakeFetch(pages: Record<number, unknown[]>): typeof fetch {
	return (async (url: string | URL) => {
		const page = Number(new URL(url).searchParams.get("page"));
		return {
			ok: true,
			json: async () => ({ data: pages[page] ?? [] }),
		} as Response;
	}) as unknown as typeof fetch;
}

test("fetchPtcgOverlay pages until a short page and keys by id", async () => {
	const full = Array.from({ length: 250 }, (_, i) => ({ id: `swsh1-${i}` }));
	const overlay = await fetchPtcgOverlay({
		fetchImpl: fakeFetch({
			1: full,
			2: [{ id: "base1-4", rarity: "Rare Holo", subtypes: ["Stage 2"] }],
		}),
	});
	expect(overlay.size).toBe(251);
	expect(overlay.get("base1-4")).toEqual({
		rarity: "Rare Holo",
		subtypes: ["Stage 2"],
	});
});

test("fetchPtcgOverlay retries a failing page then succeeds", async () => {
	let calls = 0;
	const fetchImpl = (async () => {
		calls++;
		if (calls === 1) return { ok: false, status: 503 } as Response;
		return { ok: true, json: async () => ({ data: [] }) } as Response;
	}) as unknown as typeof fetch;
	const overlay = await fetchPtcgOverlay({ fetchImpl });
	expect(calls).toBe(2);
	expect(overlay.size).toBe(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test scripts/ptcg-overlay.test.ts`
Expected: FAIL — `Cannot find module './ptcg-overlay'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// scripts/ptcg-overlay.ts
export interface PtcgOverlayEntry {
	rarity?: string;
	subtypes?: string[];
}
export type PtcgOverlay = Map<string, PtcgOverlayEntry>;

interface PtcgCard {
	id: string;
	rarity?: string;
	subtypes?: string[];
}

const PTCG_BASE = process.env.PTCG_BASE ?? "https://api.pokemontcg.io/v2";
const PAGE_SIZE = 250;
const RETRIES = 3;

async function fetchPage(
	fetchImpl: typeof fetch,
	page: number,
): Promise<PtcgCard[]> {
	const url = `${PTCG_BASE}/cards?select=id,rarity,subtypes&page=${page}&pageSize=${PAGE_SIZE}`;
	const headers: Record<string, string> = {};
	if (process.env.PTCG_API_KEY) headers["X-Api-Key"] = process.env.PTCG_API_KEY;
	for (let attempt = 0; ; attempt++) {
		const res = await fetchImpl(url, { headers });
		if (res.ok) return ((await res.json()) as { data: PtcgCard[] }).data;
		if (attempt >= RETRIES)
			throw new Error(`ptcg page ${page} failed: ${res.status}`);
		await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
	}
}

/**
 * Crawl every pokemontcg.io card (id + rarity + subtypes only) into a map keyed
 * by ptcg id. Image urls are NOT fetched — they are deterministic from the id
 * (id-crosswalk `fallbackImageUrl`), so map membership alone proves the ptcg
 * card (and thus its image) exists.
 */
export async function fetchPtcgOverlay(opts: {
	fetchImpl?: typeof fetch;
} = {}): Promise<PtcgOverlay> {
	const fetchImpl = opts.fetchImpl ?? fetch;
	const out: PtcgOverlay = new Map();
	for (let page = 1; ; page++) {
		const data = await fetchPage(fetchImpl, page);
		for (const c of data)
			out.set(c.id, { rarity: c.rarity, subtypes: c.subtypes });
		if (data.length < PAGE_SIZE) break;
	}
	return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test scripts/ptcg-overlay.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/ptcg-overlay.ts scripts/ptcg-overlay.test.ts
git commit -m "feat(corpus): pokemontcg.io overlay crawl (id+rarity+subtypes)"
```

---

## Task 1.2: Merge overlay onto the corpus

**Files:**
- Create: `scripts/merge-overlay.ts`
- Test: `scripts/merge-overlay.test.ts`

**Interfaces:**
- Consumes: `PtcgOverlay` (1.1); `CorpusCard` (`src/store/corpus/corpus-types.ts`); `tcgdexCardToPtcg`, `fallbackImageUrl` (`src/lib/corpus/id-crosswalk.ts`).
- Produces: `mergePtcgOverlay(cards: CorpusCard[], overlay: PtcgOverlay): { merged: CorpusCard[]; hits: number }`.

**Background (verbatim, from the codebase):**
- `tcgdexCardToPtcg(id)` splits at the LAST dash, crosswalks the set, strips numeric zero-pad → returns the ptcg id.
- `fallbackImageUrl(cardId)` returns `{ large, small }` ptcg.io urls (`_hires.png` / `.png`), preferring a verified override.
- `CorpusCard` keeps `imageBase` (TCGdex tail) separately, so overwriting `imageUrl`/`imageUrlSmall` does not affect non-EN images.

- [ ] **Step 1: Write the failing test**

```ts
// scripts/merge-overlay.test.ts
import { expect, test } from "bun:test";
import type { CorpusCard } from "../src/store/corpus/corpus-types";
import { mergePtcgOverlay } from "./merge-overlay";

const baseCard = (over: Partial<CorpusCard> = {}): CorpusCard => ({
	id: "base1-4",
	name: "Charizard",
	supertype: "Pokémon",
	setId: "base1",
	number: "4",
	imageBase: "base/base1/4",
	imageUrl: "https://assets.tcgdex.net/en/base/base1/4/high.webp",
	imageUrlSmall: "https://assets.tcgdex.net/en/base/base1/4/low.webp",
	rarity: "Rare", // TCGdex coarse rarity
	subtypes: ["Stage2"], // TCGdex assembled
	...over,
});

test("overlays ptcg rarity, subtypes, and EN images on a crosswalk hit", () => {
	const overlay = new Map([
		["base1-4", { rarity: "Rare Holo", subtypes: ["Stage 2"] }],
	]);
	const { merged, hits } = mergePtcgOverlay([baseCard()], overlay);
	expect(hits).toBe(1);
	expect(merged[0].rarity).toBe("Rare Holo"); // foil-table vocab
	expect(merged[0].subtypes).toEqual(["Stage 2"]);
	expect(merged[0].imageUrl).toBe("https://images.pokemontcg.io/base1/4_hires.png");
	expect(merged[0].imageUrlSmall).toBe("https://images.pokemontcg.io/base1/4.png");
	expect(merged[0].imageBase).toBe("base/base1/4"); // untouched → non-EN still TCGdex
});

test("leaves a card untouched on a crosswalk miss", () => {
	const { merged, hits } = mergePtcgOverlay([baseCard()], new Map());
	expect(hits).toBe(0);
	expect(merged[0].rarity).toBe("Rare");
});

test("empty overlay (crawl failed) returns cards unchanged (keep-last-good)", () => {
	const cards = [baseCard()];
	const { merged } = mergePtcgOverlay(cards, new Map());
	expect(merged[0]).toEqual(cards[0]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test scripts/merge-overlay.test.ts`
Expected: FAIL — `Cannot find module './merge-overlay'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// scripts/merge-overlay.ts
import { fallbackImageUrl, tcgdexCardToPtcg } from "../src/lib/corpus/id-crosswalk";
import type { CorpusCard } from "../src/store/corpus/corpus-types";
import type { PtcgOverlay } from "./ptcg-overlay";

/**
 * Overlay pokemontcg.io's richer metadata onto the TCGdex base corpus.
 * Per card: crosswalk the id; if the ptcg record exists, overlay its rarity
 * (foil-table vocab) + subtypes (multi-tag), and prefer its hires/lowres images
 * for the English base. `imageBase` is kept so non-EN images still derive the
 * TCGdex localized art. An empty overlay (a failed ptcg crawl) returns the cards
 * unchanged — a flaky upstream must never blank the data.
 */
export function mergePtcgOverlay(
	cards: CorpusCard[],
	overlay: PtcgOverlay,
): { merged: CorpusCard[]; hits: number } {
	if (overlay.size === 0) return { merged: cards, hits: 0 };
	let hits = 0;
	const merged = cards.map((card) => {
		const ov = overlay.get(tcgdexCardToPtcg(card.id));
		if (!ov) return card;
		hits++;
		const { large, small } = fallbackImageUrl(card.id);
		return {
			...card,
			rarity: ov.rarity ?? card.rarity,
			subtypes: ov.subtypes?.length ? ov.subtypes : card.subtypes,
			imageUrl: large,
			imageUrlSmall: small,
		};
	});
	return { merged, hits };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test scripts/merge-overlay.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/merge-overlay.ts scripts/merge-overlay.test.ts
git commit -m "feat(corpus): merge ptcg.io overlay (rarity/subtypes/EN images) onto base"
```

---

## Task 1.3: Wire the crawl + merge into the build entrypoint

**Files:**
- Modify: `scripts/build-corpus.ts` (the `if (import.meta.main)` entrypoint block, after `const trimmed = raw.map(trimCard);`)
- Test: covered by 1.1/1.2 (entrypoint is I/O glue; no new unit test).

**Interfaces:**
- Consumes: `fetchPtcgOverlay` (1.1), `mergePtcgOverlay` (1.2).

**Background (verbatim entrypoint excerpt):**
```ts
	const raw = await buildCorpus();
	const trimmed = raw.map(trimCard);
	const detail = raw.map(detailCard).sort((a, b) => a.id.localeCompare(b.id));
	const version = detailVersion(detail);
	console.log("Probing pokemontcg.io fallback URLs…");
	const noFallback = await resolveFallbackImages(trimmed);
	...
	const gz = gzipSync(Buffer.from(JSON.stringify(trimmed)));
```

- [ ] **Step 1: Add the imports** (top of `scripts/build-corpus.ts`, with the other imports)

```ts
import { mergePtcgOverlay } from "./merge-overlay";
import { fetchPtcgOverlay } from "./ptcg-overlay";
```

- [ ] **Step 2: Insert the crawl + merge** (immediately after `const trimmed = raw.map(trimCard);`)

```ts
	// Phase 3: overlay pokemontcg.io's richer English metadata. SKIP_PTCG_OVERLAY
	// lets local/offline builds skip the second upstream. A failed crawl yields an
	// empty overlay → mergePtcgOverlay keeps the TCGdex values (keep-last-good).
	let overlay = new Map();
	if (!process.env.SKIP_PTCG_OVERLAY) {
		try {
			console.log("Crawling pokemontcg.io overlay…");
			overlay = await fetchPtcgOverlay();
		} catch (err) {
			console.warn(`ptcg overlay crawl failed, keeping TCGdex values: ${err}`);
		}
	}
	const { merged, hits } = mergePtcgOverlay(trimmed, overlay);
	console.log(
		`ptcg overlay: ${hits}/${merged.length} cards enriched (${overlay.size} ptcg records)`,
	);
```

- [ ] **Step 3: Replace `trimmed` with `merged` in the downstream lines**

Change `resolveFallbackImages(trimmed)` → `resolveFallbackImages(merged)` and `JSON.stringify(trimmed)` → `JSON.stringify(merged)` and the final `Wrote ${trimmed.length}` → `Wrote ${merged.length}`.

- [ ] **Step 4: Verify the build runs offline (no network)**

Run: `SKIP_PTCG_OVERLAY=1 bun run scripts/build-corpus.ts /tmp/corpus-smoke.json.gz` — only if a TCGdex source (Docker mirror / `TCGDEX_BASE`) is available locally; otherwise verify the type-check instead:
Run: `bunx tsc -b`
Expected: PASS (no type errors from the new wiring).

- [ ] **Step 5: Commit**

```bash
git add scripts/build-corpus.ts
git commit -m "feat(corpus): crawl + merge ptcg.io overlay in the build entrypoint"
```

---

## Task 1.4: Set-logo gap-fill (complaint #1)

**Files:**
- Modify: `src/lib/corpus/id-crosswalk.ts` (add helper)
- Modify: `src/server/card-data-fetch.ts` (`mapTcgdexSet`, lines 42-59)
- Modify: `src/components/shell/set-tile.tsx` (logo `<img>` — add `onError` fallback to the existing name-text branch; **read lines ~82-90 first** to match the existing render)
- Test: `src/lib/corpus/id-crosswalk.test.ts` (add a case)

**Interfaces:**
- Produces: `ptcgSetImageUrl(tcgdexSetId: string, kind: "logo" | "symbol"): string`.

**Background (verbatim `mapTcgdexSet`):**
```ts
		images: {
			logo: s.logo ? `${s.logo}.png` : undefined,
			symbol: s.symbol ? `${s.symbol}.png` : undefined,
		},
```

- [ ] **Step 1: Write the failing crosswalk test** (append to `src/lib/corpus/id-crosswalk.test.ts`)

```ts
test("ptcgSetImageUrl crosswalks the set id and builds a logo url", () => {
	expect(ptcgSetImageUrl("base1", "logo")).toBe(
		"https://images.pokemontcg.io/base1/logo.png",
	);
	expect(ptcgSetImageUrl("swsh4.5", "symbol")).toBe(
		"https://images.pokemontcg.io/swsh45/symbol.png",
	);
});
```

Add `ptcgSetImageUrl` to the existing import at the top of the test file.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/corpus/id-crosswalk.test.ts`
Expected: FAIL — `ptcgSetImageUrl is not a function`.

- [ ] **Step 3: Add the helper** (`src/lib/corpus/id-crosswalk.ts`, near `ptcgImageUrl`)

```ts
/**
 * pokemontcg.io set logo/symbol url for a TCGdex set that has none (53/41 sets:
 * McDonald's, trainer kits, jumbo, promos). Crosswalks the set id. The set-tile
 * onError degrades a dead url to the set-name text, so an occasional 404 is safe.
 */
export function ptcgSetImageUrl(
	tcgdexSetId: string,
	kind: "logo" | "symbol",
): string {
	return `https://images.pokemontcg.io/${tcgdexSetToPtcg(tcgdexSetId)}/${kind}.png`;
}
```

- [ ] **Step 4: Use it in `mapTcgdexSet`** (`src/server/card-data-fetch.ts`)

Add the import: `import { ptcgSetImageUrl } from "../lib/corpus/id-crosswalk";`
Replace the `images` block:

```ts
		images: {
			// Fill TCGdex's 53/41 missing logos/symbols from pokemontcg.io (the
			// set-tile onError degrades a dead ptcg url to the set-name text).
			logo: s.logo ? `${s.logo}.png` : ptcgSetImageUrl(s.id, "logo"),
			symbol: s.symbol ? `${s.symbol}.png` : ptcgSetImageUrl(s.id, "symbol"),
		},
```

- [ ] **Step 5: Add `onError` to the set-tile logo image**

Read `src/components/shell/set-tile.tsx` around lines 82-90. The logo currently renders an `<img>` when `images.logo` is set and the set name text otherwise. Add a `useState` error flag so a failed logo load falls back to the SAME name-text branch:

```tsx
const [logoFailed, setLogoFailed] = useState(false);
// in the render: treat a failed load like a missing logo
{set.images?.logo && !logoFailed ? (
	<img
		src={set.images.logo}
		alt={set.name}
		onError={() => setLogoFailed(true)}
		/* …keep existing className/loading props… */
	/>
) : (
	/* …existing set-name text fallback… */
)}
```

- [ ] **Step 6: Run the tests + typecheck**

Run: `bun test src/lib/corpus/id-crosswalk.test.ts` and `bunx tsc -b`
Expected: PASS.

- [ ] **Step 7: Lint + commit**

```bash
bunx biome check --write src/lib/corpus/id-crosswalk.ts src/server/card-data-fetch.ts src/components/shell/set-tile.tsx
git add src/lib/corpus/id-crosswalk.ts src/lib/corpus/id-crosswalk.test.ts src/server/card-data-fetch.ts src/components/shell/set-tile.tsx
git commit -m "feat(sets): fill missing TCGdex set logos/symbols from pokemontcg.io"
```

---

# Phase 2 — Holo fix: crosswalk-miss rarity derivation

After Phase 1, cards with a ptcg crosswalk hit carry foil-table vocab and holos render. Cards the crosswalk MISSES still carry TCGdex's coarse/odd rarity (`"Rare"`, `"Ultra Rare"`, `"Holo Rare"`), which `getRarityClass` doesn't recognize → silent `holo-basic`. This phase normalizes those at build time.

## Task 2.1: Normalize unmatched TCGdex rarities to foil vocab

**Files:**
- Create: `scripts/normalize-rarity.ts`
- Test: `scripts/normalize-rarity.test.ts`
- Modify: `scripts/merge-overlay.ts` (apply to miss cards)

**Interfaces:**
- Produces: `normalizeTcgdexRarity(rarity: string | undefined, suffix: string | undefined): string | undefined`.

**Background:** `getRarityClass` keys (verbatim) include `"Rare Holo"`, `"Rare Holo GX"`, `"Rare Holo VMAX"`, `"Ultra Rare"`, `"Hyper Rare"`, `"Double Rare"`, `"Illustration Rare"`. TCGdex emits e.g. `"Holo Rare"` (word order flipped), `"Hyper rare"` (casing), and coarse `"Rare"`/`"Ultra Rare"` plus a `suffix` (`"GX"`, `"V"`, `"VMAX"`, `"VSTAR"`, `"TAG TEAM-GX"`). The `CorpusCard` does not carry `suffix`; pass the TCGdex `suffix` through the merge for miss cards (see Step 5).

- [ ] **Step 1: Write the failing test**

```ts
// scripts/normalize-rarity.test.ts
import { expect, test } from "bun:test";
import { getRarityClass } from "../src/components/holo-card/rarity";
import { normalizeTcgdexRarity } from "./normalize-rarity";

test("flips TCGdex word order / casing to ptcg vocab", () => {
	expect(normalizeTcgdexRarity("Holo Rare", undefined)).toBe("Rare Holo");
	expect(normalizeTcgdexRarity("Hyper rare", undefined)).toBe("Hyper Rare");
});

test("derives a foil rarity from suffix when TCGdex rarity is coarse", () => {
	expect(normalizeTcgdexRarity("Ultra Rare", "GX")).toBe("Rare Holo GX");
	expect(normalizeTcgdexRarity("Ultra Rare", "VMAX")).toBe("Rare Holo VMAX");
	expect(normalizeTcgdexRarity("Ultra Rare", "TAG TEAM-GX")).toBe("Rare Holo GX");
});

test("every normalized value is a known foil-table key", () => {
	for (const out of [
		normalizeTcgdexRarity("Holo Rare", undefined),
		normalizeTcgdexRarity("Ultra Rare", "V"),
	]) {
		// known keys never hit the "Unknown rarity" generic fallback path
		expect(getRarityClass(out)).not.toBe("no-foil");
	}
});

test("passes through plain rarities unchanged", () => {
	expect(normalizeTcgdexRarity("Common", undefined)).toBe("Common");
	expect(normalizeTcgdexRarity(undefined, undefined)).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test scripts/normalize-rarity.test.ts`
Expected: FAIL — `Cannot find module './normalize-rarity'`.

- [ ] **Step 3: Write the implementation**

```ts
// scripts/normalize-rarity.ts

// TCGdex rarity string → pokemontcg.io foil-table vocab. Only the values that
// diverge from the ptcg vocab the foil tables (rarity.ts) expect. Extend by
// auditing the built corpus (see the audit command in this task).
const RARITY_FIX: Record<string, string> = {
	"Holo Rare": "Rare Holo",
	"Hyper rare": "Hyper Rare",
	"Shiny rare": "Rare Shiny",
	"Shiny rare V": "Rare Shiny V",
	"Full Art Trainer": "Ultra Rare",
	"ACE SPEC Rare": "Rare Ultra",
	Crown: "Hyper Rare",
};

// The mechanic carried in TCGdex `suffix` maps a coarse rarity to its foil tier.
const SUFFIX_FOIL: { test: RegExp; rarity: string }[] = [
	{ test: /VMAX/i, rarity: "Rare Holo VMAX" },
	{ test: /VSTAR/i, rarity: "Rare Holo VSTAR" },
	{ test: /GX/i, rarity: "Rare Holo GX" },
	{ test: /\bV\b|V-UNION/i, rarity: "Rare Holo V" },
	{ test: /EX/i, rarity: "Rare Holo EX" },
];

const COARSE = new Set(["Rare", "Ultra Rare", "Secret Rare"]);

/**
 * Normalize a TCGdex rarity (for cards with NO ptcg overlay) to the vocab the
 * foil CSS tables are keyed on. Prefers an explicit fix; else, for a coarse
 * rarity, derives the foil tier from the card's mechanic `suffix`; else returns
 * the input unchanged.
 */
export function normalizeTcgdexRarity(
	rarity: string | undefined,
	suffix: string | undefined,
): string | undefined {
	if (!rarity) return rarity;
	if (RARITY_FIX[rarity]) return RARITY_FIX[rarity];
	if (suffix && COARSE.has(rarity)) {
		const hit = SUFFIX_FOIL.find((s) => s.test.test(suffix));
		if (hit) return hit.rarity;
	}
	return rarity;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test scripts/normalize-rarity.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Apply it to crosswalk-miss cards in the merge**

In `scripts/merge-overlay.ts`, the miss branch currently returns `card` unchanged. To normalize, the merge needs the TCGdex `suffix`. Thread a parallel `suffixById: Map<string, string>` built in the entrypoint from the raw crawl, and pass it to `mergePtcgOverlay`. Update the signature + miss branch:

```ts
import { normalizeTcgdexRarity } from "./normalize-rarity";
// signature: mergePtcgOverlay(cards, overlay, suffixById: Map<string, string> = new Map())
// miss branch:
		if (!ov) {
			const fixed = normalizeTcgdexRarity(card.rarity, suffixById.get(card.id));
			return fixed === card.rarity ? card : { ...card, rarity: fixed };
		}
```

In `scripts/build-corpus.ts` entrypoint, build the map before the merge call:
```ts
	const suffixById = new Map(
		raw.filter((c) => c.suffix).map((c) => [c.id, c.suffix as string]),
	);
	const { merged, hits } = mergePtcgOverlay(trimmed, overlay, suffixById);
```
Update the merge test from Task 1.2 to pass the new (optional) third arg where relevant, then re-run `bun test scripts/merge-overlay.test.ts`.

- [ ] **Step 6: Add the audit command to the build (optional log)**

In `scripts/build-corpus.ts`, after the merge log, list any post-merge rarities the foil table doesn't know, so the `RARITY_FIX` map can be extended:
```ts
	const { getRarityClass } = await import("../src/components/holo-card/rarity");
	const unknown = new Set(
		merged
			.map((c) => c.rarity)
			.filter((r): r is string => !!r && getRarityClass(r) === "holo-basic"),
	);
	if (unknown.size)
		console.warn(`rarities still on holo-basic fallback: ${[...unknown].join(", ")}`);
```

- [ ] **Step 7: Lint + commit**

```bash
bunx biome check --write scripts/normalize-rarity.ts scripts/merge-overlay.ts scripts/build-corpus.ts
git add scripts/normalize-rarity.ts scripts/normalize-rarity.test.ts scripts/merge-overlay.ts scripts/merge-overlay.test.ts scripts/build-corpus.ts
git commit -m "feat(corpus): normalize unmatched TCGdex rarities to foil vocab"
```

---

# Phase 3 — Subtypes facet: grouped + plural labels

## Task 3.1: Subtype grouping module

**Files:**
- Create: `src/components/islands/subtype-groups.ts`
- Test: `src/components/islands/subtype-groups.test.ts`

**Interfaces:**
- Produces: `type SubtypeGroup = "Stage" | "Mechanic" | "Trainer" | "Energy" | "Other"`; `groupSubtypes(options: string[]): { label: string; items: string[] }[]`.

- [ ] **Step 1: Write the failing test**

```ts
// src/components/islands/subtype-groups.test.ts
import { expect, test } from "bun:test";
import { groupSubtypes } from "./subtype-groups";

test("buckets values into ordered groups, Stage in evolution order", () => {
	const groups = groupSubtypes([
		"Supporter", "Stage 2", "ex", "Basic", "Item", "Stage 1", "Special",
	]);
	expect(groups.map((g) => g.label)).toEqual([
		"Stage", "Pokémon Mechanic", "Trainer", "Energy",
	]);
	expect(groups[0].items).toEqual(["Basic", "Stage 1", "Stage 2"]); // evolution order
	expect(groups[1].items).toEqual(["ex"]);
	expect(groups[2].items).toEqual(["Item", "Supporter"]); // alpha
	expect(groups[3].items).toEqual(["Special"]);
});

test("unknown values fall into Other, listed last", () => {
	const groups = groupSubtypes(["Basic", "Frobnicate"]);
	expect(groups.at(-1)).toEqual({ label: "Other", items: ["Frobnicate"] });
});

test("omits empty groups", () => {
	const groups = groupSubtypes(["Item"]);
	expect(groups).toEqual([{ label: "Trainer", items: ["Item"] }]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/components/islands/subtype-groups.test.ts`
Expected: FAIL — `Cannot find module './subtype-groups'`.

- [ ] **Step 3: Write the implementation**

```ts
// src/components/islands/subtype-groups.ts
export type SubtypeGroup =
	| "Stage"
	| "Mechanic"
	| "Trainer"
	| "Energy"
	| "Other";

// Seeded from TCGdex's typed-field axes (stage→Stage, suffix→Mechanic,
// trainerType→Trainer, energyType→Energy). The values are pokemontcg.io's
// canon subtype vocab. Extend as new vocab appears; unmapped → "Other".
// "Basic" collides (Basic Pokémon vs Basic Energy); facets are per-page, so on
// a Pokémon page "Basic" is a Stage — default it there.
export const SUBTYPE_GROUP: Record<string, SubtypeGroup> = {
	Basic: "Stage", "Stage 1": "Stage", "Stage 2": "Stage", BREAK: "Stage",
	Restored: "Stage", MEGA: "Stage", "Level-Up": "Stage", Baby: "Stage",
	"V-UNION": "Stage",
	ex: "Mechanic", EX: "Mechanic", GX: "Mechanic", V: "Mechanic",
	VMAX: "Mechanic", VSTAR: "Mechanic", Tera: "Mechanic", Radiant: "Mechanic",
	"TAG TEAM": "Mechanic", Prime: "Mechanic", LEGEND: "Mechanic", Star: "Mechanic",
	Shining: "Mechanic", Amazing: "Mechanic", Ancient: "Mechanic", Future: "Mechanic",
	"Single Strike": "Mechanic", "Rapid Strike": "Mechanic", "Fusion Strike": "Mechanic",
	Item: "Trainer", Supporter: "Trainer", Stadium: "Trainer",
	"Pokémon Tool": "Trainer", "Technical Machine": "Trainer", "ACE SPEC": "Trainer",
	Special: "Energy",
};

// Display order of the groups + their on-screen labels.
const GROUP_ORDER: { key: SubtypeGroup; label: string }[] = [
	{ key: "Stage", label: "Stage" },
	{ key: "Mechanic", label: "Pokémon Mechanic" },
	{ key: "Trainer", label: "Trainer" },
	{ key: "Energy", label: "Energy" },
	{ key: "Other", label: "Other" },
];

// Stage renders in evolution order, not alphabetical.
const STAGE_ORDER = [
	"Basic", "Baby", "Level-Up", "Stage 1", "Stage 2", "MEGA", "BREAK",
	"V-UNION", "Restored",
];

export function groupSubtypes(
	options: string[],
): { label: string; items: string[] }[] {
	const buckets = new Map<SubtypeGroup, string[]>();
	for (const o of options) {
		const g = SUBTYPE_GROUP[o] ?? "Other";
		const arr = buckets.get(g) ?? [];
		arr.push(o);
		buckets.set(g, arr);
	}
	return GROUP_ORDER.flatMap(({ key, label }) => {
		const items = buckets.get(key);
		if (!items?.length) return [];
		items.sort(
			key === "Stage"
				? (a, b) => STAGE_ORDER.indexOf(a) - STAGE_ORDER.indexOf(b)
				: (a, b) => a.localeCompare(b),
		);
		return [{ label, items }];
	});
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/components/islands/subtype-groups.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Lint + commit**

```bash
bunx biome check --write src/components/islands/subtype-groups.ts
git add src/components/islands/subtype-groups.ts src/components/islands/subtype-groups.test.ts
git commit -m "feat(filters): subtype grouping (Stage/Mechanic/Trainer/Energy)"
```

---

## Task 3.2: Grouped Subtypes facet + plural labels

**Files:**
- Modify: `src/components/islands/search-controls.tsx` (`FilterSelect` + the four facet invocations)
- Test: `src/components/islands/search-controls.test.tsx` (add a grouped-render case)

**Background (verbatim `FilterSelect` + invocations):** see Task notes — `FilterSelect` renders flat `SelectItem`s; the four facets pass singular labels (`"Subtype"`, `"Rarity"`, `"Card Type"`, `"Energy Type"`). `select.tsx` exports `SelectGroup` + `SelectLabel`.

- [ ] **Step 1: Write the failing test** (append to `search-controls.test.tsx`)

```tsx
test("subtype facet renders grouped section headings", async () => {
	renderControls({}); // existing helper; ensure its options include subtypes
	fireEvent.click(screen.getByRole("combobox", { name: /Subtypes/i }));
	// SelectLabel headings are non-interactive text in the open listbox
	expect(await screen.findByText("Stage")).toBeInTheDocument();
	expect(screen.getByText("Pokémon Mechanic")).toBeInTheDocument();
	expect(screen.getByRole("option", { name: "All Subtypes" })).toBeInTheDocument();
});
```

If `renderControls`'s default options lack subtypes, extend its `options` fixture with `subtypes: ["Basic", "GX"]`.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/components/islands/search-controls.test.tsx`
Expected: FAIL — no "Stage" heading / no "All Subtypes" option.

- [ ] **Step 3: Add `groups` support to `FilterSelect`** and the import

Add to the imports from `@/components/ui/select`: `SelectGroup`, `SelectLabel`. Add the grouping import: `import { groupSubtypes } from "./subtype-groups";`

Extend `FilterSelect` with an optional `grouped` prop:

```tsx
function FilterSelect({
	label,
	value,
	options,
	onChange,
	grouped = false,
}: {
	label: string;
	value: string[];
	options: string[];
	onChange: (v: string[]) => void;
	grouped?: boolean;
}) {
	const ALL = "__all__";
	const groups = grouped ? groupSubtypes(options) : null;
	return (
		<Select
			value={value[0] ?? ALL}
			onValueChange={(v) => onChange(v === ALL ? [] : [v])}
		>
			<SelectTrigger className="text-sm w-full">
				<SelectValue placeholder={label} />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value={ALL}>{`All ${label}`}</SelectItem>
				{groups
					? groups.map((g) => (
							<SelectGroup key={g.label}>
								<SelectLabel>{g.label}</SelectLabel>
								{g.items.map((o) => (
									<SelectItem key={o} value={o}>
										{o}
									</SelectItem>
								))}
							</SelectGroup>
						))
					: options.map((o) => (
							<SelectItem key={o} value={o}>
								{o}
							</SelectItem>
						))}
			</SelectContent>
		</Select>
	);
}
```

- [ ] **Step 4: Pluralize labels + turn on grouping for Subtypes**

Update the four facet invocations:
```tsx
<FilterSelect label="Card Types" value={value.supertype} options={options.supertypes} onChange={(v) => onChange({ supertype: v })} />
<FilterSelect label="Subtypes" grouped value={value.subtypes} options={options.subtypes} onChange={(v) => onChange({ subtypes: v })} />
<FilterSelect label="Rarities" value={value.rarity} options={options.rarities} onChange={(v) => onChange({ rarity: v })} />
<FilterSelect label="Energy Types" value={value.types} options={options.types} onChange={(v) => onChange({ types: v })} />
```
(`All ${label}` now yields "All Subtypes" / "All Rarities" / "All Card Types" / "All Energy Types".)

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun test src/components/islands/search-controls.test.tsx`
Expected: PASS. If an existing test queried the old singular name (e.g. `name: "Subtype"`), update it to the plural.

- [ ] **Step 6: Lint + commit**

```bash
bunx biome check --write src/components/islands/search-controls.tsx
git add src/components/islands/search-controls.tsx src/components/islands/search-controls.test.tsx
git commit -m "feat(filters): grouped Subtypes facet + pluralized All-X labels"
```

---

# Phase 4 — Locale UX

## Task 4.1: Per-card "EN" fallback badge on grid tiles

**Files:**
- Create: `src/components/islands/lang-fallback-badge.tsx`
- Modify: `src/components/islands/card-grid-island.tsx` (`renderCard`)
- Test: `src/components/islands/lang-fallback-badge.test.tsx`

**Interfaces:**
- Consumes: `useActiveI18n()` → `{ lang, namesById } | null` (`src/store/corpus/i18n-active-hooks.ts`); the `I18nOverlay` type (`src/store/corpus/corpus-engine.ts`).
- Produces: `isI18nFallback(overlay: I18nOverlay | null, cardId: string): boolean` (in `i18n-active-hooks.ts`, reused by Task 4.2); `<LangFallbackBadge show={boolean} />`.

**Background:** A card is showing English fallback when an overlay is active (`lang !== "en"`) and the card's id is absent from `namesById`. That predicate is extracted as a pure, unit-tested helper so both the grid badge (this task) and the modal notice (4.2) share it without re-rendering a router-bound component in a test.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/islands/lang-fallback-badge.test.tsx
import { render, screen } from "@testing-library/react";
import { expect, test } from "bun:test";
import { LangFallbackBadge } from "./lang-fallback-badge";

test("renders an EN badge when show is true", () => {
	render(<LangFallbackBadge show />);
	expect(screen.getByText("EN")).toBeInTheDocument();
});

test("renders nothing when show is false", () => {
	const { container } = render(<LangFallbackBadge show={false} />);
	expect(container).toBeEmptyDOMElement();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/components/islands/lang-fallback-badge.test.tsx`
Expected: FAIL — `Cannot find module './lang-fallback-badge'`.

- [ ] **Step 3: Write the component** (Liquid Glass: frosted muted chip)

```tsx
// src/components/islands/lang-fallback-badge.tsx
/**
 * Small muted "EN" chip shown on a grid tile whose card has no localized data
 * for the active (non-English) catalog language — it is rendering the English
 * fallback. Only the minority of fallback cards are badged, keeping the grid clean.
 */
export function LangFallbackBadge({ show }: { show: boolean }) {
	if (!show) return null;
	return (
		<span
			aria-label="Shown in English"
			className="pointer-events-none absolute right-1 top-1 rounded-(--r-pill) border border-white/10 bg-black/45 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-(--ink-muted) backdrop-blur-sm"
		>
			EN
		</span>
	);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/components/islands/lang-fallback-badge.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the failing helper test**

```ts
// append to src/store/corpus/i18n-active-hooks.test.ts (or create it, bun:test)
import { expect, test } from "bun:test";
import { isI18nFallback } from "./i18n-active-hooks";

test("isI18nFallback is false for the English steady state (null overlay)", () => {
	expect(isI18nFallback(null, "base1-4")).toBe(false);
});
test("isI18nFallback is true when the active overlay lacks the card", () => {
	const overlay = { lang: "de", namesById: new Map([["base1-9", "X"]]) };
	expect(isI18nFallback(overlay, "base1-4")).toBe(true);
});
test("isI18nFallback is false when the overlay has the card", () => {
	const overlay = { lang: "de", namesById: new Map([["base1-4", "Glurak"]]) };
	expect(isI18nFallback(overlay, "base1-4")).toBe(false);
});
```

Run: `bun test src/store/corpus/i18n-active-hooks.test.ts`
Expected: FAIL — `isI18nFallback is not a function`.

- [ ] **Step 6: Add the helper + mount the badge**

Add to `src/store/corpus/i18n-active-hooks.ts`:
```ts
import type { I18nOverlay } from "./corpus-engine";

/**
 * True when a non-English overlay is active but this card has no localized name,
 * so it renders the English fallback. Pure (no React) → shared by the grid badge
 * and the modal notice. A null overlay is the English steady state → never a fallback.
 */
export function isI18nFallback(
	overlay: I18nOverlay | null,
	cardId: string,
): boolean {
	return !!overlay && !overlay.namesById?.has(cardId);
}
```
Then in `card-grid-island.tsx` add the imports + read the overlay once in the island body (alongside the existing `displayLang`), and mount the badge inside `<FlipCard>` (sibling to `HoloCardIsland`):
```tsx
import { isI18nFallback, useActiveI18n } from "@/store/corpus/i18n-active-hooks";
import { LangFallbackBadge } from "./lang-fallback-badge";
// island body:
const i18n = useActiveI18n();
// …inside <FlipCard>, after <HoloCardIsland …/>:
	<LangFallbackBadge show={isI18nFallback(i18n, card.id)} />
```
(`FlipCard`'s inner container is `position: relative`; the badge is `absolute`. If the FlipCard root lacks `relative`, add it.)

Run: `bun test src/store/corpus/i18n-active-hooks.test.ts src/components/islands/lang-fallback-badge.test.tsx`
Expected: PASS.

- [ ] **Step 7: Verify in the preview** (real-app check)

Start the dev server (`preview_start`), open a set page, switch the catalog language to Deutsch via the ResultsBar control, and confirm an "EN" chip appears only on cards without German data. Screenshot for proof.

- [ ] **Step 8: Lint + commit**

```bash
bunx biome check --write src/components/islands/lang-fallback-badge.tsx src/components/islands/card-grid-island.tsx src/store/corpus/i18n-active-hooks.ts
git add src/components/islands/lang-fallback-badge.tsx src/components/islands/lang-fallback-badge.test.tsx src/components/islands/card-grid-island.tsx src/store/corpus/i18n-active-hooks.ts src/store/corpus/i18n-active-hooks.test.ts
git commit -m "feat(i18n): per-card EN fallback badge on grid tiles"
```

---

## Task 4.2: Language control + fallback notice in the card modal/page

**Files:**
- Modify: `src/components/islands/card-modal.tsx` (inject the control + notice in `DialogHeader`)
- Modify (if the dedicated `$card` page shares a header): `src/components/card/card-info.tsx` is shared by modal + page via `CardHeading`; mount the control in the modal header and, if the cold `$card` route renders its own header, mirror it there.
- Test: `src/components/islands/card-modal.test.tsx` (add a case; create if absent following the i18n test style)

**Background (verbatim):** `card-modal.tsx` renders `<DialogHeader><CardHeading card={card} /></DialogHeader>`. `card-cockpit.tsx` reads `useActiveI18n()` and localizes via `cardImage(card, i18n?.lang ?? "en")`. `CardLanguageControl` takes `{ value: ListSearch; onChange: (patch) => void }` and emits `{ lang }` patches. The modal lives in a route, so it can call TanStack Router's `useNavigate` to write the `lang` search param (which `useEnsureI18n` already reads).

> No isolated unit test: the fallback predicate is already covered by `isI18nFallback` (Task 4.1), and the rest of this task is router + dialog glue. Correctness is verified in the preview (Step 4). This keeps us from standing up a full router/dialog/i18n harness just to assert glue.

- [ ] **Step 1: Add a small `ModalLangControl` wrapper for the modal** (wires the control to the route's `lang` search param)

```tsx
// near the top of card-modal.tsx
import { useNavigate } from "@tanstack/react-router";
import { CardLanguageControl } from "./card-language-control";
import { isI18nFallback, useActiveI18n } from "@/store/corpus/i18n-active-hooks";

function ModalLangControl({ cardId }: { cardId: string }) {
	const navigate = useNavigate();
	const i18n = useActiveI18n();
	const lang = i18n?.lang ?? "en";
	const isFallback = isI18nFallback(i18n, cardId);
	return (
		<div className="flex items-center gap-2">
			<CardLanguageControl
				value={{ lang: lang === "en" ? null : (lang as never) }}
				onChange={(patch) =>
					navigate({
						to: ".",
						search: (prev) => ({ ...prev, lang: patch.lang ?? undefined }),
						replace: true,
					})
				}
			/>
			{isFallback ? (
				<span className="font-mono text-[11px] text-(--ink-muted)">
					Shown in English.
				</span>
			) : null}
		</div>
	);
}
```

- [ ] **Step 2: Mount it in the `DialogHeader`**

```tsx
			<DialogHeader>
				<CardHeading card={card} />
				<ModalLangControl cardId={card.id} />
			</DialogHeader>
```

- [ ] **Step 3: Typecheck**

Run: `bunx tsc -b`
Expected: PASS (the `useNavigate` search-param patch and `CardLanguageControl` props type-check).

- [ ] **Step 4: Verify in the preview**

Open a card modal for a card lacking German data while Deutsch is active; confirm the language control is present, the "Shown in English." notice appears, and switching to French re-localizes the card in place. Screenshot.

- [ ] **Step 5: Lint + commit**

```bash
bunx biome check --write src/components/islands/card-modal.tsx
git add src/components/islands/card-modal.tsx src/components/islands/card-modal.test.tsx
git commit -m "feat(i18n): language control + fallback notice in the card modal"
```

---

## Task 4.3: Computed coverage into i18n meta

**Files:**
- Modify: `scripts/build-i18n.ts` (`I18nMeta` interface + `buildI18n` return + `writeI18n`)
- Modify: `src/lib/languages.ts` (refresh `LANGUAGE_COVERAGE` values + comment)
- Test: `scripts/build-i18n.test.ts` (add/extend a `writeI18n` meta case if the file exists; else assert the shape inline)

**Background (verbatim):** `buildI18n` already computes `const coverage = expected > 0 ? entries.length / expected : 0;` and logs it. `writeI18n` writes `meta = { version, count, builtAt }`. `I18nMeta` is `{ version: string; count: number; builtAt: string }`.

- [ ] **Step 1: Add `coverage` to `I18nMeta`**

```ts
export interface I18nMeta {
	version: string;
	count: number;
	builtAt: string;
	coverage: number; // entries / expected, 0..1
}
```

- [ ] **Step 2: Thread coverage through `buildI18n` → `writeI18n`**

In `I18nResult` add `coverage: number;` and set it where `coverage` is computed (`return { ..., coverage }`). In `writeI18n`, include it in the meta object:
```ts
	const meta: I18nMeta = {
		version: result.version,
		count: result.entries.length,
		builtAt: new Date().toISOString(),
		coverage: result.coverage,
	};
```

- [ ] **Step 3: Log a ready-to-paste `LANGUAGE_COVERAGE` block**

In the multi-language build driver, accumulate `lang → coverage` as each language finishes (the driver has the `lang` in scope at the call site; `I18nMeta` itself carries no `lang`), then print once at the end:
```ts
	const coverageByLang: Record<string, number> = { en: 1 };
	// at each language's build call site:
	//   coverageByLang[lang] = Number(result.coverage.toFixed(2));
	console.log("LANGUAGE_COVERAGE =", JSON.stringify(coverageByLang));
```

- [ ] **Step 4: Refresh `src/lib/languages.ts`**

Replace the hand-tuned `LANGUAGE_COVERAGE` numbers with the values from the build log, and update the comment to note they are mechanically generated by `scripts/build-i18n.ts` (paste from its `LANGUAGE_COVERAGE =` line on each corpus rebuild). Keep `en: 1`.

> Note: the live dropdown still reads the static `LANGUAGE_COVERAGE` (it needs ALL languages at once; the i18n runtime only holds the active overlay). Wiring the dropdown to fetch `meta.coverage` per language at runtime is a deliberate follow-up, not part of this task — the per-card badge (Task 4.1/4.2) is the actual fix for "the % doesn't tell the per-card story."

- [ ] **Step 5: Typecheck + run i18n tests**

Run: `bunx tsc -b` and `bun test scripts/build-i18n.test.ts`
Expected: PASS (the new required `coverage` field type-checks across `I18nMeta`/`I18nResult` call sites).

- [ ] **Step 6: Lint + commit**

```bash
bunx biome check --write scripts/build-i18n.ts src/lib/languages.ts
git add scripts/build-i18n.ts src/lib/languages.ts scripts/build-i18n.test.ts
git commit -m "feat(i18n): write computed coverage into meta.json + refresh LANGUAGE_COVERAGE"
```

---

# Final verification (run at phase boundaries / before PR)

- [ ] **Full test suite:** `bun test` — all green.
- [ ] **Typecheck:** `bunx tsc -b` — clean.
- [ ] **Lint:** `bunx biome check` (or explicit paths in a worktree) — clean.
- [ ] **Corpus smoke** (if a TCGdex source is available): `bun run scripts/build-corpus.ts /tmp/corpus.json.gz` then spot-check that `base1-4` carries `rarity: "Rare Holo"` and `subtypes: ["Stage 2"]`, and that the `ptcg overlay: N/M enriched` log shows a high hit rate.
- [ ] **Preview holos:** boot the dev server, open a vintage Rare Holo and a modern VMAX, confirm both render their foil (not flat) — the original complaint #2.

---

## Coverage check (this plan vs the spec)

| Spec item | Task |
|---|---|
| Two-source crawl in the Action + keep-last-good | 1.1, 1.3 |
| Overlay rarity (fixes holos) | 1.2, 2.1 |
| Overlay richer subtypes | 1.2 |
| ptcg.io EN images (grid lowres / modal hires) | 1.2 |
| Missing set logos gap-fill (#1) | 1.4 |
| Holo crosswalk-miss derivation (#2) | 2.1 |
| Grouped Subtypes facet (#6, #7) | 3.1, 3.2 |
| Plural "All X" labels (#6) | 3.2 |
| Per-card EN fallback badge (#3) | 4.1, 4.2 |
| Language control in modal (#4) | 4.2 |
| Computed coverage into meta.json | 4.3 |

Parked per the spec: image-delivery transform (#5), pricing, `variants_detailed` (the next two branches).
