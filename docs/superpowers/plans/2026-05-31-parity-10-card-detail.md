# Parity Plan 10 — Card Detail Parity

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the full card-detail experience lost in the migration: live prices, add-to-collection toggle, type pills + abilities/attacks/weaknesses/rules, cross-links to `/pokemon/{name}` and `/{series}/{set}`, and fix the modal text-overflow. The data is already fetched (`FocusCardData` carries every field) — this is presentation + restoring three deleted pure modules.

**Architecture:** Port three pure/presentational modules from `main` verbatim (only import paths change). Expand `CardMeta` into the full focus view. Add `CollectionToggle` + a `CardPrices` island + `CrossLinkOverlay` to the modal. Resolve cross-link dex→name server-side in the `$card` loader (existing `nameByDex` + pokémon list), pass as loader data — no client pokémon-list fetch. Constrain the focus-card column so the dialog stops overflowing.

**Tech Stack:** existing `FocusCardData` (`server/card-mappers.ts` — already has `tcgplayer`/`cardmarket`/`hp`/`abilities`/`attacks`/`weaknesses`/`resistances`/`retreatCost`/`rules`/`flavorText`/`artist`/`types`), `CollectionToggle`, `HoloCard`, `ui/dialog`, `ui/button`, `@tanstack/react-router` `Link`, Bun test.

---

## Context the implementer needs

- **`FocusCardData`** (`server/card-mappers.ts:55-104`) already includes: `tcgplayer?: {url, updatedAt, prices?}`, `cardmarket?: {url, updatedAt, prices?}`, `hp`, `types`, `abilities`, `attacks`, `weaknesses`, `resistances`, `retreatCost`, `rules`, `flavorText`, `artist`, `setLogo`, `nationalPokedexNumbers`. No data-layer change needed.
- **`$card` loader** (`src/routes/$series/$set/$card.tsx`) returns `{ card }`. It currently records recently-viewed in a `useEffect`. The card UI is rendered by `CardModal` (`components/islands/card-modal.tsx`).
- **`CardMeta`** (`components/card/card-detail.tsx`) is the current text block (name/set/types/attacks/flavor) — expand it. `CardDetail` (full page) wraps `CardMeta` + image.
- **`CollectionToggle`** (`components/collection-toggle`) takes `{ card: HoloCardData }`. The modal/page have a `FocusCardData` — map to `HoloCardData` (a `toHoloCardData` helper; the fields overlap).
- **Restoring from `main`** (deleted in Plan 07): `price-lines.ts`, `card-colors.ts`, `cross-link-overlay`. Their logic is unchanged; only imports change: `react-router` `Link` → `@tanstack/react-router` `Link`; `../../api` `FocusCardData` → `../../server/card-mappers`.
- **`nameByDex`** (`server/pokemon-dex.ts`) + `getPokemonListCached` (`server/card-data.ts`) resolve dex→species name server-side.
- **Slug for the set cross-link:** the `$card` loader has the set via `findSet`; build the `/{series}/{set}` link from the route params (already in scope).
- bun test + happy-dom; pure-module tests port from `main`.

---

## File structure

- `src/utils/card-colors.ts` — restore from `main` (pure). Port its test.
- `src/lib/price-lines.ts` — restore from `main` (pure; moved to `lib/`). Port its test.
- `src/components/card/card-meta.tsx` — expanded full focus view (replaces the stub `CardMeta` in `card-detail.tsx`).
- `src/components/card/to-holo.ts` — `FocusCardData → HoloCardData` mapper (shared by modal + page).
- `src/components/islands/card-prices.tsx` — `ClientOnly` price block (prices must never be SSR/OG'd).
- `src/components/islands/cross-link-overlay.tsx` — restore from `main` (TanStack `Link`).
- `src/routes/$series/$set/$card.tsx` — modify: loader resolves cross-links; modal gets toggle + prices + cross-links.
- `src/components/islands/card-modal.tsx` — modify: collection toggle, prices, cross-links, overflow fix.
- `src/components/card/card-detail.tsx` — modify: use the expanded `CardMeta`.

---

### Task 1: Restore `card-colors` (pure)

**Files:**
- Create: `src/utils/card-colors.ts` (from `main`)
- Test: `src/utils/card-colors.test.ts` (from `main`)

- [ ] **Step 1: Restore the source + test from `main`.**

```bash
git show main:src/utils/card-colors.ts > src/utils/card-colors.ts
git show main:src/utils/card-colors.test.ts > src/utils/card-colors.test.ts
```

- [ ] **Step 2: Run the test** — `bun test src/utils/card-colors.test.ts`. Expected: pass (pure module, no import changes needed — it has no external imports). If it imports anything that moved, fix the path.

- [ ] **Step 3: Commit**

```bash
git add src/utils/card-colors.ts src/utils/card-colors.test.ts
git commit -m "feat(card): restore type-color helper"
```

---

### Task 2: Restore `price-lines` (pure, → lib/)

**Files:**
- Create: `src/lib/price-lines.ts`
- Test: `src/lib/price-lines.test.ts`

- [ ] **Step 1: Restore + repoint the import.** `main`'s `price-lines.ts` imports `FocusCardData` from `../../api` (deleted). Repoint to the server seam.

```bash
git show main:src/components/card-dialog/price-lines.ts > src/lib/price-lines.ts
```
Then edit line 1 of `src/lib/price-lines.ts`:
```ts
import type { FocusCardData } from "../server/card-mappers";
```

- [ ] **Step 2: Port the test if `main` has one; else write one.** Check `git show main:src/components/card-dialog/price-lines.test.ts` — if it exists, restore it to `src/lib/price-lines.test.ts` and repoint imports (`./price-lines` stays; any `../../api` type import → `../server/card-mappers`). If not, write:

```ts
import { describe, expect, test } from "bun:test";
import { buildPriceLines } from "./price-lines";
import type { FocusCardData } from "../server/card-mappers";

const base: FocusCardData = {
	id: "x", imageUrl: "l", name: "n", supertype: "Pokémon",
	setId: "swsh9", setName: "BS", setSeries: "S&S", cardNumber: "1",
};

describe("buildPriceLines", () => {
	test("TCGPlayer market price line", () => {
		const lines = buildPriceLines({
			...base,
			tcgplayer: { url: "http://tcg", updatedAt: "2024", prices: { holofoil: { market: 12.5 } } },
		});
		expect(lines).toHaveLength(1);
		expect(lines[0].source).toBe("TCGPlayer");
		expect(lines[0].priceLabel).toBe("$12.50 market");
	});
	test("Cardmarket avg line", () => {
		const lines = buildPriceLines({
			...base,
			cardmarket: { url: "http://cm", updatedAt: "2024", prices: { averageSellPrice: 9.4 } },
		});
		expect(lines[0].source).toBe("Cardmarket");
		expect(lines[0].priceLabel).toBe("€9.40 avg");
	});
	test("no price data → empty", () => {
		expect(buildPriceLines(base)).toEqual([]);
	});
});
```

- [ ] **Step 3: Run** — `bun test src/lib/price-lines.test.ts`. Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/price-lines.ts src/lib/price-lines.test.ts
git commit -m "feat(card): restore price-line builder (TCGPlayer + Cardmarket)"
```

---

### Task 3: `FocusCardData → HoloCardData` mapper

**Files:**
- Create: `src/components/card/to-holo.ts`

- [ ] **Step 1: Implement.** Maps the overlapping fields (the same mapping `main`'s card-dialog used).

```ts
import type { HoloCardData } from "../holo-card";
import type { FocusCardData } from "../../server/card-mappers";

/** Project the focus-card detail down to the grid/holo card shape. */
export function toHoloCardData(card: FocusCardData): HoloCardData {
	return {
		id: card.id,
		imageUrl: card.imageUrl,
		name: card.name,
		rarity: card.rarity,
		subtypes: card.subtypes,
		supertype: card.supertype,
		setId: card.setId,
		setName: card.setName,
		setSeries: card.setSeries,
		setReleaseDate: card.setReleaseDate,
		cardNumber: card.cardNumber,
		types: card.types,
		nationalPokedexNumbers: card.nationalPokedexNumbers,
	};
}
```
Note: confirm `HoloCardData` has `types?` (added Plan 03) — yes. `variants` is not on `FocusCardData` (only the focus shape); omit it (holo style falls back to rarity).

- [ ] **Step 2: Typecheck** — `bun run typecheck` → 0.

- [ ] **Step 3: Commit**

```bash
git add src/components/card/to-holo.ts
git commit -m "feat(card): FocusCardData -> HoloCardData mapper"
```

---

### Task 4: Restore `CrossLinkOverlay` island

**Files:**
- Create: `src/components/islands/cross-link-overlay.tsx`

- [ ] **Step 1: Restore from `main`, repoint `Link`.**

```bash
git show main:src/components/cross-link-overlay/cross-link-overlay.tsx > src/components/islands/cross-link-overlay.tsx
```
Edit line 1: `import { Link } from "react-router";` → `import { Link } from "@tanstack/react-router";`.

**Then convert the `to` strings to typed TanStack links.** `main`'s `CrossLink.to` was a raw string (`/?q=…`). TanStack `Link` needs typed `to`/`params`/`search`. Change the interface + render:
```tsx
import { Link, type LinkProps } from "@tanstack/react-router";

export interface CrossLink {
	label: string;
	link: LinkProps;
}

interface CrossLinkOverlayProps {
	links: CrossLink[];
}

export function CrossLinkOverlay({ links }: CrossLinkOverlayProps) {
	if (links.length === 0) return null;
	return (
		<div className="flex flex-col gap-1 px-3 py-2 bg-[rgba(0,0,0,0.6)] backdrop-blur-sm rounded-lg text-white text-[0.85rem] leading-[1.2] max-w-[16rem] shadow-[0_4px_12px_rgba(0,0,0,0.3)]">
			{links.map((cl) => (
				<Link
					key={cl.label}
					{...cl.link}
					className="inline-flex items-center gap-[0.4rem] text-white no-underline px-[0.4rem] py-1 rounded transition-[background] duration-120 ease-out hover:bg-[rgba(255,255,255,0.12)] focus-visible:bg-[rgba(255,255,255,0.12)] focus-visible:outline-none"
				>
					<span className="text-[0.9em] opacity-80" aria-hidden="true">→</span>
					{cl.label}
				</Link>
			))}
		</div>
	);
}
```

- [ ] **Step 2: Typecheck** — `bun run typecheck` → 0.

- [ ] **Step 3: Commit**

```bash
git add src/components/islands/cross-link-overlay.tsx
git commit -m "feat(card): restore cross-link overlay (TanStack links)"
```

---

### Task 5: Expand `CardMeta` to the full focus view

**Files:**
- Modify: `src/components/card/card-detail.tsx` (the `CardMeta` export)

- [ ] **Step 1: Replace `CardMeta`** in `card-detail.tsx` with the full metadata view ported from `main`'s card-dialog right column (abilities, attacks, weaknesses/resistances/retreat, rules, set/flavor/artist, HP, type pills). Keep `CardDetail` (full SSR page) using it. Import `getTypeColor`.

```tsx
import { getTypeColor } from "../../utils/card-colors";
import type { FocusCardData } from "../../server/card-mappers";

export function CardMeta({ card }: { card: FocusCardData }) {
	const isPokemon = card.supertype === "Pokémon";
	return (
		<div className="min-w-0 space-y-5 overflow-y-auto">
			<div className="flex items-start justify-between gap-4">
				<div className="min-w-0">
					<h1 className="text-2xl font-bold">{card.name}</h1>
					<p className="text-muted-foreground">
						{card.supertype}
						{card.subtypes?.length ? ` · ${card.subtypes.join(", ")}` : ""}
					</p>
				</div>
				{card.hp && (
					<div className="shrink-0 text-right">
						<span className="text-3xl font-bold text-primary">{card.hp}</span>
						<span className="block text-xs text-muted-foreground">HP</span>
					</div>
				)}
			</div>

			{card.types?.length ? (
				<div className="flex flex-wrap gap-2">
					{card.types.map((t) => (
						<span key={t} className="rounded-full px-3 py-1 text-sm font-medium text-white" style={{ backgroundColor: getTypeColor(t) }}>
							{t}
						</span>
					))}
				</div>
			) : null}

			{card.abilities?.length ? (
				<section>
					<h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Abilities</h2>
					{card.abilities.map((a) => (
						<div key={a.name} className="mb-2 rounded-lg bg-secondary p-3">
							<div className="font-medium">{a.name} <span className="text-xs text-muted-foreground">{a.type}</span></div>
							<p className="mt-1 text-sm text-muted-foreground">{a.text}</p>
						</div>
					))}
				</section>
			) : null}

			{card.attacks?.length ? (
				<section>
					<h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Attacks</h2>
					{card.attacks.map((atk) => (
						<div key={atk.name} className="mb-2 rounded-lg bg-secondary p-3">
							<div className="flex items-center justify-between">
								<span className="font-medium">{atk.name}</span>
								{atk.damage && <span className="font-bold text-primary">{atk.damage}</span>}
							</div>
							{atk.cost?.length ? <p className="mt-1 text-xs text-muted-foreground">Cost: {atk.cost.join(", ")}</p> : null}
							{atk.text && <p className="mt-1 text-sm text-muted-foreground">{atk.text}</p>}
						</div>
					))}
				</section>
			) : null}

			{isPokemon && (card.weaknesses?.length || card.resistances?.length || card.retreatCost?.length) ? (
				<section className="space-y-1 text-sm text-muted-foreground">
					{card.weaknesses?.length ? <p>Weakness: {card.weaknesses.map((w) => `${w.type} ${w.value}`).join(", ")}</p> : null}
					{card.resistances?.length ? <p>Resistance: {card.resistances.map((r) => `${r.type} ${r.value}`).join(", ")}</p> : null}
					{card.retreatCost?.length ? <p>Retreat: {card.retreatCost.length}</p> : null}
				</section>
			) : null}

			{card.rules?.length ? (
				<section className="space-y-1">
					{card.rules.map((r) => <p key={r} className="text-sm text-muted-foreground">{r}</p>)}
				</section>
			) : null}

			<div className="border-t border-border pt-3 text-sm">
				<p className="font-medium">{card.setName}</p>
				<p className="text-muted-foreground">
					{card.setSeries} · #{card.cardNumber}{card.rarity ? ` · ${card.rarity}` : ""}
				</p>
				{(card.flavorText || card.artist) && (
					<p className="mt-2 italic text-muted-foreground">
						{card.flavorText}{card.artist ? ` — ${card.artist}` : ""}
					</p>
				)}
			</div>
		</div>
	);
}
```
Keep the existing `CardDetail` function (it renders image + `<CardMeta>`); ensure it still compiles. Prices are NOT in `CardMeta` (they're a client island — Task 6).

- [ ] **Step 2: Build + SSR-verify the card page still renders meta** — `bun run build`; curl a card; confirm name + an attack/ability/set line present in HTML.

```bash
bun run build && node .output/server/index.mjs & SERVER_PID=$!
sleep 3
curl -s http://localhost:3000/sword-shield/brilliant-stars > /tmp/p10s.html
CARD=$(grep -oE '/sword-shield/brilliant-stars/[a-z0-9-]+' /tmp/p10s.html | head -1)
curl -s "http://localhost:3000${CARD}" > /tmp/p10c.html
kill $SERVER_PID
node -e 'const h=require("fs").readFileSync("/tmp/p10c.html","utf8"); console.log("has set line:", h.includes("#")); console.log("title:", (h.match(/<title>([^<]*)/)||[])[1])'
```
Expected: prints a title with a card name. Report.

- [ ] **Step 3: Commit**

```bash
git add src/components/card/card-detail.tsx
git commit -m "feat(card): full focus-view metadata (abilities, attacks, weaknesses, rules, type pills)"
```

---

### Task 6: Price island + cross-links + collection toggle + overflow fix in the modal

**Files:**
- Create: `src/components/islands/card-prices.tsx`
- Modify: `src/routes/$series/$set/$card.tsx`
- Modify: `src/components/islands/card-modal.tsx`

- [ ] **Step 1: Price island** `src/components/islands/card-prices.tsx` (ClientOnly — prices must never be cached/OG'd).

```tsx
import { ClientOnly } from "@tanstack/react-router";
import { buildPriceLines } from "../../lib/price-lines";
import type { FocusCardData } from "../../server/card-mappers";

export function CardPrices({ card }: { card: FocusCardData }) {
	return (
		<ClientOnly fallback={null}>
			<PriceLines card={card} />
		</ClientOnly>
	);
}

function PriceLines({ card }: { card: FocusCardData }) {
	const lines = buildPriceLines(card);
	if (!lines.length) return null;
	return (
		<section className="space-y-1 text-sm">
			{lines.map((l) => (
				<p key={l.source}>
					<strong>{l.source}</strong> · {l.priceLabel} ·{" "}
					<a href={l.url} target="_blank" rel="noopener noreferrer" className="text-primary underline">
						open ↗
					</a>
				</p>
			))}
		</section>
	);
}
```

- [ ] **Step 2: Loader resolves cross-links.** In `$card.tsx` loader, after fetching `card`, resolve dex→name and build the cross-link list (server-side). Add imports + return `crossLinks`.

```tsx
// imports:
import { getPokemonListCached } from "../../../server/card-data";
import { nameByDex } from "../../../server/pokemon-dex";
import type { CrossLink } from "../../../components/islands/cross-link-overlay";

// in loader, after `const card = await fetchCardById(cardId);`:
		const list = await getPokemonListCached();
		const crossLinks: CrossLink[] = [];
		for (const dex of card.nationalPokedexNumbers ?? []) {
			const name = nameByDex(list, dex);
			if (name) {
				crossLinks.push({
					label: `View all ${name.replace(/-/g, " ")}`,
					link: { to: "/pokemon/$name", params: { name } },
				});
			}
		}
		crossLinks.push({
			label: `Go to ${card.setName}`,
			link: { to: "/$series/$set", params: { series: params.series, set: params.set } },
		});
		return { card, crossLinks };
```
Update `CardPage` to read `crossLinks` and pass them to the modal.

- [ ] **Step 3: Modal gets toggle + prices + cross-links + overflow fix.** Rewrite `card-modal.tsx`:

```tsx
import { ClientOnly } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useStore } from "../../store";
import type { FocusCardData } from "../../server/card-mappers";
import { CardMeta } from "../card/card-detail";
import { toHoloCardData } from "../card/to-holo";
import { HoloCard } from "../holo-card";
import { CardPrices } from "./card-prices";
import { CrossLinkOverlay, type CrossLink } from "./cross-link-overlay";

export function CardModal({
	card,
	crossLinks,
	onClose,
}: {
	card: FocusCardData;
	crossLinks: CrossLink[];
	onClose: () => void;
}) {
	const holo = toHoloCardData(card);
	return (
		<Dialog open onOpenChange={(o) => !o && onClose()}>
			<DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
				<DialogTitle className="sr-only">{card.name}</DialogTitle>
				<div className="grid gap-6 md:grid-cols-2">
					<div className="flex flex-col items-center gap-3">
						<div className="w-full max-w-[320px]">
							<ClientOnly fallback={<img src={card.imageUrl} alt={card.name} className="w-full rounded-xl" />}>
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
						</div>
						<CollectionButton card={holo} />
					</div>
					<div className="min-w-0 space-y-5">
						<CardMeta card={card} />
						<CardPrices card={card} />
						<CrossLinkOverlay links={crossLinks} />
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}

function CollectionButton({ card }: { card: ReturnType<typeof toHoloCardData> }) {
	const owned = useStore((s) => !!s.owned[card.id]);
	const add = useStore((s) => s.addToCollection);
	const remove = useStore((s) => s.removeFromCollection);
	return (
		<Button
			className="w-full max-w-[320px]"
			variant={owned ? "default" : "outline"}
			onClick={() => (owned ? remove(card.id) : add(card))}
		>
			{owned ? "✓ In collection — remove" : "+ Add to collection"}
		</Button>
	);
}
```
Overflow fix: the image column is `max-w-[320px]` (was unconstrained `size="focus"` ~734px), the meta column is `min-w-0`, dialog `max-h-[90vh] overflow-y-auto` (matches `main`). Two-column grid `md:grid-cols-2`.

- [ ] **Step 4: Build + SSR-verify the card page + modal compile and render.** Card direct-hit still SSRs meta (CardDetail page), modal is client. Curl a card, check 200 + og:image (unchanged), title.

```bash
bun run build && node .output/server/index.mjs & SERVER_PID=$!
sleep 3
curl -s http://localhost:3000/sword-shield/brilliant-stars > /tmp/p10s2.html
CARD=$(grep -oE '/sword-shield/brilliant-stars/[a-z0-9-]+' /tmp/p10s2.html | head -1)
curl -s -o /tmp/p10c2.html -w "card=%{http_code}\n" "http://localhost:3000${CARD}"
kill $SERVER_PID
node -e 'const h=require("fs").readFileSync("/tmp/p10c2.html","utf8"); console.log("og:image:", h.includes("og:image"))'
```
Expected: card 200, og:image true.

- [ ] **Step 5: Commit**

```bash
git add src/components/islands/card-prices.tsx "src/routes/\$series/\$set/\$card.tsx" src/components/islands/card-modal.tsx
git commit -m "feat(card): modal prices + cross-links + collection toggle + overflow fix"
```

---

### Task 7: Verification gate

- [ ] **Step 1: Full gate (parallel):** `bun run typecheck` (0), `biome check --config-path=. src` (clean), `bun test` (all pass: prior + card-colors + price-lines), `bun run build` (0, prerender > 0 pages).
- [ ] **Step 2: Per-route SSR smoke** (all 6 routes 200; card og:image present). Same loop as prior plans.
- [ ] **Step 3: Commit lint autofixes** if any (`git add -u src/`).

---

## Self-review

- **Spec coverage:** Group 2 of the parity spec — prices (#9, restored `price-lines` + `CardPrices` island), collection toggle in dialog (#6), overflow fix (#5, constrained image col), cross-links (#10, restored overlay + server-resolved dex→name, wiring inbound traffic to `/pokemon/{name}`), full metadata (type pills via restored `card-colors`, abilities/attacks/weaknesses/rules).
- **Placeholders:** none.
- **Type consistency:** `toHoloCardData` (T3) used by modal (T6). `CrossLink` interface (T4) used by loader (T6.2) + overlay. `buildPriceLines` (T2) used by `CardPrices` (T6). `getTypeColor` (T1) used by `CardMeta` (T5). `FocusCardData` fields all confirmed present on the branch.
- **Hydration:** prices + holo + cross-links + toggle are client (`ClientOnly`/island/store); the SSR `CardDetail` page renders image + `CardMeta` (static, crawlable) — no prices in SSR/OG (correct: prices must never be cached). Modal is client-nav only.
- **Restore fidelity:** `card-colors`/`price-lines`/`cross-link` ported from `main` with only import-path changes (+ `CrossLink.to`-string → typed `LinkProps`, required by TanStack).

## Carried forward

- Plan 11 — sidebar collapse + toolbar (Sheet/About/repo/Open-Packs) + prerender sets.
- Plan 12 — pack opening.
- Plan 13 — timeline / view-mode.
- Tilt-to-shine button: deferred to a later polish pass (was in `main`'s dialog; not load-bearing). NOTE so it's not a silent drop.
