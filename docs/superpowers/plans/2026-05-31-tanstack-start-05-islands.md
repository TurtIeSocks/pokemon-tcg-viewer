# TanStack Start Migration — Plan 05: Interactive Islands + Hydration Safety

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the SSR pages interactive without breaking hydration: the holo card grid (Virtuoso + pointer foil), card dialog↔page parity, the collection page (IndexedDB), and the instant corpus search/filter — all as client islands layered over the crawlable SSR HTML.

**Architecture:** The SSR HTML stays the crawlable baseline. Interactivity is added two ways: (1) **whole-island** via `<ClientOnly>` for surfaces that need browser APIs and have no meaningful server render (collection contents, corpus search box, holo foil); (2) **progressive** for the set grid — SSR renders the static card list (already crawlable from Plan 03/04), and a client island swaps in the interactive Virtuoso+HoloCard grid after mount. The zustand persist store (IndexedDB) is made SSR-safe so importing it server-side does not crash.

**Tech Stack:** `@tanstack/react-router` `ClientOnly`; `@tanstack/react-start` `createClientOnlyFn`; existing `HoloCard`, `card-grid`, `corpus/*`, `collection-slice`, `recents`; Virtuoso; Bun test.

---

## Assumptions (delegate-mode decisions — review)

1. **Card UX = dialog-over-grid + canonical page.** Clicking a card in the grid opens the HoloCard in a modal over the set (old SPA feel); direct hits / crawlers get the full SSR `$card` page (Plan 04). Implemented with TanStack's modal pattern: the grid `<Link>` carries the card route; a client-only dialog reads the active card route match and renders the modal, falling through to the full page on hard load.
2. **Instant search = corpus island upgrades SSR.** `/search` and the set filters SSR from the API (crawlable), then the corpus loads on idle and the client island takes over (instant). Matches today's behavior, layered on SSR.
3. **SSR-safe store is the FIRST task** — everything else imports it. The persist store must not call `idb-keyval`/`localStorage` during server render.
4. **Holo foil = whole island.** The pointer/rAF/CDN-foil card is wrapped so it renders a plain `<img>` on the server (crawlable) and upgrades to the interactive HoloCard on the client. No hydration mismatch because the server/client-initial markup matches the plain image.
5. **Legacy SPA stays on disk** — this plan ADDS islands using the existing components; it does NOT delete `pages/`, `api.ts`, `react-router`. That cleanup is **Plan 06** (keeps this plan's diff reviewable and lets islands borrow legacy components during transition where useful).
6. **`useCards` client pagination is deferred** — the set page already SSRs the full set (Plan 03), so load-more isn't needed for sets. The corpus island handles large result sets for search. `use-cards.ts` is not ported here.

---

## File structure

- `src/store/ssr-safe.ts` — `isServer` guard + a no-op storage used during SSR. (Or inline guard in `idb-storage.ts` + `recents.ts`.)
- `src/store/idb-storage.ts` — **modify**: guard `localStorage`/`idb-keyval` access for SSR.
- `src/store/recents.ts` — **modify**: SSR-safe `createJSONStorage` (skip on server).
- `src/components/islands/client-only.tsx` — thin re-export/wrapper of `ClientOnly` with a typed fallback helper (optional convenience).
- `src/components/islands/holo-card-island.tsx` — `<ClientOnly fallback={<img/>}>` around `HoloCard`.
- `src/components/islands/set-grid-island.tsx` — interactive Virtuoso grid (client), reads loader cards.
- `src/components/islands/card-modal.tsx` — dialog-over-grid for the active `$card` child match.
- `src/components/islands/corpus-search-island.tsx` — instant search box upgrading `/search`.
- `src/routes/$series/$set/index.tsx` — **modify**: mount the grid island + `<Outlet/>` for the card modal.
- `src/routes/$series/$set/$card.tsx` — **modify**: render as modal when nested, full page when matched directly.
- `src/routes/collection.tsx` — **create**: real collection island route.
- `src/routes/search.tsx` — **modify**: add the corpus search island.
- `src/components/shell/app-toolbar.tsx` — **modify**: Collection link → TanStack route (was `<a href>`).

---

### Task 1: SSR-safe persisted stores (foundation)

**Files:**
- Modify: `src/store/idb-storage.ts`
- Modify: `src/store/recents.ts`
- Test: `src/store/idb-storage.test.ts` (extend)

- [ ] **Step 1: Add an SSR guard to the IDB storage adapter.** In `createIdbStorage`, return a no-op storage when `typeof window === "undefined"` (server) so store creation never touches `idb-keyval`/`localStorage` during SSR. At the top of `createIdbStorage`:

```ts
export function createIdbStorage<T>(): PersistStorage<T> {
	// On the server there is no IndexedDB/localStorage. Return a no-op storage so
	// importing the store during SSR can't crash; the client adapter rehydrates
	// on mount.
	if (typeof window === "undefined") {
		return {
			getItem: async () => null,
			setItem: async () => {},
			removeItem: async () => {},
		};
	}
	// ... existing implementation unchanged ...
}
```

- [ ] **Step 2: Guard the recents store storage.** In `src/store/recents.ts`, replace `storage: createJSONStorage(() => localStorage)` with an SSR-safe factory:

```ts
		storage: createJSONStorage(() =>
			typeof window === "undefined"
				? {
						getItem: () => null,
						setItem: () => {},
						removeItem: () => {},
					}
				: localStorage,
		),
```

- [ ] **Step 3: Add an SSR-safety test** to `src/store/idb-storage.test.ts` (append). It proves the adapter returns null/no-ops without a DOM. Use a guard that simulates server by checking the no-op path — since `bun test` has happy-dom (window defined), test the structure directly:

```ts
test("createIdbStorage returns a storage with the PersistStorage shape", () => {
	const s = createIdbStorage();
	expect(typeof s.getItem).toBe("function");
	expect(typeof s.setItem).toBe("function");
	expect(typeof s.removeItem).toBe("function");
});
```
(The real SSR path is exercised by the build — Step 5.)

- [ ] **Step 4: Run store tests** — `bun test src/store/idb-storage.test.ts src/store/recents.test.ts` → pass.

- [ ] **Step 5: Build + SSR-smoke the store import.** Create a throwaway route import check: ensure a route can import `useStore` without server crash. Easiest: build and curl the home page (which after Task 7 imports the store via toolbar/collection link). For now just confirm build is green:
```bash
bun run build 2>&1 | tail -5
```
Expected: exit 0 (no `localStorage is not defined` / `indexedDB is not defined` thrown during prerender).

- [ ] **Step 6: Commit**

```bash
git add src/store/idb-storage.ts src/store/recents.ts src/store/idb-storage.test.ts
git commit -m "fix(store): SSR-safe persist adapters (no IDB/localStorage on server)"
```

---

### Task 2: Holo card island

**Files:**
- Create: `src/components/islands/holo-card-island.tsx`
- Test: `src/components/islands/holo-card-island.test.tsx`

- [ ] **Step 1: Write a render test** proving the island renders an `<img>` with the card name as alt (the SSR-safe fallback path under bun/happy-dom).

```tsx
import { render, screen } from "@testing-library/react";
import { expect, test } from "bun:test";
import { HoloCardIsland } from "./holo-card-island";

test("HoloCardIsland renders an accessible image fallback", () => {
	render(
		<HoloCardIsland
			imageUrl="https://images.pokemontcg.io/swsh9/154_hires.png"
			imageUrlSmall="https://images.pokemontcg.io/swsh9/154.png"
			name="Charizard VSTAR"
		/>,
	);
	// Either the ClientOnly fallback <img> or the hydrated HoloCard <img> exposes alt text.
	expect(screen.getByAltText("Charizard VSTAR")).toBeDefined();
});
```

- [ ] **Step 2: Run, verify FAIL** — `bun test src/components/islands/holo-card-island.test.tsx`

- [ ] **Step 3: Implement `src/components/islands/holo-card-island.tsx`**

```tsx
import { ClientOnly } from "@tanstack/react-router";
import { HoloCard, type HoloCardProps } from "../holo-card";

/**
 * Server renders a plain <img> (crawlable, no hydration risk); the client
 * upgrades to the interactive pointer-reactive HoloCard after mount. The
 * fallback markup intentionally mirrors the card image so the swap is seamless.
 */
export function HoloCardIsland(props: HoloCardProps) {
	const { imageUrl, imageUrlSmall, name } = props;
	return (
		<ClientOnly
			fallback={
				<img
					src={imageUrlSmall ?? imageUrl}
					alt={name}
					loading="lazy"
					className="w-full rounded"
				/>
			}
		>
			<HoloCard {...props} />
		</ClientOnly>
	);
}
```
Note: confirm `HoloCard`'s outer element has `alt`/`aria-label={name}` — it does (`aria-label={name}` at `holo-card.tsx:113`), and its `<img>` uses `alt=""` (decorative, name is on the wrapper). To satisfy the test on the hydrated path too, the fallback `<img alt={name}>` covers SSR; under happy-dom `ClientOnly` renders the fallback. Keep the test asserting the fallback path.

- [ ] **Step 4: Run, verify PASS** — `bun test src/components/islands/holo-card-island.test.tsx`

- [ ] **Step 5: Commit**

```bash
git add src/components/islands/holo-card-island.tsx src/components/islands/holo-card-island.test.tsx
git commit -m "feat(island): holo card island (SSR img -> interactive on client)"
```

---

### Task 3: Interactive set grid island

**Files:**
- Create: `src/components/islands/set-grid-island.tsx`

- [ ] **Step 1: Implement the grid island.** Renders the cards as an interactive Virtuoso grid of `HoloCardIsland`s, each a `Link` to the card route, with a `CollectionToggle` overlay. Reads the cards (with `slug`) the set loader already provides.

```tsx
import { Link } from "@tanstack/react-router";
import { VirtuosoGrid } from "react-virtuoso";
import type { HoloCardData } from "../holo-card";
import { CollectionToggle } from "../collection-toggle";
import { HoloCardIsland } from "./holo-card-island";

export interface GridCard extends HoloCardData {
	slug: string;
}

interface SetGridIslandProps {
	series: string;
	set: string;
	cards: GridCard[];
}

/**
 * Client-side interactive grid. Mounted by the set route under <ClientOnly>, so
 * it never runs on the server (Virtuoso measures the DOM). The SSR-rendered
 * static list remains the crawlable payload; this replaces it after hydration.
 */
export function SetGridIsland({ series, set, cards }: SetGridIslandProps) {
	return (
		<VirtuosoGrid
			style={{ height: "100%" }}
			totalCount={cards.length}
			listClassName="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
			itemContent={(index) => {
				const card = cards[index];
				if (!card) return null;
				return (
					<Link
						to="/$series/$set/$card"
						params={{ series, set, card: card.slug }}
						className="block"
					>
						<HoloCardIsland
							imageUrl={card.imageUrl}
							imageUrlSmall={card.imageUrlSmall}
							name={card.name}
							rarity={card.rarity}
							subtypes={card.subtypes}
							supertype={card.supertype}
							setId={card.setId}
							series={card.setSeries}
							variants={card.variants}
							cardNumber={card.cardNumber}
							hoverOverlay={<CollectionToggle card={card} />}
						/>
					</Link>
				);
			}}
		/>
	);
}
```
Note: confirm `VirtuosoGrid` accepts `listClassName`/`itemContent` in the installed `react-virtuoso` (it does in v4). If the grid needs a definite-height flex parent to paint (project memory: "Virtuoso grid needs a definite-height flex parent"), the set route's wrapper must provide `flex-1 min-h-0`. The route change in Task 5 handles this.

- [ ] **Step 2: Typecheck** — `bun run typecheck` → exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/components/islands/set-grid-island.tsx
git commit -m "feat(island): interactive Virtuoso set grid (holo cards + collection toggle)"
```

---

### Task 4: Card modal (dialog-over-grid parity)

**Files:**
- Create: `src/components/islands/card-modal.tsx`
- Modify: `src/routes/$series/$set/$card.tsx`

- [ ] **Step 1: Make `$card` render as a modal when nested under the set, full page when matched directly.** The card route is a child of the set route, so navigating to a card while on the set page renders `$card` inside the set's `<Outlet/>`. Implement the card component to detect whether the set route is also matched (client nav) vs. a direct hit.

Modify `src/routes/$series/$set/$card.tsx`'s component to use a modal presentation that, on close, navigates back to the set:

```tsx
// add imports:
import { useNavigate } from "@tanstack/react-router";
import { CardModal } from "../../../components/card/../islands/card-modal";

// replace CardPage:
function CardPage() {
	const { card } = Route.useLoaderData();
	const params = Route.useParams();
	const navigate = useNavigate();
	return (
		<CardModal
			card={card}
			onClose={() =>
				navigate({ to: "/$series/$set", params: { series: params.series, set: params.set } })
			}
		/>
	);
}
```

- [ ] **Step 2: Implement `src/components/islands/card-modal.tsx`** — a dialog wrapping the interactive HoloCard + focus details. Use the existing `Dialog` UI primitive.

```tsx
import { ClientOnly } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { FocusCardData } from "../../server/card-mappers";
import { CardDetail } from "../card/card-detail";
import { HoloCard } from "../holo-card";

/**
 * Dialog-over-grid presentation of a card. The static CardDetail is the SSR/
 * crawlable fallback; the interactive HoloCard upgrades on the client. Closing
 * navigates back to the set grid (passed by the route).
 */
export function CardModal({ card, onClose }: { card: FocusCardData; onClose: () => void }) {
	return (
		<Dialog open onOpenChange={(o) => !o && onClose()}>
			<DialogContent className="max-w-3xl">
				<DialogTitle className="sr-only">{card.name}</DialogTitle>
				<div className="grid gap-6 md:grid-cols-[auto_1fr]">
					<ClientOnly fallback={<img src={card.imageUrl} alt={card.name} className="w-full max-w-[320px] rounded-xl" />}>
						<HoloCard
							imageUrl={card.imageUrl}
							name={card.name}
							rarity={card.rarity}
							subtypes={card.subtypes}
							supertype={card.supertype}
							setId={card.setId}
							series={card.setSeries}
							cardNumber={card.cardNumber}
							size="focus"
						/>
					</ClientOnly>
					<CardDetail card={card} />
				</div>
			</DialogContent>
		</Dialog>
	);
}
```
Note: this fixes the import path — put `CardModal` import in `$card.tsx` as `../../../components/islands/card-modal`. `CardDetail` currently renders its own `<img>` + metadata; inside the modal we show HoloCard for the image and reuse CardDetail for metadata — to avoid a duplicate image, pass a prop to CardDetail to hide its image, OR render only the metadata. SIMPLEST: split `CardDetail` into `CardMeta` (text) + keep image separate. Implementer: extract a `CardMeta` from `CardDetail` (the `<div className="min-w-0 space-y-3">` block) and use `CardMeta` in both the full page (with image) and the modal (HoloCard + CardMeta). Keep the full-page `$card` direct-hit rendering the static image+meta (no behavior change for crawlers).

- [ ] **Step 3: Build + SSR-verify the card page still renders statically for crawlers** (direct hit unchanged) AND a nested nav shows the modal. Static check:
```bash
bun run build && node .output/server/index.mjs & SERVER_PID=$!
sleep 3
curl -s http://localhost:3000/sword-shield/brilliant-stars > /tmp/p5set.html
CARD=$(grep -oE '/sword-shield/brilliant-stars/[a-z0-9-]+' /tmp/p5set.html | head -1)
curl -s -o /tmp/p5card.html -w "card_direct=%{http_code}\n" "http://localhost:3000${CARD}"
kill $SERVER_PID
grep -c 'og:image' /tmp/p5card.html
```
Expected: direct card hit still HTTP 200 with og:image (crawler path intact). Report the card URL. The modal-over-grid is a client-nav behavior (not visible to curl) — verified by typecheck + that the route renders.

- [ ] **Step 4: Commit**

```bash
git add "src/components/islands/card-modal.tsx" "src/components/card/card-detail.tsx" "src/routes/\$series/\$set/\$card.tsx"
git commit -m "feat(island): card dialog-over-grid parity (modal on nav, page on direct hit)"
```

---

### Task 5: Mount the grid island on the set page

**Files:**
- Modify: `src/routes/$series/$set/index.tsx`

- [ ] **Step 1: Render the interactive grid island after the SSR list, gated by `ClientOnly`, with the set's `<Outlet/>` for the card modal.** Replace the static `<ul>` card list in `SetPage` with: keep an SSR-only static list for crawlers inside a `<noscript>`-equivalent (or render both — static list visually hidden once island mounts). Simplest robust approach: render the static list at SSR, and the island via `<ClientOnly>` which replaces it on mount.

```tsx
// imports:
import { ClientOnly, Outlet } from "@tanstack/react-router";
import { SetGridIsland } from "../../../components/islands/set-grid-island";

// in SetPage, replace the <ul>...</ul> block with:
			<div className="min-h-0 flex-1">
				<ClientOnly
					fallback={
						<ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
							{cards.map((card) => (
								<li key={card.id} className="flex flex-col items-center gap-1">
									<img src={card.imageUrlSmall} alt={card.name} loading="lazy" className="w-full rounded" />
									<span className="text-center text-xs">{card.name}</span>
								</li>
							))}
						</ul>
					}
				>
					<SetGridIsland series={params.series} set={params.set} cards={cards} />
				</ClientOnly>
			</div>
			<Outlet />
```
Add `const params = Route.useParams();` to `SetPage` if not already present (Plan 04 added it). The `cards` already carry `slug` (Plan 04). Ensure the outer wrapper is `flex h-full ... flex-col` so the grid gets a definite-height flex parent (project memory).

- [ ] **Step 2: Build + SSR-verify the static fallback list is STILL in the HTML** (crawlable) — `ClientOnly` renders fallback on server:
```bash
bun run build && node .output/server/index.mjs & SERVER_PID=$!
sleep 3
curl -s http://localhost:3000/sword-shield/brilliant-stars > /tmp/p5set2.html
kill $SERVER_PID
echo "card names in SSR html: $(grep -c 'loading="lazy"' /tmp/p5set2.html)"
echo "card links: $(grep -oE '/sword-shield/brilliant-stars/[a-z0-9-]+' /tmp/p5set2.html | sort -u | wc -l)"
```
Expected: the static fallback list (many `loading="lazy"` imgs) is still SSR'd — crawlers see all cards. Report counts. (Links may now be only on the client island; the fallback list keeps names+images crawlable. If you want links crawlable too, make the fallback `<li>` wrap the same `<Link>` — preferred. Implementer: use `<Link>` in the fallback list so card links stay in SSR HTML.)

- [ ] **Step 3: Commit**

```bash
git add "src/routes/\$series/\$set/index.tsx"
git commit -m "feat(routes): mount interactive grid island over SSR card list"
```

---

### Task 6: Collection route (island)

**Files:**
- Create: `src/routes/collection.tsx`
- Modify: `src/components/shell/app-toolbar.tsx`

- [ ] **Step 1: Implement the collection route** — a `ClientOnly` island reading `owned` from the store (IndexedDB). SSR renders a neutral shell.

```tsx
import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useStore } from "../store";
import { HoloCardIsland } from "../components/islands/holo-card-island";
import { CollectionToggle } from "../components/collection-toggle";

export const Route = createFileRoute("/collection")({
	head: () => ({ meta: [{ title: "Your Collection — Pokémon TCG" }] }),
	component: CollectionPage,
});

function CollectionInner() {
	const owned = useStore((s) => s.owned);
	const cards = Object.values(owned).map((o) => o.card);
	if (cards.length === 0) {
		return <p className="py-12 text-center text-muted-foreground">Your binder is empty. Add cards from any set.</p>;
	}
	return (
		<ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
			{cards.map((card) => (
				<li key={card.id}>
					<HoloCardIsland
						imageUrl={card.imageUrl}
						imageUrlSmall={card.imageUrlSmall}
						name={card.name}
						rarity={card.rarity}
						subtypes={card.subtypes}
						supertype={card.supertype}
						setId={card.setId}
						series={card.setSeries}
						variants={card.variants}
						cardNumber={card.cardNumber}
						hoverOverlay={<CollectionToggle card={card} />}
					/>
				</li>
			))}
		</ul>
	);
}

function CollectionPage() {
	return (
		<div className="mx-auto w-full max-w-7xl overflow-y-auto px-4 py-5">
			<h1 className="mb-4 text-2xl font-bold">Your Collection</h1>
			<ClientOnly fallback={<p className="py-12 text-center text-muted-foreground">Loading your collection…</p>}>
				<CollectionInner />
			</ClientOnly>
		</div>
	);
}
```

- [ ] **Step 2: Point the toolbar Collection link at the route.** In `src/components/shell/app-toolbar.tsx`, change `<a href="/collection">` back to `<Link to="/collection">` (the route now exists).

- [ ] **Step 3: Build + verify** — `bun run build` exit 0; `node .output/server/index.mjs` + `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/collection` → 200 (kill server after). The owned cards are client-only; SSR shows the loading shell.

- [ ] **Step 4: Commit**

```bash
git add src/routes/collection.tsx src/components/shell/app-toolbar.tsx
git commit -m "feat(routes): collection page island (IndexedDB-backed)"
```

---

### Task 7: Corpus instant-search island on /search

**Files:**
- Create: `src/components/islands/corpus-search-island.tsx`
- Modify: `src/routes/search.tsx`

- [ ] **Step 1: Implement the search island** — loads the corpus on mount, runs instant client-side queries, falls back to the SSR results until the corpus is ready. Reuse the existing corpus runtime (`loadCorpus`, `useCorpusRuntime`, `makeCorpusFetcher` or `queryCorpus`).

```tsx
import { ClientOnly } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { HoloCardData } from "../holo-card";
import { loadCorpus, makeCorpusFetcher, useCorpusRuntime } from "../../store/corpus/corpus-runtime";

interface CorpusSearchIslandProps {
	query: string;
	ssrCards: HoloCardData[];
}

/**
 * Upgrades /search from SSR API results to instant corpus results once the
 * in-memory index has loaded. Until then it shows the SSR results (no flash of
 * empty). Client-only (corpus lives in IndexedDB + memory).
 */
function CorpusSearchInner({ query, ssrCards }: CorpusSearchIslandProps) {
	const ready = useCorpusRuntime((s) => s.index !== null);
	const [cards, setCards] = useState<HoloCardData[]>(ssrCards);

	useEffect(() => {
		void loadCorpus();
	}, []);

	useEffect(() => {
		if (!ready || !query) return;
		const fetcher = makeCorpusFetcher({ query, relevance: true });
		void fetcher(`search:${query}`, 1, 60).then((r) => setCards(r.cards));
	}, [ready, query]);

	return (
		<ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
			{cards.map((card) => (
				<li key={card.id} className="flex flex-col items-center gap-1">
					<img src={card.imageUrlSmall} alt={card.name} loading="lazy" className="w-full rounded" />
					<span className="text-center text-xs">{card.name}</span>
					<span className="text-center text-[10px] text-muted-foreground">{card.setName}</span>
				</li>
			))}
		</ul>
	);
}

export function CorpusSearchIsland(props: CorpusSearchIslandProps) {
	return (
		<ClientOnly
			fallback={
				<ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
					{props.ssrCards.map((card) => (
						<li key={card.id} className="flex flex-col items-center gap-1">
							<img src={card.imageUrlSmall} alt={card.name} loading="lazy" className="w-full rounded" />
							<span className="text-center text-xs">{card.name}</span>
						</li>
					))}
				</ul>
			}
		>
			<CorpusSearchInner {...props} />
		</ClientOnly>
	);
}
```
Note: verify `makeCorpusFetcher`'s param shape against `corpus-runtime.ts` (Plan 0 read showed `CorpusQuery` with `query`, `setId`, `dexNumber`, `filters`, `relevance`). Pass only `query` + `relevance: true` for global name search; the fetcher's `setsById` join needs the sets — if `makeCorpusFetcher` reads `useStore.getState().sets` (it does), and the SSR store is empty on first paint, the corpus join may lack set names. Acceptable: names/images come from the corpus card itself; setName join is best-effort. If setName is critical, load sets via `getNavTreeFn` data already in the root loader. Implementer: keep it simple — corpus cards have name+image; setName can be blank until sets cache populates.

- [ ] **Step 2: Mount it in `/search`.** In `src/routes/search.tsx`, replace the static result `<ul>` with `<CorpusSearchIsland query={q} ssrCards={cards} />`.

- [ ] **Step 3: Build + SSR-verify** SSR results still present (fallback) — `curl /search?q=charizard` still shows result imgs. Report count.

- [ ] **Step 4: Commit**

```bash
git add src/components/islands/corpus-search-island.tsx src/routes/search.tsx
git commit -m "feat(island): corpus instant-search upgrade on /search"
```

---

### Task 8: Verification gate

- [ ] **Step 1: Full gate (parallel):** `bun run typecheck` (0), `biome check --config-path=. src` (clean), `bun test` (all prior + new island/store tests pass).
- [ ] **Step 2: Build + crawl-safety spot check:** `bun run build` exit 0; `curl` the home, a series, a set, a card, /search, /pokemon/charizard, /collection — all HTTP 200, and the set/search HTML still contains card names+images (SSR fallback intact). Report each status.
- [ ] **Step 3: Commit any lint autofixes** (`git add -u src/` allowed here only): `git commit -m "style: biome formatting for plan 05 islands"`.

---

## Self-review

- **Spec coverage:** `map.md` islands rows — holo (T2), grid (T3+T5), dialog parity (T4), collection (T6), corpus search (T7), SSR-safety (T1, the precondition). Cross-link overlays → `/pokemon/{name}` is small; folded into Task 6/existing `CrossLinkOverlay` repoint OR deferred to Plan 06 cleanup — NOTED: if not done in T6, do it in Plan 06. `useCards` client pagination deferred (Assumption 6).
- **Placeholders:** none. The "extract CardMeta" instruction in T4 is a concrete refactor directive, not a placeholder.
- **Type consistency:** `HoloCardIsland` (T2) used by grid (T3), modal (T4), collection (T6). `GridCard` extends `HoloCardData` with `slug` (matches Plan 04's loader augmentation). `CorpusSearchIsland` props match `/search` loader output.
- **Hydration invariant:** every browser-API surface is behind `ClientOnly` (T2,4,6,7) or an SSR-guarded store (T1). SSR fallbacks mirror the crawlable content so no mismatch + no SEO regression.
- **Risk:** Virtuoso needs a definite-height flex parent (project memory) — T5 wrapper handles it. `makeCorpusFetcher` set-name join may be empty on first paint (acceptable, noted). The modal/page parity is the subtlest — T4 keeps the direct-hit page unchanged for crawlers.

## Carried forward

- **Plan 06:** delete legacy SPA (`pages/`, `root-layout.tsx`, `api.ts`, `use-url-selection.ts`, `use-sets`/`use-pokemon-list`/`use-filter-values`, `series-sidebar/`, `app-shell/toolbar.tsx`, `browse-page.tsx`), uninstall `react-router`; repoint `CrossLinkOverlay` to `/pokemon/{name}` if not done here; consider absorbing the CF Worker.
- **Plan 07:** PWA service worker under SSR, nginx server block, systemd unit, GitHub Actions self-hosted runner deploy.
