# TanStack Start Migration — Plan 06: Real Home Page

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the scaffold home placeholder with the real landing page — an SSR hero (logo, title, search form, popular-Pokémon chips) that is crawlable and works without JS, plus a client-only "recents" island (recent searches + recently viewed) reading the localStorage recents store. Wire recently-viewed capture on the card route.

**Architecture:** The hero is plain SSR HTML with a real `<form action="/search" method="get">` (progressive enhancement — search works with JS off; TanStack intercepts for client nav when on). Popular chips are `<Link>`s to `/search?q=`. The recents block is a `<ClientOnly>` island (localStorage has no server value). Viewing a card records it to the recents store via an effect on the `$card` route.

**Tech Stack:** TanStack `createFileRoute` + `Link`; `ClientOnly`; existing `useRecentsStore` (SSR-safe since Plan 05); `HoloCardIsland`; Bun test. Design reference: the legacy `src/pages/home.tsx` (do NOT import it — it's deleted in Plan 07).

---

## Assumptions (delegate-mode decisions — review)

1. **Search = native GET form.** The hero search posts to `/search` via `method="get"` with `<input name="q">`. No JS required (SEO + resilience); TanStack handles it as client nav when hydrated. Replaces the old `SearchInput` autocomplete (which depended on the corpus + url-selection hooks). A corpus-backed autocomplete island can come later — not in scope.
2. **Popular chips → `/search?q=Name`** (matches the old behavior of seeding the query), not `/pokemon/{name}`. Simpler + consistent with the search form.
3. **Recently-viewed cards link to `/search?q={name}`** — the card object in the recents store carries no series/set *slugs* (only ids), so resolving a direct card-page link client-side would need a fetch. Linking to search is robust and slug-free. (A slug-carrying recents entry is a possible later refinement.)
4. **Recently-viewed capture is wired on the `$card` route** via a client effect calling `addRecentlyViewed`. The new card modal/page didn't record views (Plan 05 gap); this closes it.
5. **`logo-64.png`** is served from `public/` at domain root (`/logo-64.png`) — no `BASE_URL` prefix (the SPA base path is gone).

---

## File structure

- `src/components/islands/home-recents.tsx` — `ClientOnly` recents island (searches + viewed).
- `src/routes/index.tsx` — **replace** placeholder with the real home (hero + form + chips + recents island).
- `src/routes/index.test.tsx` — **update** (placeholder text → real home assertions).
- `src/routes/$series/$set/$card.tsx` — **modify**: record recently-viewed on view.

---

### Task 1: Recents island

**Files:**
- Create: `src/components/islands/home-recents.tsx`
- Test: `src/components/islands/home-recents.test.tsx`

- [ ] **Step 1: Write a render test.** With an empty recents store (default), the island renders nothing visible (or a stable empty state). Since `bun test`/happy-dom treats `ClientOnly` as hydrated, assert the empty-state path renders without throwing.

```tsx
import { render } from "@testing-library/react";
import { expect, test } from "bun:test";
import { HomeRecents } from "./home-recents";

test("HomeRecents renders nothing when there are no recents", () => {
	const { container } = render(<HomeRecents />);
	// Empty store → no sections. Component must not throw and renders empty.
	expect(container.querySelectorAll("section").length).toBe(0);
});
```

- [ ] **Step 2: Run, verify FAIL** — `bun test src/components/islands/home-recents.test.tsx`

- [ ] **Step 3: Implement `src/components/islands/home-recents.tsx`**

```tsx
import { ClientOnly, Link } from "@tanstack/react-router";
import { HoloCardIsland } from "./holo-card-island";
import { useRecentsStore } from "../../store/recents";

function RecentsInner() {
	const recentSearches = useRecentsStore((s) => s.recentSearches);
	const recentlyViewed = useRecentsStore((s) => s.recentlyViewed);
	const clearRecentSearches = useRecentsStore((s) => s.clearRecentSearches);

	if (recentSearches.length === 0 && recentlyViewed.length === 0) return null;

	return (
		<div className="space-y-5 border-t border-border py-6">
			{recentSearches.length > 0 && (
				<section>
					<div className="mb-2 flex items-center justify-between">
						<h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
							Recent searches
						</h2>
						<button
							type="button"
							onClick={clearRecentSearches}
							className="text-xs text-muted-foreground hover:text-foreground"
						>
							Clear
						</button>
					</div>
					<div className="flex flex-wrap gap-2">
						{recentSearches.map((q) => (
							<Link
								key={q}
								to="/search"
								search={{ q }}
								className="rounded-full bg-secondary px-3 py-1 text-sm text-foreground hover:bg-secondary/80"
							>
								{q}
							</Link>
						))}
					</div>
				</section>
			)}
			{recentlyViewed.length > 0 && (
				<section>
					<h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
						Recently viewed
					</h2>
					<div className="flex gap-3 overflow-x-auto pb-2">
						{recentlyViewed.map((card) => (
							<Link key={card.id} to="/search" search={{ q: card.name }} style={{ width: 96 }} className="shrink-0">
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
								/>
							</Link>
						))}
					</div>
				</section>
			)}
		</div>
	);
}

/** Client-only recents (localStorage). Renders nothing on the server. */
export function HomeRecents() {
	return (
		<ClientOnly fallback={null}>
			<RecentsInner />
		</ClientOnly>
	);
}
```

- [ ] **Step 4: Run, verify PASS** — `bun test src/components/islands/home-recents.test.tsx`

- [ ] **Step 5: Commit**

```bash
git add src/components/islands/home-recents.tsx src/components/islands/home-recents.test.tsx
git commit -m "feat(island): home recents (recent searches + recently viewed)"
```

---

### Task 2: Real home route

**Files:**
- Modify: `src/routes/index.tsx`
- Modify: `src/routes/index.test.tsx`

- [ ] **Step 1: Replace `src/routes/index.tsx`** with the real home. Keep a NAMED export for the testable hero piece.

```tsx
import { createFileRoute, Link } from "@tanstack/react-router";
import { HomeRecents } from "../components/islands/home-recents";

const POPULAR = ["Pikachu", "Charizard", "Eevee", "Mewtwo", "Gengar"];

const BACKDROP = [
	{ key: "a", cls: "rotate-[-15deg]", delay: "0s" },
	{ key: "b", cls: "rotate-[-5deg] scale-125", delay: "0.6s" },
	{ key: "c", cls: "rotate-6 scale-110", delay: "1.1s" },
	{ key: "d", cls: "rotate-15", delay: "1.6s" },
];

export function HomeHero() {
	return (
		<div className="mx-auto flex w-full max-w-2xl flex-col px-4">
			<div className="relative flex flex-col items-center overflow-hidden py-16 text-center">
				<div
					aria-hidden="true"
					className="pointer-events-none absolute inset-0 flex items-center justify-center gap-8 opacity-15"
				>
					{BACKDROP.map((c) => (
						<div
							key={c.key}
							style={{ animationDelay: c.delay }}
							className={`h-44 w-32 rounded-xl bg-[linear-gradient(115deg,#ffdb70_8%,#c680ff_34%,#63ceff_62%,#ff9ad0_88%)] shadow-[0_10px_40px_rgba(124,77,255,0.5)] animate-[float-card_6s_ease-in-out_infinite] motion-reduce:animate-none ${c.cls}`}
						/>
					))}
				</div>

				<img src="/logo-64.png" alt="" className="relative size-14" />
				<h1 className="relative mt-3 text-2xl font-bold">
					Pokémon TCG Holo Playground
				</h1>
				<p className="relative mt-1 text-sm text-muted-foreground">
					Search the catalog · admire the holo
				</p>

				{/* Native GET form: works without JS, TanStack intercepts when hydrated. */}
				<form action="/search" method="get" className="relative mt-5 w-full max-w-md">
					<input
						type="search"
						name="q"
						placeholder="Search cards by name…"
						aria-label="Search cards by name"
						className="w-full rounded-lg border border-border bg-card px-4 py-2 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary"
					/>
				</form>

				<div className="relative mt-4 flex flex-wrap justify-center gap-2">
					{POPULAR.map((name) => (
						<Link
							key={name}
							to="/search"
							search={{ q: name }}
							className="rounded-full border border-border bg-secondary px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-secondary/80"
						>
							{name}
						</Link>
					))}
				</div>
			</div>

			<HomeRecents />
		</div>
	);
}

export const Route = createFileRoute("/")({
	head: () => ({
		meta: [
			{ title: "Pokémon TCG Holo Playground — browse & admire holographic cards" },
			{
				name: "description",
				content:
					"Browse the full Pokémon Trading Card Game catalog by series and set, search any card, and view interactive holographic renders.",
			},
		],
	}),
	component: HomeHero,
});
```

- [ ] **Step 2: Update `src/routes/index.test.tsx`** to assert the real hero (the old test asserted "SSR scaffold is live").

```tsx
import { render, screen } from "@testing-library/react";
import { expect, test } from "bun:test";
import { createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { HomeHero } from "./index";

function renderInRouter(ui: React.ReactNode) {
	const rootRoute = createRootRoute({ component: () => <>{ui}</> });
	const router = createRouter({ routeTree: rootRoute });
	return render(<RouterProvider router={router} />);
}

test("HomeHero renders the title and a search input", async () => {
	renderInRouter(<HomeHero />);
	expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("Holo Playground");
	expect(screen.getByRole("searchbox", { name: /search cards/i })).toBeDefined();
});
```
Note: if `<Link>`/router mounting under `bun test` needs `await router.load()` before `render` (seen in Plan 03), apply it. If still flaky, assert on a router-free subset — but the REQUIREMENT is a test proving the hero renders the title + search input.

- [ ] **Step 3: Run the home test** — `bun test src/routes/index.test.tsx` → pass.

- [ ] **Step 4: Build + SSR-verify the hero is in the HTML + form is crawlable**

```bash
bun run build && node .output/server/index.mjs & SERVER_PID=$!
sleep 3
curl -s http://localhost:3000/ > /tmp/p6home.html
kill $SERVER_PID
grep -q 'Holo Playground' /tmp/p6home.html && echo "TITLE OK"
grep -q 'action="/search"' /tmp/p6home.html && echo "FORM OK"
grep -oE '<title>[^<]+' /tmp/p6home.html | head -1
```
Expected: TITLE OK, FORM OK, and the `<title>` is the descriptive home title (not "SSR scaffold"). Report.

- [ ] **Step 5: Commit**

```bash
git add src/routes/index.tsx src/routes/index.test.tsx
git commit -m "feat(routes): real home page (SSR hero + search form + recents island)"
```

---

### Task 3: Record recently-viewed on the card route

**Files:**
- Modify: `src/routes/$series/$set/$card.tsx`

- [ ] **Step 1: Add a client effect that records the viewed card.** The card route has the `FocusCardData` from its loader; map the fields the recents store needs (`HoloCardData`) and call `addRecentlyViewed` in a `useEffect`. The store is SSR-safe (Plan 05) and the effect only runs client-side, so no SSR/hydration impact.

In `src/routes/$series/$set/$card.tsx`, add to the component:
```tsx
// imports:
import { useEffect } from "react";
import { useRecentsStore } from "../../../store/recents";

// inside CardPage(), before the return:
	const addRecentlyViewed = useRecentsStore((s) => s.addRecentlyViewed);
	useEffect(() => {
		addRecentlyViewed({
			id: card.id,
			imageUrl: card.imageUrl,
			name: card.name,
			rarity: card.rarity,
			subtypes: card.subtypes,
			supertype: card.supertype,
			setId: card.setId,
			setName: card.setName,
			setSeries: card.setSeries,
			cardNumber: card.cardNumber,
			nationalPokedexNumbers: card.nationalPokedexNumbers,
		});
	}, [card, addRecentlyViewed]);
```
Note: `FocusCardData` may lack `imageUrlSmall`/`variants` — only pass fields it has; the recents `HoloCardData` fields not present are optional. Match `HoloCardData`'s required fields (`id`, `imageUrl`, `name`, `setId`, `setName`, `setSeries`, `cardNumber`). Confirm against `src/components/holo-card/types.ts`.

- [ ] **Step 2: Typecheck** — `bun run typecheck` → 0. Fix the object shape to satisfy `HoloCardData` if needed (don't `as any`).

- [ ] **Step 3: Build** — `bun run build` exit 0 (the effect is client-only; SSR unaffected).

- [ ] **Step 4: Commit**

```bash
git add "src/routes/\$series/\$set/\$card.tsx"
git commit -m "feat(routes): record recently-viewed when a card is opened"
```

---

### Task 4: Verification gate

- [ ] **Step 1: Full gate (parallel):** `bun run typecheck` (0), `biome check --config-path=. src` (clean), `bun test` (all pass: prior + home-recents + updated index test).
- [ ] **Step 2: Build + curl home** → HTTP 200, hero title + search form present. (Other routes unchanged by this plan.)
- [ ] **Step 3: Commit any lint autofixes** (`git add -u src/` allowed): `git commit -m "style: biome formatting for plan 06"`.

---

## Self-review

- **Spec coverage:** `map.md` `index.tsx` row (home: static shell SSR + recents island ✓). The old `home.tsx` features are preserved: hero, popular chips, recent searches, recently viewed — re-expressed SSR-safe.
- **Placeholders:** none.
- **Type consistency:** `HomeHero` named-exported (T2) + tested (T2). `HomeRecents` (T1) used by `HomeHero` (T2). Recents object in T3 matches `HoloCardData`.
- **Progressive enhancement:** the search `<form method="get">` works JS-off (real crawlable search entry), enhanced when hydrated.
- **Hydration:** recents behind `ClientOnly`; the card-view effect is client-only. No SSR mismatch.

## Carried forward

- **Plan 07:** delete legacy SPA + uninstall `react-router` (per the sever plan from the import-graph investigation).
- **Plan 08:** PWA SW under SSR, nginx, systemd, GitHub Actions self-hosted runner.
- Corpus-backed search autocomplete on the home form (later refinement).
