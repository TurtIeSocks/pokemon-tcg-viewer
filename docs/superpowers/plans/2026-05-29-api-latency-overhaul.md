# API + Image Latency Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the viewer feel fast — cut grid image weight ~10×, make set/pokémon revisits instant, hide click latency, and put a shared edge cache + image CDN in front of the slow `api.pokemontcg.io` origin.

**Architecture:** Three independently-shippable phases. **Tier 1** is client-only (ships to GitHub Pages unchanged): small grid images, lazy/async `<img>`, Workbox stale-while-revalidate + service worker in dev, grid pages persisted to IndexedDB with SWR, and hover-prefetch of card detail. **Tier 2** adds a Cloudflare Worker that proxies the API with an edge cache and moves the API key server-side. **Tier 3** routes images through wsrv.nl for resized WebP with a direct-image fallback.

**Tech Stack:** React 19 + react-router 7, Zustand 5 (persist → idb-keyval), Vite 8 + vite-plugin-pwa (Workbox), react-virtuoso. Tests run on **`bun test`** (bun:test + @happy-dom + fake-indexeddb). Lint/format = Biome (tabs, double quotes). Typecheck = `tsc -b`. Cloudflare Worker via Wrangler.

**Spec:** `docs/superpowers/specs/2026-05-29-api-latency-overhaul-design.md`

---

## Conventions (read once)

- **Run a single test file:** `bun test path/to/file.test.ts`
- **Run the whole suite:** `bun test`
- **Typecheck:** `bun run typecheck` · **Lint:** `bun run lint` · **Build:** `bun run build`
- **TS style:** `verbatimModuleSyntax` is on → import types with `import type {…}` (or inline `import { type X }`). No enums/namespaces (`erasableSyntaxOnly`). Indent with **tabs**, strings **double-quoted** (Biome enforces; `bun run format` auto-fixes).
- **Commit** after each task's tests pass. Frequent commits.
- The persisted store is a module singleton (`useStore`). Hook/store tests must reset it in `beforeEach` with `useStore.setState({ … })`.

## File Structure

**Tier 1**
- `src/components/holo-card/types.ts` — add optional `imageUrlSmall` to `HoloCardData`.
- `src/api.ts` — populate `imageUrlSmall` in `apiCardToProps`; (Tier 2) `API_BASE` + drop client key.
- `src/components/holo-card/holo-card.tsx` — pick small vs large by `size`, add `loading`/`decoding`/`fetchpriority`, add `onPrefetch`.
- `src/components/card-grid.tsx`, `src/components/pokemon-timeline/pokemon-timeline.tsx` — pass `imageUrlSmall` + `onPrefetch`.
- `src/store/freshness.ts` — add `"cards"` kind.
- `src/store/cards-slice.ts` *(new)* — persisted grid-page cache + reducers + LRU.
- `src/store/index.ts` — compose + partialize the new slice; bump storage version.
- `src/hooks/use-cards.ts` — back onto the persisted slice + SWR.
- `src/pages/card-prefetch.ts` *(new)* — id→Promise prefetch cache + `warmCard`.
- `src/pages/card-loader.ts` — await a prefetched promise if present.
- `vite.config.ts` — Workbox SWR + `devOptions`.

**Tier 2**
- `worker/wrangler.toml`, `worker/src/index.ts`, `worker/tsconfig.json` *(new)* — edge proxy.
- `src/api.ts`, `vite.config.ts`, `.env.example`, `README.md` — client wiring + docs.

**Tier 3**
- `src/components/holo-card/cdn-image.ts` *(new)* — wsrv URL builder.
- `src/components/holo-card/holo-card.tsx` — `<picture>` with CDN `<source>`.
- `vite.config.ts` — wsrv runtime-cache entry.

---

# PHASE / TIER 1 — Client-only

## Task 1: `imageUrlSmall` on card data + API mapping

**Files:**
- Modify: `src/components/holo-card/types.ts`
- Modify: `src/api.ts` (`apiCardToProps`, ~line 33)
- Test: `src/api.test.ts` *(new)*

- [ ] **Step 1: Write the failing test**

Create `src/api.test.ts`:

```ts
import { afterEach, expect, mock, test } from "bun:test";
import { getCardsBySet } from "./api";

const realFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = realFetch;
});

test("getCardsBySet maps images.small → imageUrlSmall and images.large → imageUrl", async () => {
	globalThis.fetch = mock(
		async () =>
			new Response(
				JSON.stringify({
					data: [
						{
							id: "swsh4-43",
							name: "Pikachu V",
							supertype: "Pokémon",
							number: "43",
							set: {
								id: "swsh4",
								name: "Vivid Voltage",
								series: "Sword & Shield",
							},
							images: {
								small: "https://img/small.png",
								large: "https://img/large.png",
							},
						},
					],
					totalCount: 1,
				}),
				{ status: 200 },
			),
	) as typeof fetch;

	const { cards } = await getCardsBySet("swsh4", 1, 20);
	expect(cards[0].imageUrl).toBe("https://img/large.png");
	expect(cards[0].imageUrlSmall).toBe("https://img/small.png");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/api.test.ts`
Expected: FAIL — `imageUrlSmall` is `undefined` (property not set yet).

- [ ] **Step 3: Implement**

In `src/components/holo-card/types.ts`, add to `HoloCardData` (after `imageUrl`):

```ts
	imageUrl: string;
	/** Smaller (~245px) image for grids; falls back to imageUrl when absent. */
	imageUrlSmall?: string;
```

In `src/api.ts`, in `apiCardToProps`, add the field next to `imageUrl`:

```ts
		id: card.id,
		imageUrl: card.images.large,
		imageUrlSmall: card.images.small,
		name: card.name,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/api.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api.ts src/api.test.ts src/components/holo-card/types.ts
git commit -m "feat(api): expose imageUrlSmall on card data for lighter grids"
```

---

## Task 2: HoloCard uses small image in grid + lazy/async attrs

**Files:**
- Modify: `src/components/holo-card/holo-card.tsx`
- Test: `src/components/holo-card/holo-card.test.tsx` (append)

- [ ] **Step 1: Write the failing tests**

Append to `src/components/holo-card/holo-card.test.tsx`:

```ts
test("grid size renders the small image lazily", () => {
	const { container } = render(
		<HoloCard
			imageUrl="https://img/large.png"
			imageUrlSmall="https://img/small.png"
			name="Pikachu"
			size="grid"
		/>,
	);
	const img = container.querySelector("img.holo-card-image") as HTMLImageElement;
	expect(img.getAttribute("src")).toBe("https://img/small.png");
	expect(img.getAttribute("loading")).toBe("lazy");
	expect(img.getAttribute("decoding")).toBe("async");
});

test("focus size renders the large image eagerly with high priority", () => {
	const { container } = render(
		<HoloCard
			imageUrl="https://img/large.png"
			imageUrlSmall="https://img/small.png"
			name="Pikachu"
			size="focus"
		/>,
	);
	const img = container.querySelector("img.holo-card-image") as HTMLImageElement;
	expect(img.getAttribute("src")).toBe("https://img/large.png");
	expect(img.getAttribute("loading")).toBe("eager");
	expect(img.getAttribute("fetchpriority")).toBe("high");
});

test("falls back to imageUrl when imageUrlSmall is absent", () => {
	const { container } = render(
		<HoloCard imageUrl="https://img/large.png" name="Pikachu" size="grid" />,
	);
	const img = container.querySelector("img.holo-card-image") as HTMLImageElement;
	expect(img.getAttribute("src")).toBe("https://img/large.png");
});
```

Confirm the top of the file imports `render` and `HoloCard` (it already does for the existing tests; if `render` is missing, add `import { render } from "@testing-library/react";`).

- [ ] **Step 2: Run to verify failure**

Run: `bun test src/components/holo-card/holo-card.test.tsx`
Expected: FAIL — `imageUrlSmall` is not a prop; src is always `imageUrl`; no `loading`/`fetchpriority`.

- [ ] **Step 3: Implement**

In `src/components/holo-card/holo-card.tsx`:

Add to `HoloCardProps` (after `imageUrl`):

```ts
	imageUrl: string;
	/** Smaller image used for grid display; falls back to imageUrl. */
	imageUrlSmall?: string;
```

Add `imageUrlSmall` to the destructured params (after `imageUrl,`):

```ts
	imageUrl,
	imageUrlSmall,
```

Replace the `<img …>` line (currently `<img className="holo-card-image" src={imageUrl} alt="" />`) with:

```tsx
			<img
				className="holo-card-image"
				src={size === "focus" ? imageUrl : (imageUrlSmall ?? imageUrl)}
				alt=""
				loading={size === "focus" ? "eager" : "lazy"}
				decoding={size === "focus" ? "auto" : "async"}
				fetchPriority={size === "focus" ? "high" : "auto"}
			/>
```

> Note: React 19 lowercases `fetchPriority` to the `fetchpriority` attribute. The test asserts the lowercased attribute.

- [ ] **Step 4: Run to verify pass**

Run: `bun test src/components/holo-card/holo-card.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/holo-card/holo-card.tsx src/components/holo-card/holo-card.test.tsx
git commit -m "feat(holo-card): small image + lazy/async in grid, eager/high-priority in focus"
```

---

## Task 3: Grid callers pass `imageUrlSmall`

**Files:**
- Modify: `src/components/card-grid.tsx` (~line 64)
- Modify: `src/components/pokemon-timeline/pokemon-timeline.tsx` (~line 55)
- Test: `src/components/card-grid.test.tsx` (append)

- [ ] **Step 1: Write the failing test**

Append to `src/components/card-grid.test.tsx` a test that the grid renders the small src. Add a second fixture and test inside the existing `describe`:

```ts
test("renders the small image for grid cards", async () => {
	const router = createMemoryRouter(
		[
			{
				path: "/",
				element: (
					<VirtuosoGridMockContext.Provider
						value={{
							viewportHeight: 600,
							viewportWidth: 800,
							itemHeight: 400,
							itemWidth: 300,
						}}
					>
						<CardGrid
							setId="swsh4"
							cards={[
								{
									...fixture,
									imageUrl: "https://img/large.png",
									imageUrlSmall: "https://img/small.png",
								},
							]}
							onEndReached={() => {}}
						/>
					</VirtuosoGridMockContext.Provider>
				),
			},
		],
		{ initialEntries: ["/"] },
	);
	const { container } = render(<RouterProvider router={router} />);
	await screen.findByLabelText("Pikachu V");
	const img = container.querySelector("img.holo-card-image") as HTMLImageElement;
	expect(img.getAttribute("src")).toBe("https://img/small.png");
});
```

(`screen.findByLabelText("Pikachu V")` works because `HoloCard` sets `aria-label={name}` on the root.)

- [ ] **Step 2: Run to verify failure**

Run: `bun test src/components/card-grid.test.tsx`
Expected: FAIL — grid still passes only `imageUrl`, so src is the large URL.

- [ ] **Step 3: Implement**

In `src/components/card-grid.tsx`, in the `<HoloCard …>` props, add `imageUrlSmall` right after `imageUrl`:

```tsx
						imageUrl={card.imageUrl}
						imageUrlSmall={card.imageUrlSmall}
```

In `src/components/pokemon-timeline/pokemon-timeline.tsx`, do the same in its `<HoloCard …>`:

```tsx
								imageUrl={card.imageUrl}
								imageUrlSmall={card.imageUrlSmall}
```

- [ ] **Step 4: Run to verify pass**

Run: `bun test src/components/card-grid.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/card-grid.tsx src/components/pokemon-timeline/pokemon-timeline.tsx src/components/card-grid.test.tsx
git commit -m "feat(grid): pass imageUrlSmall so grids load lightweight images"
```

---

## Task 4: Workbox stale-while-revalidate + service worker in dev

**Files:**
- Modify: `vite.config.ts`

No unit test (build-time config). Verify by build + manual preview.

- [ ] **Step 1: Edit the API runtime-cache handler**

In `vite.config.ts`, in the `runtimeCaching` array, change the `api.pokemontcg.io` entry's `handler` from `"CacheFirst"` to `"StaleWhileRevalidate"` (leave `cacheName` and `expiration` unchanged):

```ts
				{
					urlPattern: /^https:\/\/api\.pokemontcg\.io\//,
					handler: "StaleWhileRevalidate",
					options: {
						cacheName: "pokemontcg-api",
						expiration: { maxEntries: 200, maxAgeSeconds: SEVEN_DAYS },
					},
				},
```

- [ ] **Step 2: Enable the SW in dev**

In the same `VitePWA({ … })` call, add a top-level `devOptions` key (sibling of `workbox`):

```ts
			devOptions: {
				enabled: true,
				type: "module",
				navigateFallback: "index.html",
			},
```

- [ ] **Step 3: Verify the build still succeeds**

Run: `bun run build`
Expected: build completes; output includes a generated `sw.js`.

- [ ] **Step 4: Manual smoke (record result in the commit body or PR)**

Run `bun run dev`, open `http://localhost:6201/pokemon-tcg-viewer/`, DevTools → Application → Service Workers: a worker is **activated** in dev. Reload a set; Network shows the second identical API call served `(ServiceWorker)`.

> **HMR caveat:** if SW-in-dev breaks hot reload in practice, remove `devOptions.enabled` and instead document `bun run preview` as the realistic-perf check. Note which path you took in the commit message.

- [ ] **Step 5: Commit**

```bash
git add vite.config.ts
git commit -m "perf(pwa): stale-while-revalidate API cache + service worker in dev"
```

---

## Task 5: `freshness` gains a `"cards"` kind

**Files:**
- Modify: `src/store/freshness.ts`
- Test: `src/store/freshness.test.ts` *(new)*

- [ ] **Step 1: Write the failing test**

Create `src/store/freshness.test.ts`:

```ts
import { expect, test } from "bun:test";
import { shouldRefetch } from "./freshness";

const DAY = 24 * 60 * 60 * 1000;

test("cards: never-fetched is stale", () => {
	expect(shouldRefetch({ lastFetchedAt: null, kind: "cards" })).toBe(true);
});

test("cards: fetched 1h ago is fresh", () => {
	expect(
		shouldRefetch({ lastFetchedAt: Date.now() - 60 * 60 * 1000, kind: "cards" }),
	).toBe(false);
});

test("cards: fetched 25h ago is stale", () => {
	expect(
		shouldRefetch({ lastFetchedAt: Date.now() - 25 * 60 * 60 * 1000, kind: "cards" }),
	).toBe(true);
});

test("cards TTL is one day", () => {
	expect(shouldRefetch({ lastFetchedAt: Date.now() - (DAY - 1000), kind: "cards" })).toBe(false);
	expect(shouldRefetch({ lastFetchedAt: Date.now() - (DAY + 1000), kind: "cards" })).toBe(true);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test src/store/freshness.test.ts`
Expected: FAIL — TypeScript rejects `kind: "cards"` (not in the union) / runtime falls through to filter TTL.

- [ ] **Step 3: Implement**

In `src/store/freshness.ts`:

Add `"cards"` to the `kind` union in `FreshnessInput`:

```ts
	kind: "sets" | "pokemonList" | "filterValues" | "packCards" | "cards";
```

Add the constant near the other TTLs:

```ts
// Grid pages (set / pokédex lists) revalidate after a day — fresh enough for
// new prints, long enough that revisits within a session are instant.
const CARDS_TTL_MS = DAY_MS;
```

Add a branch in the `ttl` ternary inside `shouldRefetch`:

```ts
	const ttl =
		kind === "sets"
			? SETS_TTL_MS
			: kind === "pokemonList"
				? POKEMON_LIST_TTL_MS
				: kind === "packCards"
					? PACK_CARDS_TTL_MS
					: kind === "cards"
						? CARDS_TTL_MS
						: FILTER_VALUES_TTL_MS;
```

- [ ] **Step 4: Run to verify pass**

Run: `bun test src/store/freshness.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/store/freshness.ts src/store/freshness.test.ts
git commit -m "feat(store): add 'cards' freshness kind (24h TTL)"
```

---

## Task 6: `cards-slice` — persisted grid pages with dedup, SWR-aware merge, LRU

**Files:**
- Create: `src/store/cards-slice.ts`
- Test: `src/store/cards-slice.test.ts` *(new)*

- [ ] **Step 1: Write the failing tests**

Create `src/store/cards-slice.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { create } from "zustand";
import type { HoloCardData } from "../components/holo-card";
import { type CardsSlice, createCardsSlice } from "./cards-slice";

function card(id: string): HoloCardData {
	return {
		id,
		imageUrl: `https://img/${id}.png`,
		name: id,
		setId: "base1",
		setName: "Base",
		setSeries: "Base",
		cardNumber: id,
	};
}

function makeStore() {
	return create<CardsSlice>()((set, get, store) =>
		createCardsSlice(set, get, store),
	);
}

describe("cards-slice", () => {
	test("starts empty", () => {
		const s = makeStore().getState();
		expect(s.cardsCache).toEqual({});
		expect(s.cardsCacheOrder).toEqual([]);
	});

	test("page 1 seeds the entry", () => {
		const store = makeStore();
		store.getState().appendCardsPage("k", [card("a"), card("b")], 1, 5, 1000);
		const e = store.getState().cardsCache.k;
		expect(e.cards.map((c) => c.id)).toEqual(["a", "b"]);
		expect(e.page).toBe(1);
		expect(e.totalCount).toBe(5);
		expect(e.fetchedAt).toBe(1000);
	});

	test("later pages append and dedup by id", () => {
		const store = makeStore();
		store.getState().appendCardsPage("k", [card("a"), card("b")], 1, 5, 1000);
		store.getState().appendCardsPage("k", [card("b"), card("c")], 2, 5, 2000);
		const e = store.getState().cardsCache.k;
		expect(e.cards.map((c) => c.id)).toEqual(["a", "b", "c"]);
		expect(e.page).toBe(2);
	});

	test("SWR revalidate (page 1, same totalCount) keeps accumulated pages, refreshes timestamp", () => {
		const store = makeStore();
		store.getState().appendCardsPage("k", [card("a"), card("b")], 1, 5, 1000);
		store.getState().appendCardsPage("k", [card("c")], 2, 5, 1500);
		// Revalidation refetches page 1 only:
		store.getState().appendCardsPage("k", [card("a"), card("b")], 1, 5, 9000);
		const e = store.getState().cardsCache.k;
		expect(e.cards.map((c) => c.id)).toEqual(["a", "b", "c"]); // not truncated
		expect(e.fetchedAt).toBe(9000);
		expect(e.page).toBe(2);
	});

	test("page 1 with a changed totalCount resets the entry", () => {
		const store = makeStore();
		store.getState().appendCardsPage("k", [card("a"), card("b")], 1, 5, 1000);
		store.getState().appendCardsPage("k", [card("c")], 2, 5, 1500);
		store.getState().appendCardsPage("k", [card("x"), card("y")], 1, 9, 2000);
		const e = store.getState().cardsCache.k;
		expect(e.cards.map((c) => c.id)).toEqual(["x", "y"]);
		expect(e.totalCount).toBe(9);
		expect(e.page).toBe(1);
	});

	test("LRU evicts the oldest key past the 50-key cap", () => {
		const store = makeStore();
		for (let i = 0; i < 51; i++) {
			store.getState().appendCardsPage(`k${i}`, [card(`c${i}`)], 1, 1, i);
		}
		const cache = store.getState().cardsCache;
		expect(cache.k0).toBeUndefined(); // evicted
		expect(cache.k50).toBeDefined();
		expect(store.getState().cardsCacheOrder.length).toBe(50);
	});

	test("touchCardsKey moves an existing key to most-recent", () => {
		const store = makeStore();
		store.getState().appendCardsPage("a", [card("a")], 1, 1, 1);
		store.getState().appendCardsPage("b", [card("b")], 1, 1, 2);
		store.getState().touchCardsKey("a");
		expect(store.getState().cardsCacheOrder).toEqual(["b", "a"]);
	});
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test src/store/cards-slice.test.ts`
Expected: FAIL — module `./cards-slice` does not exist.

- [ ] **Step 3: Implement**

Create `src/store/cards-slice.ts`:

```ts
import type { StateCreator } from "zustand";
import type { HoloCardData } from "../components/holo-card";

// Bound IndexedDB growth: keep the 50 most-recently-used grid keys.
const MAX_CARDS_KEYS = 50;

export interface CardsCacheEntry {
	cards: HoloCardData[];
	page: number;
	totalCount: number;
	fetchedAt: number;
}

export interface CardsSlice {
	cardsCache: Record<string, CardsCacheEntry>;
	/** LRU order, most-recently-used last. */
	cardsCacheOrder: string[];
	/**
	 * Merge a fetched page into the cache.
	 * - page <= 1 + same totalCount + existing → SWR no-op: keep accumulated
	 *   cards, just refresh `fetchedAt`.
	 * - page <= 1 otherwise → (re)seed the entry from this page.
	 * - page > 1 → append, deduping by id.
	 */
	appendCardsPage: (
		key: string,
		cards: HoloCardData[],
		page: number,
		totalCount: number,
		fetchedAt: number,
	) => void;
	/** Mark a key as most-recently-used without changing its data. */
	touchCardsKey: (key: string) => void;
}

export const createCardsSlice: StateCreator<CardsSlice> = (set) => ({
	cardsCache: {},
	cardsCacheOrder: [],

	appendCardsPage: (key, cards, page, totalCount, fetchedAt) =>
		set((s) => {
			const existing = s.cardsCache[key];

			let entry: CardsCacheEntry;
			if (page <= 1 && existing && existing.totalCount === totalCount) {
				// SWR revalidate, nothing changed upstream → preserve loaded pages.
				entry = { ...existing, fetchedAt };
			} else if (page <= 1) {
				// Fresh load or totalCount changed → reseed from page 1.
				const seen = new Set<string>();
				const deduped = cards.filter(
					(c) => !seen.has(c.id) && seen.add(c.id),
				);
				entry = { cards: deduped, page: 1, totalCount, fetchedAt };
			} else {
				const base = existing ?? {
					cards: [],
					page: 0,
					totalCount,
					fetchedAt,
				};
				const seen = new Set(base.cards.map((c) => c.id));
				const deduped = cards.filter((c) => !seen.has(c.id));
				entry = {
					cards: [...base.cards, ...deduped],
					page: Math.max(base.page, page),
					totalCount,
					fetchedAt,
				};
			}

			const order = [...s.cardsCacheOrder.filter((k) => k !== key), key];
			const cache = { ...s.cardsCache, [key]: entry };
			while (order.length > MAX_CARDS_KEYS) {
				const evicted = order.shift();
				if (evicted) delete cache[evicted];
			}
			return { cardsCache: cache, cardsCacheOrder: order };
		}),

	touchCardsKey: (key) =>
		set((s) => {
			if (!s.cardsCache[key]) return {};
			return {
				cardsCacheOrder: [
					...s.cardsCacheOrder.filter((k) => k !== key),
					key,
				],
			};
		}),
});
```

> Note: `seen.add(c.id)` returns the Set (truthy), so `!seen.has(id) && seen.add(id)` keeps the first occurrence and records it in one pass.

- [ ] **Step 4: Run to verify pass**

Run: `bun test src/store/cards-slice.test.ts`
Expected: PASS (all 8).

- [ ] **Step 5: Commit**

```bash
git add src/store/cards-slice.ts src/store/cards-slice.test.ts
git commit -m "feat(store): persisted grid-page cache slice (dedup, SWR merge, LRU)"
```

---

## Task 7: Compose `cards-slice` into the store + persist it

**Files:**
- Modify: `src/store/index.ts`
- Test: `src/store/index.test.ts` *(new)*

- [ ] **Step 1: Write the failing test**

Create `src/store/index.test.ts`:

```ts
import { expect, test } from "bun:test";
import { useStore } from "./index";

test("store exposes the cards-cache slice", () => {
	const s = useStore.getState();
	expect(s.cardsCache).toBeDefined();
	expect(s.cardsCacheOrder).toBeDefined();
	expect(typeof s.appendCardsPage).toBe("function");
	expect(typeof s.touchCardsKey).toBe("function");
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test src/store/index.test.ts`
Expected: FAIL — `cardsCache`/`appendCardsPage` undefined.

- [ ] **Step 3: Implement**

In `src/store/index.ts`:

Add the import:

```ts
import { type CardsSlice, createCardsSlice } from "./cards-slice";
```

Extend the store type:

```ts
type AppStore = ApiCacheSlice & CollectionSlice & PackCardsSlice & CardsSlice;
```

Add the two fields to the `PersistedStore` interface (after `packCardsFetchedAt`):

```ts
	cardsCache: CardsSlice["cardsCache"];
	cardsCacheOrder: string[];
```

Compose the slice:

```ts
const composed: StateCreator<AppStore> = (set, get, store) => ({
	...createApiCacheSlice(set, get, store),
	...createCollectionSlice(set, get, store),
	...createPackCardsSlice(set, get, store),
	...createCardsSlice(set, get, store),
});
```

Bump the version constant:

```ts
const STORAGE_VERSION = 6;
```

Add both fields to `partialize` (after the `packCards*` lines):

```ts
			cardsCache: state.cardsCache,
			cardsCacheOrder: state.cardsCacheOrder,
```

Add a migration branch in `migrate` (before `return next as AppStore;`):

```ts
			if (version < 6)
				next = { ...next, cardsCache: {}, cardsCacheOrder: [] };
```

- [ ] **Step 4: Run to verify pass**

Run: `bun test src/store/index.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/store/index.ts src/store/index.test.ts
git commit -m "feat(store): persist grid-page cache to IndexedDB (v6 migration)"
```

---

## Task 8: `use-cards` reads/writes the persisted slice with SWR

**Files:**
- Modify: `src/hooks/use-cards.ts`
- Test: `src/hooks/use-cards.test.tsx` *(new)*

- [ ] **Step 1: Write the failing tests**

Create `src/hooks/use-cards.test.tsx`:

```ts
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { HoloCardData } from "../components/holo-card";
import { useStore } from "../store";
import { type CardFetcher, useCards } from "./use-cards";

function card(id: string): HoloCardData {
	return {
		id,
		imageUrl: `https://img/${id}.png`,
		name: id,
		setId: "base1",
		setName: "Base",
		setSeries: "Base",
		cardNumber: id,
	};
}

beforeEach(() => {
	useStore.setState({ cardsCache: {}, cardsCacheOrder: [] });
});
afterEach(() => {
	useStore.setState({ cardsCache: {}, cardsCacheOrder: [] });
});

describe("useCards", () => {
	test("loads page 1 on first selection", async () => {
		const fetcher: CardFetcher = mock(async () => ({
			cards: [card("a"), card("b")],
			totalCount: 2,
		}));
		const { result } = renderHook(() => useCards("base1", fetcher));
		await waitFor(() => expect(result.current.cards.length).toBe(2));
		expect(fetcher).toHaveBeenCalledTimes(1);
		expect(result.current.hasMore).toBe(false);
	});

	test("does not refetch when the cached entry is fresh", async () => {
		useStore.setState({
			cardsCache: {
				base1: {
					cards: [card("a")],
					page: 1,
					totalCount: 1,
					fetchedAt: Date.now(),
				},
			},
			cardsCacheOrder: ["base1"],
		});
		const fetcher: CardFetcher = mock(async () => ({ cards: [], totalCount: 0 }));
		const { result } = renderHook(() => useCards("base1", fetcher));
		await waitFor(() => expect(result.current.cards.length).toBe(1));
		expect(fetcher).not.toHaveBeenCalled();
	});

	test("revalidates in the background when the cached entry is stale", async () => {
		useStore.setState({
			cardsCache: {
				base1: {
					cards: [card("a")],
					page: 1,
					totalCount: 1,
					fetchedAt: Date.now() - 48 * 60 * 60 * 1000,
				},
			},
			cardsCacheOrder: ["base1"],
		});
		const fetcher: CardFetcher = mock(async () => ({
			cards: [card("a")],
			totalCount: 1,
		}));
		renderHook(() => useCards("base1", fetcher));
		await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
	});
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test src/hooks/use-cards.test.tsx`
Expected: FAIL — current `useCards` keeps its own in-memory cache and won't read `useStore`'s seeded entry / SWR behavior.

- [ ] **Step 3: Implement (replace the file)**

Replace `src/hooks/use-cards.ts` entirely with:

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import type { HoloCardData } from "../components/holo-card";
import { useStore } from "../store";
import { shouldRefetch } from "../store/freshness";

const PAGE_SIZE = 20;
const FETCH_THROTTLE_MS = 500;
const RESIZE_SUPPRESSION_MS = 500;

export type CardFetcher = (
	key: string,
	page: number,
	pageSize: number,
) => Promise<{ cards: HoloCardData[]; totalCount: number }>;

interface UseCardsResult {
	cards: HoloCardData[];
	loading: boolean;
	loadMore: (key: string) => void;
	hasMore: boolean;
}

// Paginated card loader keyed by an arbitrary string (set id, pokédex number,
// filtered variants of those). Pages are persisted in the Zustand store
// (cards-slice) so revisits render instantly and revalidate in the background.
// This hook owns the orchestration: in-flight dedup, throttling, resize-storm
// suppression, and the stale-while-revalidate trigger.
export function useCards(
	selectedKey: string | null,
	fetcher: CardFetcher,
): UseCardsResult {
	const entry = useStore((s) =>
		selectedKey ? s.cardsCache[selectedKey] : undefined,
	);
	const appendCardsPage = useStore((s) => s.appendCardsPage);
	const touchCardsKey = useStore((s) => s.touchCardsKey);

	const [loading, setLoading] = useState(false);

	const fetcherRef = useRef(fetcher);
	useEffect(() => {
		fetcherRef.current = fetcher;
	}, [fetcher]);

	const inFlightRef = useRef<Set<string>>(new Set());
	const lastFetchAtRef = useRef<Map<string, number>>(new Map());
	const loadSuppressedUntilRef = useRef(0);

	useEffect(() => {
		const onResize = () => {
			loadSuppressedUntilRef.current = Date.now() + RESIZE_SUPPRESSION_MS;
		};
		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
	}, []);

	const fetchPage = useCallback(
		async (key: string, page: number) => {
			if (inFlightRef.current.has(key)) return;
			inFlightRef.current.add(key);
			lastFetchAtRef.current.set(key, Date.now());
			setLoading(true);
			try {
				const { cards, totalCount } = await fetcherRef.current(
					key,
					page,
					PAGE_SIZE,
				);
				appendCardsPage(key, cards, page, totalCount, Date.now());
			} catch (e) {
				console.error(e);
			} finally {
				inFlightRef.current.delete(key);
				setLoading(false);
			}
		},
		[appendCardsPage],
	);

	const loadMore = useCallback(
		(key: string) => {
			if (Date.now() < loadSuppressedUntilRef.current) return;
			const last = lastFetchAtRef.current.get(key) ?? 0;
			if (Date.now() - last < FETCH_THROTTLE_MS) return;
			const cur = useStore.getState().cardsCache[key];
			if (cur && cur.cards.length >= cur.totalCount) return;
			const nextPage = (cur?.page ?? 0) + 1;
			void fetchPage(key, nextPage);
		},
		[fetchPage],
	);

	// Initial load + stale-while-revalidate on key change.
	useEffect(() => {
		if (!selectedKey) return;
		const cur = useStore.getState().cardsCache[selectedKey];
		if (!cur) {
			void fetchPage(selectedKey, 1);
			return;
		}
		touchCardsKey(selectedKey);
		if (shouldRefetch({ lastFetchedAt: cur.fetchedAt, kind: "cards" })) {
			void fetchPage(selectedKey, 1);
		}
	}, [selectedKey, fetchPage, touchCardsKey]);

	const cards = entry?.cards ?? [];
	const hasMore = !!entry && entry.cards.length < entry.totalCount;

	return { cards, loading, loadMore, hasMore };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `bun test src/hooks/use-cards.test.tsx`
Expected: PASS (all 3).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/use-cards.ts src/hooks/use-cards.test.tsx
git commit -m "feat(use-cards): persist pages to store + stale-while-revalidate revisits"
```

---

## Task 9: Hover-prefetch card detail + warm focus image

**Files:**
- Create: `src/pages/card-prefetch.ts`
- Modify: `src/pages/card-loader.ts`
- Modify: `src/components/holo-card/holo-card.tsx` (add `onPrefetch`)
- Modify: `src/components/card-grid.tsx`, `src/components/pokemon-timeline/pokemon-timeline.tsx` (wire `onPrefetch`)
- Test: `src/pages/card-prefetch.test.ts` *(new)*

- [ ] **Step 1: Write the failing tests**

Create `src/pages/card-prefetch.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const getCardById = mock(async (id: string) => ({ id }) as never);
mock.module("../api", () => ({ getCardById }));

// Import AFTER the module mock so the module binds the mocked api.
const { prefetchCard, getPrefetched } = await import("./card-prefetch");

beforeEach(() => getCardById.mockClear());
afterEach(() => getCardById.mockClear());

describe("card-prefetch", () => {
	test("prefetchCard fetches once and dedups concurrent calls for the same id", () => {
		prefetchCard("swsh4-43");
		prefetchCard("swsh4-43");
		expect(getCardById).toHaveBeenCalledTimes(1);
	});

	test("getPrefetched returns the in-flight promise after prefetch", async () => {
		const p = prefetchCard("base1-1");
		expect(getPrefetched("base1-1")).toBe(p);
		await p;
	});

	test("getPrefetched is undefined for an unseen id", () => {
		expect(getPrefetched("never")).toBeUndefined();
	});
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test src/pages/card-prefetch.test.ts`
Expected: FAIL — module `./card-prefetch` does not exist.

- [ ] **Step 3: Implement the prefetch module**

Create `src/pages/card-prefetch.ts`:

```ts
import { type FocusCardData, getCardById } from "../api";

// Session-scoped warm cache of card-detail fetches, keyed by card id. Hover /
// focus on a grid card populates this; the card route loader consumes it so
// the click resolves with no visible network wait. Also primes the SW / edge
// cache as a side effect.
const cache = new Map<string, Promise<FocusCardData>>();
const order: string[] = [];
const MAX_PREFETCH = 100;

export function prefetchCard(id: string): Promise<FocusCardData> {
	const existing = cache.get(id);
	if (existing) return existing;

	const p = getCardById(id).catch((e) => {
		// Drop failures so a later real navigation can retry.
		cache.delete(id);
		throw e;
	});
	cache.set(id, p);
	order.push(id);
	while (order.length > MAX_PREFETCH) {
		const evicted = order.shift();
		if (evicted && evicted !== id) cache.delete(evicted);
	}
	return p;
}

export function getPrefetched(id: string): Promise<FocusCardData> | undefined {
	return cache.get(id);
}

// Warm both the detail data and the large focus image for a grid card.
export function warmCard(card: { id: string; imageUrl: string }): void {
	prefetchCard(card.id).catch(() => {});
	if (typeof Image !== "undefined") {
		const img = new Image();
		img.src = card.imageUrl;
	}
}
```

- [ ] **Step 4: Wire the loader**

Replace `src/pages/card-loader.ts` with:

```ts
import type { LoaderFunctionArgs } from "react-router";
import { getCardById } from "../api";
import { getPrefetched } from "./card-prefetch";

export async function cardLoader({ params }: LoaderFunctionArgs) {
	if (!params.id) throw new Response("Missing card id", { status: 400 });
	return getPrefetched(params.id) ?? getCardById(params.id);
}
```

- [ ] **Step 5: Add `onPrefetch` to HoloCard**

In `src/components/holo-card/holo-card.tsx`:

Add to `HoloCardProps`:

```ts
	/** Fired on hover/focus — used to warm the card-detail fetch + focus image. */
	onPrefetch?: () => void;
```

Add `onPrefetch` to the destructured params (near `onClick`):

```ts
	onClick,
	onPrefetch,
```

On the root `<div …>`, add the two handlers (next to `onClick`):

```tsx
				onClick={onClick}
				onPointerEnter={onPrefetch}
				onFocus={onPrefetch}
```

- [ ] **Step 6: Wire callers**

In `src/components/card-grid.tsx`, add the import:

```ts
import { warmCard } from "../pages/card-prefetch";
```

Add the prop to its `<HoloCard …>` (near `onClick`):

```tsx
						onPrefetch={() => warmCard(card)}
```

In `src/components/pokemon-timeline/pokemon-timeline.tsx`, add the import:

```ts
import { warmCard } from "../../pages/card-prefetch";
```

Add the prop to its `<HoloCard …>` (near `onClick`):

```tsx
								onPrefetch={() => warmCard(card)}
```

- [ ] **Step 7: Run the tests + typecheck**

Run: `bun test src/pages/card-prefetch.test.ts`
Expected: PASS (3).

Run: `bun run typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/pages/card-prefetch.ts src/pages/card-prefetch.test.ts src/pages/card-loader.ts src/components/holo-card/holo-card.tsx src/components/card-grid.tsx src/components/pokemon-timeline/pokemon-timeline.tsx
git commit -m "perf(prefetch): warm card detail + focus image on hover/focus"
```

---

## Task 10: Tier 1 verification gate

**Files:** none (verification only).

- [ ] **Step 1: Run lint + typecheck + full suite (in parallel)**

Run these as one batch (independent):
- `bun run lint`
- `bun run typecheck`
- `bun test`

Expected: lint clean, typecheck clean, all tests pass. Fix any regressions (most likely: a fixture-based test that now needs `imageUrlSmall` — add it to that fixture).

- [ ] **Step 2: Build + manual preview**

Run: `bun run build && bun run preview`
Open the preview URL. Verify in DevTools:
- Network: grid requests load the `*_small`/`/small` images, not the large ones; focus view loads the large image.
- Scrolling a long set: off-screen images are not requested until near the viewport.
- Revisit a set already viewed (navigate away and back): cards render before any network request; a single background revalidation may fire.
- Hover a card, then click: the detail page shows immediately.

- [ ] **Step 3: Commit any fixup**

```bash
git add -A
git commit -m "test: tier 1 verification fixups"
```

---

# PHASE / TIER 2 — Cloudflare Worker API proxy

## Task 11: Worker — proxy + edge SWR + CORS + key injection

**Files:**
- Create: `worker/src/index.ts`
- Create: `worker/wrangler.toml`
- Create: `worker/tsconfig.json`
- Test: `worker/src/index.test.ts`
- Modify: `package.json` (add `@cloudflare/workers-types` devDep + worker scripts)

- [ ] **Step 1: Add the Worker types dependency**

Run: `bun add -d @cloudflare/workers-types`

- [ ] **Step 2: Write the failing tests**

Create `worker/src/index.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import worker from "./index";

const realFetch = globalThis.fetch;
// @ts-expect-error — caches may be undefined outside the Workers runtime.
const realCaches = globalThis.caches;

interface FakeCache {
	match: (req: Request) => Promise<Response | undefined>;
	put: (req: Request, res: Response) => Promise<void>;
}

function installFakeCaches(): Map<string, Response> {
	const store = new Map<string, Response>();
	const cache: FakeCache = {
		async match(req) {
			const hit = store.get(new Request(req).url);
			return hit ? hit.clone() : undefined;
		},
		async put(req, res) {
			store.set(new Request(req).url, res.clone());
		},
	};
	// @ts-expect-error — minimal Cache stand-in for tests.
	globalThis.caches = { default: cache };
	return store;
}

const ctx = { waitUntil: (_p: Promise<unknown>) => {}, passThroughOnException: () => {} };
const env = { POKEMONTCG_API_KEY: "secret", ALLOW_ORIGIN: "https://x.github.io" };

beforeEach(() => {
	installFakeCaches();
});
afterEach(() => {
	globalThis.fetch = realFetch;
	// @ts-expect-error — restore (or clear) the caches global.
	globalThis.caches = realCaches;
});

describe("worker", () => {
	test("injects the API key into the origin request and adds CORS", async () => {
		const fetchMock = mock(
			async () => new Response(JSON.stringify({ data: [] }), { status: 200 }),
		);
		globalThis.fetch = fetchMock as typeof fetch;

		const res = await worker.fetch(
			new Request("https://proxy.test/v2/cards?q=name:pikachu"),
			env,
			ctx,
		);
		expect(res.status).toBe(200);
		expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
			"https://x.github.io",
		);
		const callInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
		const headers = new Headers(callInit.headers);
		expect(headers.get("X-Api-Key")).toBe("secret");
	});

	test("OPTIONS preflight returns 204 with CORS", async () => {
		const res = await worker.fetch(
			new Request("https://proxy.test/v2/cards", { method: "OPTIONS" }),
			env,
			ctx,
		);
		expect(res.status).toBe(204);
		expect(res.headers.get("Access-Control-Allow-Methods")).toContain("GET");
	});

	test("non-GET is rejected", async () => {
		const res = await worker.fetch(
			new Request("https://proxy.test/v2/cards", { method: "POST" }),
			env,
			ctx,
		);
		expect(res.status).toBe(405);
	});

	test("non-/v2 paths 404", async () => {
		globalThis.fetch = mock(async () => new Response("x")) as typeof fetch;
		const res = await worker.fetch(
			new Request("https://proxy.test/secret"),
			env,
			ctx,
		);
		expect(res.status).toBe(404);
	});

	test("serves from cache on the second identical request", async () => {
		const fetchMock = mock(
			async () => new Response(JSON.stringify({ data: [1] }), { status: 200 }),
		);
		globalThis.fetch = fetchMock as typeof fetch;
		const url = "https://proxy.test/v2/cards?q=a";
		await worker.fetch(new Request(url), env, ctx);
		await worker.fetch(new Request(url), env, ctx);
		// First miss fetches origin; second hit is served from cache (the SWR
		// background refresh runs via ctx.waitUntil, which we no-op here).
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});
```

- [ ] **Step 3: Run to verify failure**

Run: `bun test worker/src/index.test.ts`
Expected: FAIL — `worker/src/index.ts` does not exist.

- [ ] **Step 4: Implement the Worker**

Create `worker/src/index.ts`:

```ts
export interface Env {
	POKEMONTCG_API_KEY: string;
	/** Allowed browser origin for CORS; defaults to "*". */
	ALLOW_ORIGIN?: string;
}

const ORIGIN = "https://api.pokemontcg.io";

function corsHeaders(env: Env): Record<string, string> {
	return {
		"Access-Control-Allow-Origin": env.ALLOW_ORIGIN ?? "*",
		"Access-Control-Allow-Methods": "GET,OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type",
	};
}

function withCors(res: Response, env: Env): Response {
	const out = new Response(res.body, res);
	for (const [k, v] of Object.entries(corsHeaders(env))) {
		out.headers.set(k, v);
	}
	return out;
}

function fetchOrigin(url: URL, env: Env): Promise<Response> {
	return fetch(ORIGIN + url.pathname + url.search, {
		headers: { "X-Api-Key": env.POKEMONTCG_API_KEY },
	});
}

// Add shared-cache SWR directives to the stored copy. The edge serves the
// cached body immediately and refreshes it in the background.
function cacheable(res: Response): Response {
	const out = new Response(res.clone().body, res);
	out.headers.set(
		"Cache-Control",
		"s-maxage=3600, stale-while-revalidate=86400",
	);
	return out;
}

export default {
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext,
	): Promise<Response> {
		if (request.method === "OPTIONS") {
			return new Response(null, { status: 204, headers: corsHeaders(env) });
		}
		if (request.method !== "GET") {
			return new Response("Method Not Allowed", {
				status: 405,
				headers: corsHeaders(env),
			});
		}

		const url = new URL(request.url);
		if (!url.pathname.startsWith("/v2/")) {
			return new Response("Not Found", {
				status: 404,
				headers: corsHeaders(env),
			});
		}

		// Stable cache key: sort query params so equivalent requests collide.
		url.searchParams.sort();
		const cache = caches.default;
		const cacheKey = new Request(url.toString(), { method: "GET" });

		const cached = await cache.match(cacheKey);
		if (cached) {
			ctx.waitUntil(
				fetchOrigin(url, env).then((fresh) =>
					fresh.ok ? cache.put(cacheKey, cacheable(fresh)) : undefined,
				),
			);
			return withCors(cached, env);
		}

		const fresh = await fetchOrigin(url, env);
		if (fresh.ok) ctx.waitUntil(cache.put(cacheKey, cacheable(fresh)));
		return withCors(fresh, env);
	},
};
```

Create `worker/wrangler.toml`:

```toml
name = "pokemon-tcg-proxy"
main = "src/index.ts"
compatibility_date = "2024-11-01"

# Set the browser origin allowed to call this proxy (your Pages URL):
#   wrangler deploy --var ALLOW_ORIGIN:https://<user>.github.io
# Set the API key as a secret (never commit it):
#   wrangler secret put POKEMONTCG_API_KEY
[vars]
ALLOW_ORIGIN = "*"
```

Create `worker/tsconfig.json` (kept separate so the root `tsc -b` doesn't pull Worker globals):

```json
{
	"compilerOptions": {
		"target": "es2022",
		"module": "esnext",
		"moduleResolution": "bundler",
		"types": ["@cloudflare/workers-types"],
		"strict": true,
		"skipLibCheck": true,
		"noEmit": true,
		"verbatimModuleSyntax": true
	},
	"include": ["src"]
}
```

Add scripts to `package.json` (`scripts` block):

```json
		"typecheck:worker": "tsc -p worker/tsconfig.json",
		"deploy:worker": "cd worker && wrangler deploy"
```

- [ ] **Step 5: Run to verify pass**

Run: `bun test worker/src/index.test.ts`
Expected: PASS (5).

Run: `bun run typecheck:worker`
Expected: no errors. (Requires `wrangler`/types installed; if `tsc` isn't found for the worker, `bunx tsc -p worker/tsconfig.json`.)

- [ ] **Step 6: Commit**

```bash
git add worker package.json bun.lock
git commit -m "feat(worker): Cloudflare edge proxy for pokemontcg API (SWR + CORS + server-side key)"
```

---

## Task 12: Client points at the proxy + drops the bundled key

**Files:**
- Modify: `src/api.ts`
- Modify: `vite.config.ts`
- Create: `.env.example`
- Test: `src/api.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `src/api.test.ts`:

```ts
test("getSets calls the v2 sets endpoint and sends no API key header", async () => {
	const fetchMock = mock(
		async () => new Response(JSON.stringify({ data: [] }), { status: 200 }),
	);
	globalThis.fetch = fetchMock as typeof fetch;

	const { getSets } = await import("./api");
	await getSets();

	const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
	expect(calledUrl).toContain("/v2/sets");
	const headers = new Headers(init?.headers);
	expect(headers.has("X-Api-Key")).toBe(false);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test src/api.test.ts`
Expected: FAIL — current `pokemontcgFetch` sets `X-Api-Key` when the env var is present (and even without the proxy the test asserts no key header).

- [ ] **Step 3: Implement**

In `src/api.ts`, replace the key constant + `pokemontcgFetch` (lines ~7–18) with a base-URL switch and a header-free fetch:

```ts
// Requests go through VITE_API_BASE (the Cloudflare Worker proxy) when set,
// which injects the API key server-side and adds an edge cache. Falls back to
// the public origin (anonymous rate limit) for local dev without the proxy.
const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(
	/\/$/,
	"",
) ?? "https://api.pokemontcg.io";

function pokemontcgFetch(path: string, init?: RequestInit) {
	return fetch(`${API_BASE}${path}`, init);
}
```

Update each call site to pass a **path** instead of a full URL:

- `getSets`:
  ```ts
	const resp = await pokemontcgFetch(
		"/v2/sets?orderBy=releaseDate&select=id,name,series,releaseDate,total,images&pageSize=250",
	);
  ```
- `getCardsByQuery`:
  ```ts
	const resp = await pokemontcgFetch(
		`/v2/cards?select=id,name,number,images,rarity,subtypes,supertype,set,nationalPokedexNumbers,tcgplayer&orderBy=${orderBy}&q=${encodeURIComponent(query)}&page=${page}&pageSize=${pageSize}`,
	);
  ```
- `getStringList`:
  ```ts
	const resp = await pokemontcgFetch(`/v2/${endpoint}`);
  ```
- `getCardById`:
  ```ts
	const resp = await pokemontcgFetch(`/v2/cards/${id}`);
  ```

Remove the now-unused `Headers` construction and the `POKEMONTCG_API_KEY` reference (the old `import.meta.env.VITE_POKEMONTCG_API_KEY` block is deleted).

In `vite.config.ts`, change the API runtime-cache `urlPattern` from the host regex to a path matcher (so it matches both the proxy host and the public origin):

```ts
				{
					urlPattern: ({ url }) => url.pathname.startsWith("/v2/"),
					handler: "StaleWhileRevalidate",
					options: {
						cacheName: "pokemontcg-api",
						expiration: { maxEntries: 200, maxAgeSeconds: SEVEN_DAYS },
					},
				},
```

Create `.env.example`:

```
# Cloudflare Worker proxy base URL (no trailing slash). When unset, the app
# calls api.pokemontcg.io directly at the anonymous rate limit.
VITE_API_BASE=https://pokemon-tcg-proxy.<your-subdomain>.workers.dev
```

- [ ] **Step 4: Run to verify pass + typecheck**

Run: `bun test src/api.test.ts`
Expected: PASS.

Run: `bun run typecheck`
Expected: no errors (the `VITE_POKEMONTCG_API_KEY` reference is gone).

- [ ] **Step 5: Commit**

```bash
git add src/api.ts src/api.test.ts vite.config.ts .env.example
git commit -m "feat(api): route through VITE_API_BASE proxy; remove client API key"
```

---

## Task 13: README — deploy + key-rotation docs

**Files:**
- Modify: `README.md`

No test (docs).

- [ ] **Step 1: Add a "Latency / API proxy" section to `README.md`**

Append:

```markdown
## API proxy (Cloudflare Worker)

The app calls the Pokémon TCG API through a Cloudflare Worker that adds an edge
cache (stale-while-revalidate) and injects the API key server-side.

### Deploy

```bash
cd worker
bunx wrangler secret put POKEMONTCG_API_KEY   # paste your key
bunx wrangler deploy --var ALLOW_ORIGIN:https://<user>.github.io
```

Then set `VITE_API_BASE` (see `.env.example`) to the deployed
`https://pokemon-tcg-proxy.<subdomain>.workers.dev` URL and rebuild.

### Security note — rotate the key

Earlier builds inlined `VITE_POKEMONTCG_API_KEY` into the public JS bundle.
After moving the key into the Worker secret, **rotate the old key** in the
pokemontcg.io developer dashboard so the previously-exposed value is dead.
The client no longer sends any API key.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: Cloudflare Worker deploy + API key rotation note"
```

---

# PHASE / TIER 3 — wsrv.nl image CDN

## Task 14: `cdnImage` URL builder

**Files:**
- Create: `src/components/holo-card/cdn-image.ts`
- Test: `src/components/holo-card/cdn-image.test.ts` *(new)*

- [ ] **Step 1: Write the failing tests**

Create `src/components/holo-card/cdn-image.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { cdnImage } from "./cdn-image";

describe("cdnImage", () => {
	test("builds a wsrv URL with width, webp output, no-enlarge", () => {
		const out = cdnImage("https://images.pokemontcg.io/swsh4/43_hires.png", {
			w: 300,
		});
		expect(out.startsWith("https://wsrv.nl/?url=")).toBe(true);
		expect(out).toContain(
			encodeURIComponent("https://images.pokemontcg.io/swsh4/43_hires.png"),
		);
		expect(out).toContain("w=300");
		expect(out).toContain("output=webp");
		expect(out).toContain("we");
	});

	test("adds dpr only when > 1", () => {
		expect(cdnImage("https://img/x.png", { w: 300 })).not.toContain("dpr=");
		expect(cdnImage("https://img/x.png", { w: 300, dpr: 2 })).toContain(
			"dpr=2",
		);
	});
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test src/components/holo-card/cdn-image.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

Create `src/components/holo-card/cdn-image.ts`:

```ts
// Build a wsrv.nl image-CDN URL that resizes + re-encodes to WebP on the fly.
// Free, no signup. `we` = "without enlargement" (never upscale past source).
const CDN = "https://wsrv.nl/";

export function cdnImage(
	rawUrl: string,
	opts: { w: number; dpr?: number },
): string {
	const params = new URLSearchParams({
		url: rawUrl,
		w: String(opts.w),
		output: "webp",
	});
	if (opts.dpr && opts.dpr > 1) params.set("dpr", String(opts.dpr));
	// `we` is a valueless flag; URLSearchParams can't emit a bare key, so append.
	return `${CDN}?${params.toString()}&we`;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `bun test src/components/holo-card/cdn-image.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/holo-card/cdn-image.ts src/components/holo-card/cdn-image.test.ts
git commit -m "feat(holo-card): wsrv.nl CDN URL builder (resize + WebP)"
```

---

## Task 15: HoloCard `<picture>` — CDN WebP source, direct-image fallback

**Files:**
- Modify: `src/components/holo-card/holo-card.tsx`
- Test: `src/components/holo-card/holo-card.test.tsx` (append)

- [ ] **Step 1: Write the failing tests**

Append to `src/components/holo-card/holo-card.test.tsx`:

```ts
test("renders a WebP CDN source plus a direct fallback img (grid)", () => {
	const { container } = render(
		<HoloCard
			imageUrl="https://images.pokemontcg.io/swsh4/43_hires.png"
			imageUrlSmall="https://images.pokemontcg.io/swsh4/43.png"
			name="Pikachu"
			size="grid"
		/>,
	);
	const source = container.querySelector("source") as HTMLSourceElement;
	expect(source.getAttribute("type")).toBe("image/webp");
	expect(source.getAttribute("srcset")).toContain("wsrv.nl");
	expect(source.getAttribute("srcset")).toContain("2x");
	// Fallback img keeps the small direct URL for grids.
	const img = container.querySelector("img.holo-card-image") as HTMLImageElement;
	expect(img.getAttribute("src")).toBe(
		"https://images.pokemontcg.io/swsh4/43.png",
	);
});

test("focus picture sources the large image", () => {
	const { container } = render(
		<HoloCard
			imageUrl="https://images.pokemontcg.io/swsh4/43_hires.png"
			name="Pikachu"
			size="focus"
		/>,
	);
	const source = container.querySelector("source") as HTMLSourceElement;
	expect(source.getAttribute("srcset")).toContain(
		encodeURIComponent("https://images.pokemontcg.io/swsh4/43_hires.png"),
	);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun test src/components/holo-card/holo-card.test.tsx`
Expected: FAIL — there is no `<source>` element yet.

- [ ] **Step 3: Implement**

In `src/components/holo-card/holo-card.tsx`:

Add the import:

```ts
import { cdnImage } from "./cdn-image";
```

Replace the `<img …>` block from Task 2 with a `<picture>` wrapper. The CDN
source always downsamples the **large** image (`imageUrl`) for best quality;
the fallback `<img>` keeps the direct small (grid) / large (focus) URL:

```tsx
			{(() => {
				const width = size === "focus" ? 734 : 300;
				const fallbackSrc =
					size === "focus" ? imageUrl : (imageUrlSmall ?? imageUrl);
				return (
					<picture>
						<source
							type="image/webp"
							srcSet={`${cdnImage(imageUrl, { w: width })} 1x, ${cdnImage(imageUrl, { w: width, dpr: 2 })} 2x`}
						/>
						<img
							className="holo-card-image"
							src={fallbackSrc}
							alt=""
							loading={size === "focus" ? "eager" : "lazy"}
							decoding={size === "focus" ? "auto" : "async"}
							fetchPriority={size === "focus" ? "high" : "auto"}
						/>
					</picture>
				);
			})()}
```

> The `<img>` keeps `className="holo-card-image"`, so all holo / tilt CSS that
> targets `.holo-card-image` is unaffected. If wsrv is unreachable, the browser
> automatically uses the `<img>` fallback.

- [ ] **Step 4: Run to verify pass**

Run: `bun test src/components/holo-card/holo-card.test.tsx`
Expected: PASS (all, including Task 2's src/loading assertions on the fallback `<img>`).

- [ ] **Step 5: Commit**

```bash
git add src/components/holo-card/holo-card.tsx src/components/holo-card/holo-card.test.tsx
git commit -m "perf(holo-card): WebP via wsrv <picture> with direct-image fallback"
```

---

## Task 16: Workbox runtime-cache for wsrv

**Files:**
- Modify: `vite.config.ts`

- [ ] **Step 1: Add a wsrv entry to `runtimeCaching`**

In `vite.config.ts`, add to the `runtimeCaching` array (alongside the existing images entry):

```ts
				{
					urlPattern: ({ url }) => url.hostname === "wsrv.nl",
					handler: "CacheFirst",
					options: {
						cacheName: "wsrv-images",
						expiration: { maxEntries: 500, maxAgeSeconds: THIRTY_DAYS },
					},
				},
```

- [ ] **Step 2: Verify the build**

Run: `bun run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add vite.config.ts
git commit -m "perf(pwa): cache wsrv.nl CDN images in the service worker"
```

---

## Task 17: Final verification gate

**Files:** none (verification only).

- [ ] **Step 1: Lint + typecheck + full suite (parallel batch)**

- `bun run lint`
- `bun run typecheck`
- `bun run typecheck:worker`
- `bun test`

Expected: all clean/green. Fix any fixture or type fallout inline.

- [ ] **Step 2: Build + manual preview matrix**

Run: `bun run build && bun run preview`. Verify in DevTools:
- Network: grid + focus images load as `image/webp` from `wsrv.nl` at the requested width.
- Block `wsrv.nl` (DevTools → Network → block request domain), reload: images fall back to direct `images.pokemontcg.io` with no broken images.
- API calls hit `VITE_API_BASE` (the Worker) when configured; responses carry `Cache-Control: s-maxage…`.
- `grep -r "VITE_POKEMONTCG_API_KEY\|X-Api-Key" dist` → no API key string in the built bundle.
- Second load of any view is served from the service worker.

- [ ] **Step 3: Commit any fixup + finish the branch**

```bash
git add -A
git commit -m "test: final verification fixups for latency overhaul"
```

Then follow `superpowers:finishing-a-development-branch` to merge.

---

## Self-Review notes

- **Spec coverage:** Tier 1 §1a→Tasks 1–3; §1b→Task 2; §1c→Task 4; §1d→Tasks 5–8; §1e→Task 9. Tier 2 Worker→Task 11; client wiring + key removal→Task 12; security/rotation→Task 13. Tier 3 helper→Task 14; `<picture>`→Task 15; Workbox→Task 16. Verification gates→Tasks 10, 17.
- **Deviation from spec:** `imageUrlSmall` is **optional** (`?`) on `HoloCardData` rather than required — avoids churning every existing fixture and gives a clean `?? imageUrl` fallback for legacy persisted/owned cards. Behavior matches the spec's intent.
- **Type consistency:** slice actions `appendCardsPage(key, cards, page, totalCount, fetchedAt)` and `touchCardsKey(key)` are used identically in `cards-slice.ts`, `use-cards.ts`, and tests. `CardsCacheEntry` shape (`cards/page/totalCount/fetchedAt`) is consistent across slice, hook, and the seeded test state. Worker default export shape `{ fetch(request, env, ctx) }` matches the test's `worker.fetch(...)` calls.
- **No placeholders:** every code step contains complete code; every test step has real assertions; every run step has an exact command + expected outcome.
