# Phase 2 / #2a — `/card/:id` Focus View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [docs/superpowers/specs/2026-05-03-phase-2-card-focus-view-design.md](../specs/2026-05-03-phase-2-card-focus-view-design.md)

**Goal:** Add a `/card/:id` focus view with rich metadata, pricing, and cross-links, reachable by clicking any card in either grid; migrate to React Router 7's data router so loaders work and `<ScrollRestoration />` is restored.

**Architecture:** Three coupled changes — (1) `src/main.tsx` swaps from `<BrowserRouter>` to `createBrowserRouter` + `<RouterProvider>`, with a new `<RootLayout>` component owning the primary nav + `<ScrollRestoration />` + `<Outlet />`; (2) a new `<CardPage>` route reads card data from a route loader (`getCardById` against `/v2/cards/{id}`), renders attacks/abilities/weaknesses for Pokémon, rules for Trainers, plus pricing summaries (TCGPlayer + Cardmarket) and cross-links via the existing `<CrossLinkOverlay>`; (3) the card grid wires `HoloCard.onClick` via `useNavigate` so clicks land on `/card/:id`. Phase 1 #4's hover overlay continues to work alongside.

**Tech Stack:** React 19 + React Router 7 (data router), TypeScript, Vite 8, Bun (package + test), Biome, happy-dom + @testing-library/react.

---

## File map

**Create:**
- `src/root-layout.tsx` — replaces `App.tsx`; renders nav + `<ScrollRestoration />` + `<Outlet />`
- `src/pages/card-loader.ts` — route loader that calls `getCardById`
- `src/pages/card-page.tsx` — focus view component (reads `useLoaderData()`, renders all sections)
- `src/pages/card-page.test.tsx` — Pokémon/Trainer/no-pricing fixture tests
- `src/pages/card-page.css` — two-column layout, section spacing, pricing/attack typography
- `src/pages/card-error-page.tsx` — `errorElement` for the `/card/:id` route
- `src/pages/card-error-page.test.tsx` — 404 vs generic error tests

**Modify:**
- `src/api.ts` — add `FocusCardData` type, `getCardById`, private `apiCardToFocusProps` mapper
- `src/main.tsx` — migrate to `createBrowserRouter` + `<RouterProvider>` with the route tree
- `src/app.test.tsx` — adapt to mount `<RootLayout>` via `createMemoryRouter` instead of `<App>` via `MemoryRouter`
- `src/components/card-grid.tsx` — add `useNavigate` and wire `HoloCard.onClick`
- `index.html` — add app-level OG meta tags

**Delete:**
- `src/app.tsx` — body lifted into `RootLayout`

---

## Task 1: Add `FocusCardData` type, `getCardById`, and the mapper

**Files:**
- Modify: `src/api.ts`

This task adds the API client surface for the focus view. No new test file (the API client doesn't have unit tests today; we exercise it via the page-level tests in Task 6).

- [ ] **Step 1.1: Verify working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-deeplinks && pwd && git branch --show-current
```
Expected: worktree path + `phase-2/deep-links`. STOP and report BLOCKED otherwise.

- [ ] **Step 1.2: Add the new type and API function to `src/api.ts`**

Read the current file first, then append the following at the end (Biome will sort imports/exports as it sees fit):

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

interface PokemonApiFocusCard {
	id: string;
	name: string;
	supertype: string;
	subtypes?: string[];
	rarity?: string;
	number: string;
	nationalPokedexNumbers?: number[];
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
	set: {
		id: string;
		name: string;
		series: string;
		releaseDate?: string;
		images?: { logo?: string; symbol?: string };
	};
	images: { small: string; large: string };
	tcgplayer?: FocusCardData["tcgplayer"];
	cardmarket?: FocusCardData["cardmarket"];
}

function apiCardToFocusProps(card: PokemonApiFocusCard): FocusCardData {
	return {
		id: card.id,
		imageUrl: card.images.large,
		name: card.name,
		rarity: card.rarity,
		subtypes: card.subtypes,
		supertype: card.supertype,
		setId: card.set.id,
		setName: card.set.name,
		cardNumber: card.number,
		nationalPokedexNumbers: card.nationalPokedexNumbers,
		setLogo: card.set.images?.logo,
		setReleaseDate: card.set.releaseDate,
		hp: card.hp,
		types: card.types,
		evolvesFrom: card.evolvesFrom,
		abilities: card.abilities,
		attacks: card.attacks,
		rules: card.rules,
		weaknesses: card.weaknesses,
		resistances: card.resistances,
		retreatCost: card.retreatCost,
		flavorText: card.flavorText,
		artist: card.artist,
		tcgplayer: card.tcgplayer,
		cardmarket: card.cardmarket,
	};
}

export async function getCardById(id: string): Promise<FocusCardData> {
	const resp = await fetch(`https://api.pokemontcg.io/v2/cards/${id}`);
	if (!resp.ok) {
		if (resp.status === 404) {
			throw new Response("Card not found", { status: 404 });
		}
		throw new Error(`Failed to fetch card ${id}: ${resp.status}`);
	}
	const json = (await resp.json()) as { data: PokemonApiFocusCard };
	return apiCardToFocusProps(json.data);
}
```

- [ ] **Step 1.3: Verify typecheck and tests still pass**

```bash
bun run typecheck && bun run lint && bun test
```
Expected: 69 tests pass (no new tests yet), typecheck clean, lint with only the pre-existing `card-grid.css !important` warning.

- [ ] **Step 1.4: Commit**

```bash
git add src/api.ts
git commit -m "feat(api): add FocusCardData type + getCardById

Single-card lookup against /v2/cards/{id} with a richer return shape
than HoloCardData (attacks, abilities, weaknesses, flavor, pricing).
Throws Response on 404 so React Router's errorElement can handle it."
```

---

## Task 2: Add the `cardLoader`

**Files:**
- Create: `src/pages/card-loader.ts`

A 7-line file that wraps `getCardById` for use as a React Router loader.

- [ ] **Step 2.1: Verify working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-deeplinks && pwd && git branch --show-current
```

- [ ] **Step 2.2: Create the loader**

Create `src/pages/card-loader.ts`:

```ts
import type { LoaderFunctionArgs } from "react-router";
import { getCardById } from "../api";

export async function cardLoader({ params }: LoaderFunctionArgs) {
	if (!params.id) throw new Response("Missing card id", { status: 400 });
	return getCardById(params.id);
}
```

- [ ] **Step 2.3: Verify**

```bash
bun run typecheck && bun run lint && bun test
```
Expected: 69 tests pass, typecheck clean.

- [ ] **Step 2.4: Commit**

```bash
git add src/pages/card-loader.ts
git commit -m "feat(card-loader): add /card/:id route loader

Throws Response on missing id (400) so React Router's errorElement
catches; getCardById throws on 404."
```

---

## Task 3: Build `<CardPage>` component (TDD with fixtures)

**Files:**
- Create: `src/pages/card-page.tsx`
- Create: `src/pages/card-page.test.tsx`
- Create: `src/pages/card-page.css`

CardPage renders the focus view from the loader's data. Tests use `createMemoryRouter` with a synchronous loader returning fixture data.

- [ ] **Step 3.1: Verify working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-deeplinks && pwd && git branch --show-current
```

- [ ] **Step 3.2: Write the failing test**

Create `src/pages/card-page.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "bun:test";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { FocusCardData } from "../api";
import { CardPage } from "./card-page";

const POKEMON_FIXTURE: FocusCardData = {
	id: "swsh4-43",
	imageUrl: "https://example.invalid/swsh4-43.png",
	name: "Pikachu V",
	rarity: "Rare Holo V",
	subtypes: ["Basic", "V"],
	supertype: "Pokémon",
	setId: "swsh4",
	setName: "Vivid Voltage",
	setLogo: "https://example.invalid/swsh4-logo.png",
	cardNumber: "43",
	nationalPokedexNumbers: [25],
	hp: "190",
	types: ["Lightning"],
	abilities: [],
	attacks: [
		{
			name: "Thunder Surge",
			cost: ["Lightning"],
			damage: "30",
			text: "Flip a coin. If heads, this attack does 30 more damage.",
		},
		{
			name: "Circle Circuit",
			cost: ["Lightning", "Lightning"],
			damage: "20×",
			text: "This attack does 20 damage for each of your Benched Pokémon.",
		},
	],
	weaknesses: [{ type: "Fighting", value: "×2" }],
	resistances: [],
	retreatCost: ["Colorless", "Colorless"],
	flavorText: "When you take it by the hand, it gives you a static shock.",
	artist: "5ban Graphics",
	tcgplayer: {
		url: "https://prices.pokemontcg.io/tcgplayer/swsh4-43",
		updatedAt: "2024-03-15",
		prices: {
			holofoil: { market: 5.43, low: 4.0, mid: 5.5, high: 12.0 },
		},
	},
	cardmarket: {
		url: "https://prices.pokemontcg.io/cardmarket/swsh4-43",
		updatedAt: "2024-03-15",
		prices: { averageSellPrice: 4.2, avg30: 4.05, trendPrice: 4.5 },
	},
};

const TRAINER_FIXTURE: FocusCardData = {
	id: "swsh4-145",
	imageUrl: "https://example.invalid/swsh4-145.png",
	name: "Boss's Orders",
	rarity: "Rare Holo",
	subtypes: ["Supporter"],
	supertype: "Trainer",
	setId: "swsh4",
	setName: "Vivid Voltage",
	cardNumber: "145",
	rules: [
		"Switch 1 of your opponent's Benched Pokémon with their Active Pokémon.",
		"You may play only 1 Supporter card during your turn.",
	],
	artist: "5ban Graphics",
};

const PRICELESS_FIXTURE: FocusCardData = {
	id: "old-card-1",
	imageUrl: "https://example.invalid/old-card.png",
	name: "Some Old Card",
	supertype: "Pokémon",
	setId: "base1",
	setName: "Base",
	cardNumber: "1",
	hp: "60",
	types: ["Grass"],
};

function renderWithFixture(card: FocusCardData) {
	const router = createMemoryRouter(
		[
			{
				path: "/card/:id",
				element: <CardPage />,
				loader: () => card,
			},
		],
		{ initialEntries: [`/card/${card.id}`] },
	);
	return render(<RouterProvider router={router} />);
}

describe("<CardPage />", () => {
	test("renders Pokémon card with name, set, and HP", () => {
		renderWithFixture(POKEMON_FIXTURE);
		expect(screen.getByText("Pikachu V")).toBeDefined();
		expect(screen.getByText(/Vivid Voltage/)).toBeDefined();
		expect(screen.getByText(/HP 190/)).toBeDefined();
	});

	test("renders Pokémon card attacks", () => {
		renderWithFixture(POKEMON_FIXTURE);
		expect(screen.getByText("Thunder Surge")).toBeDefined();
		expect(screen.getByText("Circle Circuit")).toBeDefined();
		expect(screen.getByText(/each of your Benched Pokémon/)).toBeDefined();
	});

	test("renders pricing block when tcgplayer/cardmarket present", () => {
		renderWithFixture(POKEMON_FIXTURE);
		expect(screen.getByText(/TCGPlayer/i)).toBeDefined();
		expect(screen.getByText(/Cardmarket/i)).toBeDefined();
	});

	test("renders Trainer card rules and no attacks", () => {
		renderWithFixture(TRAINER_FIXTURE);
		expect(screen.getByText("Boss's Orders")).toBeDefined();
		expect(
			screen.getByText(
				/Switch 1 of your opponent's Benched Pokémon/,
			),
		).toBeDefined();
		expect(screen.queryByText(/HP/)).toBeNull();
	});

	test("omits pricing block when neither tcgplayer nor cardmarket present", () => {
		renderWithFixture(PRICELESS_FIXTURE);
		expect(screen.queryByText(/TCGPlayer/i)).toBeNull();
		expect(screen.queryByText(/Cardmarket/i)).toBeNull();
	});

	test("renders cross-link to set", () => {
		renderWithFixture(POKEMON_FIXTURE);
		const setLink = screen.getByRole("link", { name: /Go to Vivid Voltage/i });
		expect(setLink.getAttribute("href")).toBe("/?setId=swsh4");
	});

	test("renders cross-link to Pokémon view (per pokédex number)", () => {
		renderWithFixture(POKEMON_FIXTURE);
		const dexLink = screen.getByRole("link", { name: /View all #25/i });
		expect(dexLink.getAttribute("href")).toBe("/pokemon?dex=25");
	});

	test("renders Back button", () => {
		renderWithFixture(POKEMON_FIXTURE);
		expect(screen.getByRole("button", { name: /back/i })).toBeDefined();
	});
});
```

Note the test for the cross-link uses the dex number (`#25`) because we don't have access to the pokémon list in tests — the production `<CardPage>` falls back to `#NN` when the pokémon name isn't loaded yet.

- [ ] **Step 3.3: Run failing test**

```bash
bun test src/pages/card-page.test.tsx
```
Expected: FAIL with "Cannot find module './card-page'".

- [ ] **Step 3.4: Implement the component**

Create `src/pages/card-page.tsx`:

```tsx
import { useLoaderData, useNavigate } from "react-router";
import type { FocusCardData } from "../api";
import { CrossLinkOverlay } from "../components/cross-link-overlay";
import { HoloCard } from "../components/holo-card";
import { usePokemonList } from "../hooks/use-pokemon-list";
import { pokemonNameByDex } from "../utils/pokemon-name";
import "./card-page.css";

interface PriceLine {
	source: "TCGPlayer" | "Cardmarket";
	url: string;
	priceLabel: string;
	updatedAt: string;
}

function buildPriceLines(card: FocusCardData): PriceLine[] {
	const lines: PriceLine[] = [];
	if (card.tcgplayer?.prices && card.tcgplayer.url) {
		const variantKeys = Object.keys(card.tcgplayer.prices);
		const firstVariant = variantKeys[0];
		const prices = firstVariant
			? card.tcgplayer.prices[firstVariant]
			: undefined;
		const value = prices?.market ?? prices?.mid;
		if (value !== undefined) {
			lines.push({
				source: "TCGPlayer",
				url: card.tcgplayer.url,
				priceLabel: `$${value.toFixed(2)} market`,
				updatedAt: card.tcgplayer.updatedAt,
			});
		}
	}
	if (card.cardmarket?.prices && card.cardmarket.url) {
		const value =
			card.cardmarket.prices.averageSellPrice ??
			card.cardmarket.prices.trendPrice ??
			card.cardmarket.prices.avg30;
		if (value !== undefined) {
			lines.push({
				source: "Cardmarket",
				url: card.cardmarket.url,
				priceLabel: `€${value.toFixed(2)} avg`,
				updatedAt: card.cardmarket.updatedAt,
			});
		}
	}
	return lines;
}

export function CardPage() {
	const card = useLoaderData() as FocusCardData;
	const pokemonList = usePokemonList();
	const navigate = useNavigate();
	const isPokemon = card.supertype === "Pokémon";
	const priceLines = buildPriceLines(card);

	const crossLinks: { label: string; to: string }[] = [];
	for (const dex of card.nationalPokedexNumbers ?? []) {
		const name = pokemonNameByDex(pokemonList, dex) ?? `#${dex}`;
		crossLinks.push({ label: `View all ${name}`, to: `/pokemon?dex=${dex}` });
	}
	crossLinks.push({
		label: `Go to ${card.setName}`,
		to: `/?setId=${card.setId}`,
	});

	return (
		<div className="card-page">
			<header className="card-page-header">
				<button
					type="button"
					className="card-page-back"
					onClick={() => navigate(-1)}
				>
					← Back
				</button>
				<h1>{card.name}</h1>
				<p className="card-page-caption">
					{card.setName} · {card.cardNumber}
					{card.rarity ? ` · ${card.rarity}` : ""}
				</p>
			</header>

			<div className="card-page-grid">
				<div className="card-page-image">
					<HoloCard
						imageUrl={card.imageUrl}
						name={card.name}
						rarity={card.rarity}
						subtypes={card.subtypes}
						supertype={card.supertype}
						setId={card.setId}
						cardNumber={card.cardNumber}
						size="focus"
					/>
				</div>

				<div className="card-page-meta">
					{isPokemon && (
						<section className="card-page-stats">
							{card.hp && <span>HP {card.hp}</span>}
							{card.types && card.types.length > 0 && (
								<span> · {card.types.join("/")}</span>
							)}
							{card.evolvesFrom && (
								<span> · Evolves from {card.evolvesFrom}</span>
							)}
						</section>
					)}

					{card.abilities && card.abilities.length > 0 && (
						<section className="card-page-abilities">
							<h2>Abilities</h2>
							{card.abilities.map((a) => (
								<div key={a.name} className="card-page-ability">
									<h3>
										{a.name}{" "}
										<span className="card-page-ability-type">{a.type}</span>
									</h3>
									<p>{a.text}</p>
								</div>
							))}
						</section>
					)}

					{card.attacks && card.attacks.length > 0 && (
						<section className="card-page-attacks">
							<h2>Attacks</h2>
							{card.attacks.map((atk) => (
								<div key={atk.name} className="card-page-attack">
									<h3>
										{atk.name}
										{atk.damage ? (
											<span className="card-page-damage"> {atk.damage}</span>
										) : null}
									</h3>
									{atk.cost && atk.cost.length > 0 && (
										<p className="card-page-attack-cost">
											Cost: {atk.cost.join(", ")}
										</p>
									)}
									{atk.text && <p>{atk.text}</p>}
								</div>
							))}
						</section>
					)}

					{isPokemon &&
						((card.weaknesses && card.weaknesses.length > 0) ||
							(card.resistances && card.resistances.length > 0) ||
							(card.retreatCost && card.retreatCost.length > 0)) && (
						<section className="card-page-defense">
							{card.weaknesses && card.weaknesses.length > 0 && (
								<p>
									Weakness:{" "}
									{card.weaknesses.map((w) => `${w.type} ${w.value}`).join(", ")}
								</p>
							)}
							{card.resistances && card.resistances.length > 0 && (
								<p>
									Resistance:{" "}
									{card.resistances
										.map((r) => `${r.type} ${r.value}`)
										.join(", ")}
								</p>
							)}
							{card.retreatCost && card.retreatCost.length > 0 && (
								<p>Retreat: {card.retreatCost.length}</p>
							)}
						</section>
					)}

					{card.rules && card.rules.length > 0 && (
						<section className="card-page-rules">
							<h2>Rules</h2>
							{card.rules.map((rule) => (
								<p key={rule}>{rule}</p>
							))}
						</section>
					)}

					{(card.flavorText || card.artist) && (
						<section className="card-page-flavor">
							{card.flavorText && <em>{card.flavorText}</em>}
							{card.artist && (
								<p className="card-page-artist">Illustrator: {card.artist}</p>
							)}
						</section>
					)}

					{priceLines.length > 0 && (
						<section className="card-page-pricing">
							<h2>Pricing</h2>
							{priceLines.map((line) => (
								<p key={line.source} className="card-page-price-line">
									<strong>{line.source}</strong> · {line.priceLabel} · Updated{" "}
									{line.updatedAt}{" "}
									<a
										href={line.url}
										target="_blank"
										rel="noopener noreferrer"
										className="card-page-external"
									>
										open ↗
									</a>
								</p>
							))}
						</section>
					)}

					<section className="card-page-related">
						<h2>Related</h2>
						<CrossLinkOverlay links={crossLinks} />
					</section>
				</div>
			</div>
		</div>
	);
}
```

A note on the back affordance: React Router 7's `<Link>` `to` prop is typed as `string | Partial<Path>` and doesn't accept a number for "go back in history" — that's `useNavigate()` + `navigate(-1)`. We render a `<button>` styled as a link to keep the visual treatment consistent with other links on the page (the `.card-page-back` CSS class has `text-decoration: none` and matches link colors).

- [ ] **Step 3.5: Create the CSS file**

Create `src/pages/card-page.css`:

```css
.card-page {
	max-width: 1100px;
	margin: 0 auto;
	padding: 1rem;
}

.card-page-header {
	margin-bottom: 1rem;
}

.card-page-back {
	display: inline-block;
	margin-bottom: 0.5rem;
	color: rgba(255, 255, 255, 0.7);
	text-decoration: none;
	background: none;
	border: none;
	padding: 0;
	cursor: pointer;
	font: inherit;
}

.card-page-back:hover {
	color: rgba(255, 255, 255, 0.95);
}

.card-page-header h1 {
	margin: 0;
	font-size: 1.75rem;
}

.card-page-caption {
	margin: 0.25rem 0 0;
	color: rgba(255, 255, 255, 0.6);
	font-size: 0.9rem;
}

.card-page-grid {
	display: grid;
	grid-template-columns: minmax(0, 400px) 1fr;
	gap: 2rem;
	align-items: start;
}

@media (max-width: 720px) {
	.card-page-grid {
		grid-template-columns: 1fr;
	}
}

.card-page-image {
	max-width: 400px;
}

.card-page-meta section {
	margin-bottom: 1.25rem;
}

.card-page-meta h2 {
	margin: 0 0 0.5rem;
	font-size: 0.85rem;
	text-transform: uppercase;
	letter-spacing: 0.05em;
	color: rgba(255, 255, 255, 0.5);
}

.card-page-stats {
	font-size: 1.1rem;
}

.card-page-attack,
.card-page-ability {
	margin-bottom: 0.85rem;
}

.card-page-attack h3,
.card-page-ability h3 {
	margin: 0 0 0.25rem;
	font-size: 1rem;
}

.card-page-damage {
	color: rgba(255, 200, 100, 0.95);
	font-weight: 600;
}

.card-page-attack-cost {
	margin: 0;
	color: rgba(255, 255, 255, 0.6);
	font-size: 0.85rem;
}

.card-page-ability-type {
	display: inline-block;
	margin-left: 0.5rem;
	padding: 0.1rem 0.4rem;
	background: rgba(120, 100, 255, 0.18);
	border-radius: 4px;
	font-size: 0.75rem;
	color: rgba(200, 190, 255, 0.95);
	text-transform: uppercase;
}

.card-page-defense p,
.card-page-rules p {
	margin: 0.25rem 0;
}

.card-page-flavor em {
	color: rgba(255, 255, 255, 0.7);
}

.card-page-artist {
	margin: 0.25rem 0 0;
	color: rgba(255, 255, 255, 0.5);
	font-size: 0.85rem;
}

.card-page-price-line {
	margin: 0.25rem 0;
	font-size: 0.9rem;
}

.card-page-external {
	color: rgba(120, 180, 255, 0.95);
	text-decoration: none;
}

.card-page-external:hover {
	text-decoration: underline;
}
```

- [ ] **Step 3.6: Run tests**

```bash
bun test src/pages/card-page.test.tsx
```
Expected: 8 pass, 0 fail. If a test fails about the back link rendering as a number, swap the `<Link to={-1 ...}>` for the `<button>` + `useNavigate()` form shown at the end of Step 3.4 and re-run.

- [ ] **Step 3.7: Verify whole suite**

```bash
bun run typecheck && bun run lint && bun test
```
Expected: 77 total pass, typecheck clean, lint with only the pre-existing warning.

- [ ] **Step 3.8: Commit**

```bash
git add src/pages/card-page.tsx src/pages/card-page.test.tsx src/pages/card-page.css
git commit -m "feat(card-page): add /card/:id focus view component

Two-column layout (card image + metadata). Conditionally renders
attacks/HP/weaknesses (Pokémon), rules (Trainer), abilities, flavor +
artist, and pricing summaries (TCGPlayer + Cardmarket). Cross-links
back to the set + per-pokédex Pokémon view via the existing
CrossLinkOverlay component."
```

---

## Task 4: Build `<CardErrorPage>` (TDD)

**Files:**
- Create: `src/pages/card-error-page.tsx`
- Create: `src/pages/card-error-page.test.tsx`

- [ ] **Step 4.1: Verify working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-deeplinks && pwd && git branch --show-current
```

- [ ] **Step 4.2: Write the failing test**

Create `src/pages/card-error-page.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "bun:test";
import { createMemoryRouter, RouterProvider } from "react-router";
import { CardErrorPage } from "./card-error-page";

function renderWithError(thrown: unknown) {
	const router = createMemoryRouter(
		[
			{
				path: "/card/:id",
				element: <div>card</div>,
				loader: () => {
					throw thrown;
				},
				errorElement: <CardErrorPage />,
			},
		],
		{ initialEntries: ["/card/test"] },
	);
	return render(<RouterProvider router={router} />);
}

describe("<CardErrorPage />", () => {
	test("renders 404 message when error is a Response with 404 status", () => {
		renderWithError(new Response("not found", { status: 404 }));
		expect(screen.getByText(/Card not found/i)).toBeDefined();
		expect(screen.getByText(/couldn't find that card/i)).toBeDefined();
	});

	test("renders generic message for non-404 errors", () => {
		renderWithError(new Error("network down"));
		expect(screen.getByText(/Something went wrong/i)).toBeDefined();
	});

	test("includes a Back home link", () => {
		renderWithError(new Response("not found", { status: 404 }));
		const link = screen.getByRole("link", { name: /back home/i });
		expect(link.getAttribute("href")).toBe("/");
	});
});
```

- [ ] **Step 4.3: Run failing test**

```bash
bun test src/pages/card-error-page.test.tsx
```
Expected: FAIL with module-not-found.

- [ ] **Step 4.4: Implement the component**

Create `src/pages/card-error-page.tsx`:

```tsx
import { Link, useRouteError } from "react-router";

export function CardErrorPage() {
	const error = useRouteError();
	const status =
		error instanceof Response ? error.status : undefined;
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

- [ ] **Step 4.5: Run tests to confirm pass**

```bash
bun test src/pages/card-error-page.test.tsx
```
Expected: 3 pass, 0 fail.

- [ ] **Step 4.6: Verify whole suite**

```bash
bun run typecheck && bun run lint && bun test
```
Expected: 80 total pass.

- [ ] **Step 4.7: Commit**

```bash
git add src/pages/card-error-page.tsx src/pages/card-error-page.test.tsx
git commit -m "feat(card-error-page): add errorElement for /card/:id

Distinguishes 404 (Card not found) from generic errors. Always
includes a 'Back home' link."
```

---

## Task 5: Create `<RootLayout>` and migrate `main.tsx` to data router

**Files:**
- Create: `src/root-layout.tsx`
- Modify: `src/main.tsx`
- Delete: `src/app.tsx`
- Modify: `src/app.test.tsx`

This task does the data-router migration. The order matters: create RootLayout first (so main.tsx can import it), then migrate main.tsx, then update the test, then delete the old App.tsx.

- [ ] **Step 5.1: Verify working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-deeplinks && pwd && git branch --show-current
```

- [ ] **Step 5.2: Create `src/root-layout.tsx`**

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

- [ ] **Step 5.3: Migrate `src/main.tsx`**

Replace the contents of `src/main.tsx` with:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import { CardErrorPage } from "./pages/card-error-page";
import { cardLoader } from "./pages/card-loader";
import { CardPage } from "./pages/card-page";
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

// biome-ignore lint/style/noNonNullAssertion: known to be there
createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<RouterProvider router={router} />
	</StrictMode>,
);
```

- [ ] **Step 5.4: Update `src/app.test.tsx`**

Replace the contents of `src/app.test.tsx` with:

```tsx
import { render, screen } from "@testing-library/react";
import { expect, test } from "bun:test";
import { createMemoryRouter, RouterProvider } from "react-router";
import { RootLayout } from "./root-layout";

function makeRouter() {
	return createMemoryRouter([
		{
			path: "/",
			element: <RootLayout />,
		},
	]);
}

test("RootLayout mounts without throwing", () => {
	expect(() => render(<RouterProvider router={makeRouter()} />)).not.toThrow();
});

test("RootLayout renders the primary nav", () => {
	render(<RouterProvider router={makeRouter()} />);
	expect(screen.getByText("By Set")).toBeDefined();
	expect(screen.getByText("By Pokémon")).toBeDefined();
});
```

- [ ] **Step 5.5: Delete `src/app.tsx`**

```bash
rm /Users/rin/GitHub/pokemon-tcg-viewer-deeplinks/src/app.tsx
```

- [ ] **Step 5.6: Verify**

```bash
bun run typecheck && bun run lint && bun test && bun run build
```
Expected: 80 tests pass (all updated correctly), typecheck clean, lint with only the pre-existing warning, build succeeds.

If typecheck flags missing imports somewhere, the most likely cause is a leftover `import App from "./app"` somewhere — `grep -rn "from \"./app\"" src/` to find any stragglers.

- [ ] **Step 5.7: Commit**

```bash
git add src/root-layout.tsx src/main.tsx src/app.test.tsx
git rm src/app.tsx
git commit -m "feat(routing): migrate to createBrowserRouter + RouterProvider

App.tsx body lifted into RootLayout (with ScrollRestoration restored
from Phase 1 #4). Routes now configured via createBrowserRouter with
the new /card/:id route + cardLoader + errorElement. App smoke test
adapted to mount RootLayout via createMemoryRouter."
```

---

## Task 6: Wire `HoloCard.onClick` in `<CardGrid>`

**Files:**
- Modify: `src/components/card-grid.tsx`

The grid's `itemContent` adds `onClick={() => navigate(\`/card/${card.id}\`)}` on each `<HoloCard>`. The hover overlay (Phase 1 #4) continues to work because its links are `<Link>` elements that don't bubble synthetic clicks unexpectedly.

- [ ] **Step 6.1: Verify working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-deeplinks && pwd && git branch --show-current
```

- [ ] **Step 6.2: Update `src/components/card-grid.tsx`**

Replace the file contents with:

```tsx
import React from "react";
import { useNavigate } from "react-router";
import { type GridComponents, VirtuosoGrid } from "react-virtuoso";
import { HoloCard, type HoloCardData } from "./holo-card";
import "./card-grid.css";

const GridList: NonNullable<GridComponents["List"]> = React.forwardRef(
	({ children, className, style }, ref) => (
		<div
			ref={ref}
			style={style}
			className={["grid-list", className].filter(Boolean).join(" ")}
		>
			{children}
		</div>
	),
);

const GridItem: NonNullable<GridComponents["Item"]> = ({
	children,
	className,
	style,
	...rest
}) => (
	<div
		{...rest}
		style={style}
		className={["grid-item", className].filter(Boolean).join(" ")}
	>
		{children}
	</div>
);

const gridComponents: GridComponents = { List: GridList, Item: GridItem };

interface CardGridProps {
	setId: string | null;
	cards: HoloCardData[];
	onEndReached: (setId: string) => void;
	renderOverlay?: (card: HoloCardData) => React.ReactNode;
}

export function CardGrid({
	setId,
	cards,
	onEndReached,
	renderOverlay,
}: CardGridProps) {
	const navigate = useNavigate();
	return (
		<VirtuosoGrid
			key={setId ?? "empty"}
			className="grid"
			data={cards}
			endReached={() => {
				if (setId) onEndReached(setId);
			}}
			increaseViewportBy={400}
			components={gridComponents}
			itemContent={(_, card) => (
				<HoloCard
					imageUrl={card.imageUrl}
					name={card.name}
					rarity={card.rarity}
					subtypes={card.subtypes}
					supertype={card.supertype}
					setId={card.setId}
					cardNumber={card.cardNumber}
					hoverOverlay={renderOverlay?.(card)}
					onClick={() => navigate(`/card/${card.id}`)}
					style={{ width: 300 }}
				/>
			)}
		/>
	);
}
```

The diff is just adding `import { useNavigate } from "react-router"`, calling `const navigate = useNavigate()` inside the component, and adding `onClick={() => navigate(\`/card/${card.id}\`)}` to the `<HoloCard>`.

- [ ] **Step 6.3: Verify**

```bash
bun run typecheck && bun run lint && bun test && bun run build
```
Expected: 80 pass, typecheck clean, build succeeds.

- [ ] **Step 6.4: Commit**

```bash
git add src/components/card-grid.tsx
git commit -m "feat(card-grid): navigate to /card/:id on card click

useNavigate fires from HoloCard's onClick. Hover overlay's <Link>
elements still work for cross-mode jumps; they don't bubble clicks
to the card body."
```

---

## Task 7: Add app-level OG meta tags

**Files:**
- Modify: `index.html`

- [ ] **Step 7.1: Verify working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-deeplinks && pwd && git branch --show-current
```

- [ ] **Step 7.2: Update `index.html`**

Replace the contents of `index.html` with:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Pokémon TCG Holo Playground</title>
    <meta property="og:title" content="Pokémon TCG Holo Playground" />
    <meta property="og:description" content="Browse the Pokémon TCG catalog with interactive holographic card effects." />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://turtiesocks.github.io/pokemon-tcg-viewer/" />
    <meta name="twitter:card" content="summary_large_image" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

The diff: improved page title (with é), plus 5 new meta tags. No `og:image` yet (deferred per the spec).

- [ ] **Step 7.3: Verify build**

```bash
bun run build
```
Expected: success. The build copies `index.html` to `dist/`; the meta tags appear in the deployed output.

- [ ] **Step 7.4: Commit**

```bash
git add index.html
git commit -m "feat(meta): add app-level OG meta tags

Generic og:title / og:description / og:type / og:url + twitter:card
so shared root URLs render a meaningful preview. Per-card meta tags
are out of scope on GitHub Pages (would require ~16k prerendered
HTML files). og:image deferred — needs a hosted PNG asset."
```

---

## Task 8: Final verification suite

**Files:** none (read-only verification)

- [ ] **Step 8.1: Verify working directory**

```bash
cd /Users/rin/GitHub/pokemon-tcg-viewer-deeplinks && pwd && git branch --show-current
```

- [ ] **Step 8.2: Run all checks**

```bash
bun run typecheck
```
Expected: zero errors.

```bash
bun run lint
```
Expected: only the pre-existing `card-grid.css !important` warning.

```bash
bun test
```
Expected: 80 pass / 0 fail (Phase 0+1's 69 + 8 from Task 3 + 3 from Task 4).

```bash
bun run build
```
Expected: success.

- [ ] **Step 8.3: Manual smoke test in dev**

Start the dev server:

```bash
bun run dev
```

In a browser at `http://localhost:5173/pokemon-tcg-viewer/`:

1. Land on `/` (By-Set view). Click any card. URL becomes `/card/<set>-<num>`. Page renders with image, metadata, attacks (or rules), and pricing if available.
2. Click "← Back". Returns to the previous URL with scroll position preserved.
3. From the focus view, click "Go to <Set Name>" — returns to `/?setId=...`.
4. From the focus view, click "View all <Pokémon>" — goes to `/pokemon?dex=N`.
5. Type `/card/bogus-nonexistent` in the URL bar. Renders `<CardErrorPage>` with "Card not found".
6. Hover a card on the grid. Hover overlay appears with cross-mode links — Phase 1 #4 works unchanged.
7. Click a Trainer card (e.g., from Sword & Shield Black Star Promos search for "Boss" or "Marnie"). Verify rules render instead of attacks; no HP shown.

If any step fails, debug, fix, and commit. If smoke test passes, no commit needed.

- [ ] **Step 8.4: Console-clean check**

While the dev server runs, open browser console. Browse to a card's focus view. Expect:
- No React Router warnings (the data-router migration is the most likely source of warnings).
- No errors from the API.
- The Phase 0 invariant: no `[holo-card] Unknown rarity` warnings on cards with known rarities.

- [ ] **Step 8.5: Update spec status**

Edit `docs/superpowers/specs/2026-05-03-phase-2-card-focus-view-design.md`. Change:

```markdown
**Status:** Approved (design)
```

to:

```markdown
**Status:** Implemented
```

Commit:

```bash
git add docs/superpowers/specs/2026-05-03-phase-2-card-focus-view-design.md
git commit -m "docs: mark Phase 2 #2a focus view spec as implemented"
```

---

## Done criteria

- [ ] All Phase 2 #2a tasks (1–8) above are checked off.
- [ ] `bun run lint && bun run typecheck && bun run test && bun run build` all pass.
- [ ] Manual smoke test (Step 8.3) passes — focus view navigation works in both directions; ScrollRestoration works on back; error page renders for unknown card IDs.
- [ ] Spec status reads "Implemented".
