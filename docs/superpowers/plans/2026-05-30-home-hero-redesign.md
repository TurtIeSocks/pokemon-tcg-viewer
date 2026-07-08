# Home Hero Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `Home` as a centered search hero — logo, tagline, search, popular-Pokémon quick-pick chips, a drifting decorative holo-card backdrop, and a left-aligned recents area (recent searches + recently viewed) below.

**Architecture:** Single centered max-width column. Hero content centered; recents left-aligned within the same column. Backdrop is decorative CSS holo shapes animated via a `translate` keyframe (Tailwind v4 keeps `rotate`/`scale`/`translate` as independent properties, so rotation and float don't fight). Reuses `SearchInput`, `useRecentsStore`, `HoloCard`.

**Tech Stack:** React 19, React Router 7, Tailwind v4, Zustand, Bun test.

**Spec:** [docs/superpowers/specs/2026-05-30-home-hero-redesign-design.md](../specs/2026-05-30-home-hero-redesign-design.md)

## File Structure

- **Modify** `src/app.css` — add a `float-card` keyframe (animates the `translate` property).
- **Rewrite** `src/pages/home.tsx` — the hero + recents column.
- **Create** `src/pages/home.test.tsx` — minimal render guard (hero + chips render; chip click sets the query).

---

### Task 1: `float-card` keyframe

**Files:** Modify `src/app.css`

- [ ] **Step 1: Append the keyframe** at the end of `src/app.css` (top level, outside `@layer`). Animating `translate` (not `transform`) so it composes with Tailwind v4's `rotate`/`scale` utilities on the same element:

```css
@keyframes float-card {
	0%,
	100% {
		translate: 0 0;
	}
	50% {
		translate: 0 -12px;
	}
}
```

- [ ] **Step 2: Verify build compiles**

Run: `bun run build`
Expected: build succeeds (exit 0).

- [ ] **Step 3: Commit**

```bash
git add src/app.css
git commit -m "feat(home): float-card keyframe for hero backdrop"
```

---

### Task 2: Rewrite `Home`

**Files:** Rewrite `src/pages/home.tsx`

- [ ] **Step 1: Replace the file** with:

```tsx
import { useNavigate } from "react-router";
import { HoloCard } from "../components/holo-card";
import { SearchInput } from "../components/search-bar/search-input";
import { useNameQueryParam } from "../hooks/use-url-selection";
import { useStore } from "../store";
import { useRecentsStore } from "../store/recents";

const POPULAR_POKEMON = ["Pikachu", "Charizard", "Eevee", "Mewtwo", "Gengar"];

// Decorative holo cards behind the hero. Tailwind v4 keeps rotate/scale as
// their own properties, so they compose with the float-card `translate`
// animation without clobbering each other.
const BACKDROP = [
	{ transform: "rotate-[-15deg]", delay: "0s" },
	{ transform: "rotate-[-5deg] scale-125", delay: "0.6s" },
	{ transform: "rotate-6 scale-110", delay: "1.1s" },
	{ transform: "rotate-15", delay: "1.6s" },
];

export function Home() {
	const navigate = useNavigate();
	const [, setQuery] = useNameQueryParam();
	const recentSearches = useRecentsStore((s) => s.recentSearches);
	const recentlyViewed = useRecentsStore((s) => s.recentlyViewed);
	const clearRecentSearches = useRecentsStore((s) => s.clearRecentSearches);
	const owned = useStore((s) => s.owned);

	const hasRecents = recentSearches.length > 0 || recentlyViewed.length > 0;

	return (
		<div className="mx-auto flex w-full max-w-2xl flex-col px-4">
			<div className="relative flex flex-col items-center overflow-hidden py-16 text-center">
				<div
					aria-hidden="true"
					className="pointer-events-none absolute inset-0 flex items-center justify-center gap-8 opacity-15"
				>
					{BACKDROP.map((c, i) => (
						<div
							key={c.transform}
							style={{ animationDelay: c.delay }}
							className={`h-44 w-32 rounded-xl bg-[linear-gradient(115deg,#ffdb70_8%,#c680ff_34%,#63ceff_62%,#ff9ad0_88%)] shadow-[0_10px_40px_rgba(124,77,255,0.5)] animate-[float-card_6s_ease-in-out_infinite] motion-reduce:animate-none ${c.transform}`}
						/>
					))}
				</div>

				<img
					src={`${import.meta.env.BASE_URL}logo-64.png`}
					alt=""
					className="relative size-14"
				/>
				<h1 className="relative mt-3 text-2xl font-bold">
					Pokémon TCG Holo Playground
				</h1>
				<p className="relative mt-1 text-sm text-muted-foreground">
					Search the catalog · admire the holo
				</p>
				<SearchInput autoFocus className="relative mt-5 w-full max-w-md" />
				<div className="relative mt-4 flex flex-wrap justify-center gap-2">
					{POPULAR_POKEMON.map((name) => (
						<button
							key={name}
							type="button"
							onClick={() => setQuery(name)}
							className="rounded-full border border-border bg-secondary px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-secondary/80"
						>
							{name}
						</button>
					))}
				</div>
			</div>

			{hasRecents && (
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
									<button
										key={q}
										type="button"
										onClick={() => setQuery(q)}
										className="rounded-full bg-secondary px-3 py-1 text-sm text-foreground hover:bg-secondary/80"
									>
										{q}
									</button>
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
									<HoloCard
										key={card.id}
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
										owned={!!owned[card.id]}
										onClick={(e) => {
											if (e.defaultPrevented) return;
											navigate(`/card/${card.id}`);
										}}
										style={{ width: 96 }}
									/>
								))}
							</div>
						</section>
					)}
				</div>
			)}
		</div>
	);
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `bun run typecheck && bunx biome check --config-path=. --write src/pages/home.tsx`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/pages/home.tsx
git commit -m "feat(home): search hero with popular chips, holo backdrop, recents"
```

---

### Task 3: Minimal render test

**Files:** Create `src/pages/home.test.tsx`

- [ ] **Step 1: Write the test** — render `Home` under a memory router; assert the hero title + a popular chip render, and that clicking a chip pushes `?q=Pikachu`. Read an existing page test (e.g. `src/components/card-dialog/card-dialog.test.tsx`) first to match the `createMemoryRouter`/`RouterProvider` + `@testing-library/react` pattern used in this repo.

```tsx
import { expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { Home } from "./home";

function renderHome() {
	const router = createMemoryRouter(
		[{ path: "/", element: <Home /> }],
		{ initialEntries: ["/"] },
	);
	render(<RouterProvider router={router} />);
	return router;
}

test("Home renders the hero title and popular chips", () => {
	renderHome();
	expect(screen.getByText("Pokémon TCG Holo Playground")).toBeDefined();
	expect(screen.getByRole("button", { name: "Pikachu" })).toBeDefined();
});

test("clicking a popular chip sets the q param", () => {
	const router = renderHome();
	fireEvent.click(screen.getByRole("button", { name: "Charizard" }));
	expect(router.state.location.search).toContain("q=Charizard");
});
```

- [ ] **Step 2: Run it**

Run: `bun test src/pages/home.test.tsx`
Expected: PASS (2 tests). If the repo's test setup needs a different render helper (check the card-dialog test), adapt to match and note it.

- [ ] **Step 3: Commit**

```bash
git add src/pages/home.test.tsx
git commit -m "test(home): hero renders + chip sets query"
```

---

### Task 4: Verify

- [ ] **Step 1: Full check**

Run:
```bash
bun run typecheck
bunx biome check --config-path=. src
bun test
```
Expected: all PASS.

- [ ] **Step 2: Build + preview**

Run: `bun run build && bun run preview`. In the preview (unregister the SW if assets look stale), confirm at `/`:
- Centered hero: logo, title, tagline, search (focused), 5 popular chips; faint holo cards drifting behind.
- Click a chip → transitions to that search.
- With recents present (open a card, run a search, return Home): "Recent searches" chips + "Recently viewed" strip appear, left-aligned in the column; "Clear" empties searches.
- Fresh profile (clear `ptcgv-recents`): only hero + chips, no recents sections.
- OS reduced-motion → backdrop stops drifting.

- [ ] **Step 3: Commit** (only if Step 1/2 required fixes)

```bash
git add -A
git commit -m "fix(home): post-verify adjustments"
```

---

## Self-Review

**Spec coverage:** centered column + hero (logo/title/tagline/search/chips) → Task 2; drifting decorative backdrop + reduced-motion → Tasks 1–2; left-aligned recents (searches + viewed, hide when empty) → Task 2; popular chips → Task 2. ✓ Backdrop decorative-only (v1) per spec — no data fetch. ✓

**Placeholder scan:** none. Task 3 references the existing card-dialog test only to match the render helper, with the test code given inline.

**Type consistency:** `useRecentsStore` selectors (`recentSearches`/`recentlyViewed`/`clearRecentSearches`) match the store (Task 1 of the prior plan). `HoloCard` props match `card-grid.tsx`/`home`'s prior usage. `useNameQueryParam()` setter used for chips. `animate-[float-card_...]` matches the keyframe name in Task 1.
