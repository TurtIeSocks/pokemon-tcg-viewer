# Phase 2 / #2a — `/card/:id` Focus View

**Date:** 2026-05-03
**Status:** Implemented
**Roadmap phase:** 2 of 5 (first feature; the originally-paired #2b OG preview prerendering is deferred indefinitely while the project lives on GitHub Pages)

## Context

Phase 1 #4 introduced cross-mode linking (set → Pokémon and back) but every card click still does nothing — the `HoloCard.onClick` prop is wired into the component but unused by either grid page. There is also no permalink form for an individual card; the only way to "view a card" is to navigate to its set or its Pokémon and scroll to find it.

This phase adds a dedicated single-card focus view at `/card/:id` with rich metadata, market pricing links, and back-navigation. Clicking any card in either grid lands on this page. The hover overlay from Phase 1 #4 stays — both affordances coexist (overlay = fast cross-mode jump without leaving the grid; click = deep-dive on the card itself).

Two side effects of this work:
1. **Data-router migration.** React Router 7's `createBrowserRouter` + `<RouterProvider>` replaces the current declarative `<BrowserRouter>` + `<Routes>` setup. Required for the route loader pattern that fetches card data, and unblocks the `<ScrollRestoration />` we had to drop in Phase 1 #4.
2. **App-level OG meta tags.** Because per-card prerendering would require build-time generation of ~16k HTML files (out of scope on GitHub Pages — see "Non-goals"), we set generic app-level OG tags so shared links at least preview meaningfully. Per-card OG is deferred to a future phase, contingent on hosting changes.

## Goals

1. A `/card/:id` route that renders a focus view for any card returnable from the pokemontcg.io `/v2/cards/{id}` endpoint.
2. Clicking a card in either grid navigates to that card's focus view.
3. The focus view shows: large card image (with holo effect), name, set logo + name + number, rarity, type/HP, attacks (or rules for Trainers), weaknesses/resistances/retreat (for Pokémon), flavor text, artist, TCGPlayer + Cardmarket pricing summaries with external links, cross-links back to the set and to the Pokémon view, and a "← Back" affordance.
4. Browser back/forward restores scroll position via `<ScrollRestoration />`.
5. Direct URL visits (typed, shared) resolve correctly. Non-existent IDs render a "Card not found" error page rather than a generic SPA failure.
6. The hover overlay from Phase 1 #4 continues to work unchanged on both grid pages.
7. App-level OG meta tags (`og:title`, `og:description`, `og:type`, `og:url`, `twitter:card`) added to `index.html`.

## Non-goals

- **Per-card OG previews / build-time prerendering.** GitHub Pages serves static files only; per-card meta tags require ~16k prerendered HTML stubs, which is brittle (rate limiting against pokemontcg.io during builds, deploy time, dist size). Deferred until the project moves off GH Pages or a different prerender strategy emerges.
- **Custom `og:image` asset.** A one-time PNG export can land later; not part of this spec.
- **Scroll-to-originating-card on back navigation.** Phase 1 #4 deferred this; still deferred.
- **Card variant pricing UI** (e.g., tabs for normal vs. holofoil vs. reverse holofoil prices). The focus view shows the first available variant's market price plus a link to TCGPlayer for full detail.
- **Native sharing UI** (Web Share API). Out of scope; users can copy the URL.
- **Currency conversion or price freshness indicators beyond `updatedAt`.**

## Approach

### Routing — data router migration

`src/main.tsx` switches from `<BrowserRouter>` to `createBrowserRouter` + `<RouterProvider>`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { CardErrorPage } from "./pages/card-error-page";
import { CardPage } from "./pages/card-page";
import { cardLoader } from "./pages/card-loader";
import { PokemonPage } from "./pages/pokemon-page";
import { RootLayout } from "./root-layout";
import { SetsPage } from "./pages/sets-page";

const router = createBrowserRouter(
	[
		{
			path: "/",
			element: <RootLayout />,
			children: [
				{ index: true, element: <SetsPage /> },
				{ path: "pokemon", element: <PokemonPage /> },
				{
					path: "card/:id",
					element: <CardPage />,
					loader: cardLoader,
					errorElement: <CardErrorPage />,
				},
			],
		},
	],
	{ basename: import.meta.env.BASE_URL },
);

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<RouterProvider router={router} />
	</StrictMode>,
);
```

A new `<RootLayout>` (replaces the previous `App.tsx`) owns the primary nav and renders `<Outlet />`. The two `<NavLink>` elements use the same `className={({ isActive }) => isActive ? "primary-nav-link active" : "primary-nav-link"}` pattern that the current `App.tsx` already uses — copy that body verbatim, just replacing `<Routes>` with `<Outlet />` and adding `<ScrollRestoration />`:

```tsx
import { NavLink, Outlet, ScrollRestoration } from "react-router";
import "./app.css";

export function RootLayout() {
	return (
		<div className="app">
			<ScrollRestoration />
			<nav className="primary-nav" aria-label="Filter mode">
				<NavLink
					to="/"
					end
					className={({ isActive }) =>
						isActive ? "primary-nav-link active" : "primary-nav-link"
					}
				>
					By Set
				</NavLink>
				<NavLink
					to="/pokemon"
					className={({ isActive }) =>
						isActive ? "primary-nav-link active" : "primary-nav-link"
					}
				>
					By Pokémon
				</NavLink>
			</nav>
			<Outlet />
		</div>
	);
}
```

The previous `App.tsx` is deleted (or repurposed). The existing `App.test.tsx` smoke test from Phase 1 #4 is updated to mount the migrated router.

### Card-by-id API client

`src/api.ts` gains a new function and a richer return type for the focus view's needs.

```ts
export interface FocusCardData {
	// Common with HoloCardData
	id: string;
	imageUrl: string;
	name: string;
	rarity?: string;
	subtypes?: string[];
	supertype: string;
	setId: string;
	setName: string;
	cardNumber: string;
	nationalPokedexNumbers?: number[];

	// Additional for focus view
	setLogo?: string;
	setReleaseDate?: string;
	hp?: string;
	types?: string[];
	evolvesFrom?: string;
	abilities?: { name: string; text: string; type: string }[];
	attacks?: {
		name: string;
		cost?: string[];
		damage?: string;
		text?: string;
	}[];
	rules?: string[];
	weaknesses?: { type: string; value: string }[];
	resistances?: { type: string; value: string }[];
	retreatCost?: string[];
	flavorText?: string;
	artist?: string;
	tcgplayer?: {
		url: string;
		updatedAt: string;
		prices?: Record<
			string,
			{ market?: number; low?: number; mid?: number; high?: number }
		>;
	};
	cardmarket?: {
		url: string;
		updatedAt: string;
		prices?: {
			averageSellPrice?: number;
			avg30?: number;
			trendPrice?: number;
		};
	};
}

export async function getCardById(id: string): Promise<FocusCardData> {
	const resp = await fetch(`https://api.pokemontcg.io/v2/cards/${id}`);
	if (!resp.ok) {
		if (resp.status === 404) throw new Response("Card not found", { status: 404 });
		throw new Error(`Failed to fetch card ${id}`);
	}
	const json = (await resp.json()) as { data: PokemonApiFocusCard };
	return apiCardToFocusProps(json.data);
}
```

`apiCardToFocusProps` is a private mapper similar to the existing `apiCardToProps` but copying the additional fields. The `PokemonApiFocusCard` interface is the API response shape (also private).

Throwing a `Response` from the loader is React Router's idiomatic signal to invoke `errorElement` for that route.

### `cardLoader`

A new file `src/pages/card-loader.ts`:

```ts
import type { LoaderFunctionArgs } from "react-router";
import { getCardById } from "../api";

export async function cardLoader({ params }: LoaderFunctionArgs) {
	if (!params.id) throw new Response("Missing card id", { status: 400 });
	return getCardById(params.id);
}
```

The route reads via `useLoaderData<typeof cardLoader>()`.

### `<CardPage>` component

A new `src/pages/card-page.tsx`. Layout is two-column on desktop (card image left, metadata right), stacked on mobile.

Sections, top-to-bottom in the metadata column:

1. **Header.** "← Back" link plus card name, supertype, and set/number/rarity caption.
2. **Stats row** (Pokémon only). HP, types, basic stage label.
3. **Abilities** (Pokémon, when present). Name + text per ability.
4. **Attacks** (Pokémon, when present). Name, cost icons, damage, text.
5. **Defense row** (Pokémon, when any present). Weaknesses, resistances, retreat cost.
6. **Rules** (Trainer/Stadium/Energy with rule text). Each rule rendered as a paragraph.
7. **Flavor + artist** (when flavorText present, always artist if present). Italic flavor + small "Illustrator: …" line.
8. **Pricing** (when `tcgplayer` or `cardmarket` present). One-line summaries per source with external links and `↗` indicator.
9. **Cross-links.** Reuses the existing `<CrossLinkOverlay>` component (the same component Phase 1 #4 uses for the hover overlay) — links to the Pokémon view per pokédex number, and to the set view.

Conditional rendering keeps the page clean for Trainers (no HP/attacks) and for cards without pricing data.

A new `card-page.css` handles the two-column layout, section spacing, and pricing/attack typography. Card image renders via `<HoloCard size="focus" {...} />` — the `focus` size variant from Phase 0 caps width at 600px and was added for exactly this view.

### `<CardErrorPage>` component

`src/pages/card-error-page.tsx`:

```tsx
import { Link, useRouteError } from "react-router";

export function CardErrorPage() {
	const error = useRouteError();
	const status = (error as Response)?.status;
	const isNotFound = status === 404;
	return (
		<div className="card-error">
			<h1>{isNotFound ? "Card not found" : "Something went wrong"}</h1>
			<p>
				{isNotFound
					? "We couldn't find that card."
					: "Try refreshing or come back later."}
			</p>
			<Link to="/">← Back home</Link>
		</div>
	);
}
```

### Wire grid clicks

`src/components/card-grid.tsx`:

```tsx
import { useNavigate } from "react-router";
// ...
const navigate = useNavigate();

itemContent={(_, card) => (
	<HoloCard
		/* ...existing props... */
		hoverOverlay={renderOverlay?.(card)}
		onClick={() => navigate(`/card/${card.id}`)}
	/>
)}
```

The hover overlay continues to work — its links remain `<Link>` elements with their own `onClick`-stopping behavior. Phase 1 #4 already verified that overlay links don't bubble up to the card's click handler (they call `e.stopPropagation()` via React Router's `<Link>` semantics).

### Pricing rendering

For TCGPlayer, the `prices` object has variant keys (`normal`, `holofoil`, `reverseHolofoil`, `1stEditionHolofoil`, etc.). v1 picks the first variant present and renders that variant's `market` price (falling back to `mid` if `market` absent). Format: `TCGPlayer · $5.43 market · Updated 2024-03-15 [open ↗]`.

For Cardmarket, render `averageSellPrice` (or `trendPrice` if absent) with the `updatedAt` date. Currency rendered as Euro (`€`) since Cardmarket is European.

If neither service has pricing for a card, the entire pricing section is omitted.

### App-level OG meta tags

In `index.html`:

```html
<meta property="og:title" content="Pokémon TCG Holo Playground" />
<meta property="og:description" content="Browse the Pokémon TCG catalog with interactive holographic card effects." />
<meta property="og:type" content="website" />
<meta property="og:url" content="https://turtiesocks.github.io/pokemon-tcg-viewer/" />
<meta name="twitter:card" content="summary_large_image" />
```

No `og:image` in this spec — adding one requires a hosted asset (a small PNG). Follow-up work.

### Migration steps (for the implementation plan)

1. Add `FocusCardData` type and `getCardById` + `apiCardToFocusProps` mapper to `src/api.ts`.
2. Create `src/pages/card-loader.ts`.
3. Create `src/root-layout.tsx` (lifts the existing `App.tsx` body); delete `App.tsx`.
4. Migrate `src/main.tsx` to `createBrowserRouter` + `<RouterProvider>`. Add the four routes including `/card/:id`.
5. Update `src/app.test.tsx` to mount the new router setup.
6. Build `<CardPage>` component + `card-page.css`.
7. Build `<CardErrorPage>` component + minimal CSS.
8. Wire `HoloCard.onClick` on the card grid via `useNavigate`.
9. Add OG meta tags to `index.html`.
10. Run all tests; verify hover overlay still works on both grid pages.

## Verification

- All existing 69 tests continue to pass after migration.
- New unit tests:
  - `getCardById` smoke (mock fetch, verify URL pattern + that the mapper produces a `FocusCardData` shape).
  - `<CardPage>` renders with a Pokémon fixture (attacks visible, HP visible, pricing visible).
  - `<CardPage>` renders with a Trainer fixture (rules visible, no attacks/HP).
  - `<CardPage>` omits pricing block when both `tcgplayer` and `cardmarket` are absent.
  - `<CardErrorPage>` renders 404 message when error has status 404.
  - `<CardErrorPage>` renders generic error message for non-404 errors.
  - App smoke test (existing) updated to mount the new router setup; passes without router-context errors.
- Manual smoke:
  - From `/?setId=swsh4`, click a card → URL becomes `/card/swsh4-50`, page renders with image + metadata + pricing.
  - Cross-link in focus view ("Go to Vivid Voltage") → returns to `/?setId=swsh4`.
  - Browser back → previous scroll position preserved.
  - Direct visit to `/card/bogus-nonexistent` → renders `<CardErrorPage>` with 404 message.
  - Hover overlay still works on the grid: hover a card on `/?setId=...` and verify the cross-link pill appears.
  - Tab navigation through grid cards reaches their click handlers (Enter activates).
- Lint, typecheck, build all clean.

## Open questions

None at design time. Ambiguities to resolve during implementation:

- The mapping from API response to `FocusCardData` may turn up a few fields with shape variations (e.g., older cards may use different attack cost formats). Implementer maps defensively (treat missing fields as `undefined`).
- Whether to lift the previous `App.tsx` content into `RootLayout` verbatim or refactor to use `<NavLink>` className helpers more concisely. Either is fine; the migration is mechanical.

## Risks

- **Loader semantics with React Router 7.** The data-router migration is well-trodden, but the React Compiler interaction with `useLoaderData()` is worth a smoke check during implementation. Mitigation: app smoke test already exists; extend it to cover `/card/:id` rendering.
- **Pricing data shape variability.** The `tcgplayer.prices` keyset is open-ended (any variant the API decides to include). v1 picks "first available" which is order-dependent on JSON object iteration. JavaScript preserves insertion order for string keys, so this is deterministic per response — but if the API ever returns a different variant ordering for the same card, the displayed price could shift between visits. Acceptable risk; if it bites, switch to a priority list (`["normal", "holofoil", "reverseHolofoil", ...]`).
- **Hover overlay regressions.** Phase 1 #4's overlay shares the `HoloCard` element. Wiring `onClick` on the same element introduces the chance of click handler conflicts. Mitigation: the existing `CrossLinkOverlay` uses `<Link>` from React Router which doesn't bubble synthetic clicks unexpectedly; smoke test verifies overlay links still work after the `onClick` wire-up.
- **GitHub Pages 404 fallback.** The deploy already does `cp dist/index.html dist/404.html` so unknown paths fall through to the SPA. After migration, an unknown path like `/card/bogus` will land in the SPA, hit the loader, and produce the error page correctly. Verified via manual smoke.
