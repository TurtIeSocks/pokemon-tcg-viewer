# Parity Plan 12 — Pack Opening

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the "open a booster pack" feature — rip-to-open animation, rarity-weighted pack roll, holo card reveal with collection toggles — as a client dialog launched from the set page (and toolbar Open-Packs button). No route; the pool comes from the set page's already-loaded card list.

**Architecture:** Restore the pure `roll-pack.ts` (+ its test) and the `BoosterPack.tsx` component verbatim from `main`. Build a `PackDialog` client island that takes a card pool (the set's cards, already in the set route's loader data) + set name, rolls a pack on rip, and reveals holo cards. Mount it behind an "Open Packs" button on the set page and in the toolbar (set-context-aware). Pure client interactivity — RNG content, nothing to prerender or crawl.

**Tech Stack:** restored `roll-pack.ts` + `booster-pack.tsx`/`.css`, `ui/dialog`, `ui/button`, `HoloCard`, `CollectionToggle`, `@tanstack/react-router` `Link` (for the reveal→card-page nav), Bun test.

---

## Context the implementer needs

- **`rollPack({ pool, rng?, packSize? })`** (restore from `main:src/utils/roll-pack.ts`) — pure, rarity-weighted (1 rare+, 3 uncommon, 6 common), sample-without-replacement, has a `main` test. Takes `HoloCardData[]`, returns `HoloCardData[]`. No imports to repoint (imports only `HoloCardData` from `../components/holo-card`, which exists).
- **`BoosterPack`** (restore from `main:src/components/booster-pack/booster-pack.tsx`) — the rip-to-open pack visual. Props `{ set: PokemonSet; ripped: boolean; onRip: () => void }`. `PokemonSet` import: `main` used `../../api`; repoint to `../../server/card-mappers`. Its `.css` is ALREADY on branch (`booster-pack.css`).
- **The set route** (`src/routes/$series/$set/index.tsx`) loader returns `{ set, cards, facets }` — `cards` is the full set (the pack pool). `set` is a `NavSet` (`{id, name, slug, logo, symbol, total}`) — NOT a full `PokemonSet`. `BoosterPack` needs `images.logo`/`images.symbol`/`name` → `NavSet` has `logo`/`symbol`/`name`. Adapt `BoosterPack` to take the fields it needs (see Task 2) rather than a full `PokemonSet`, to avoid a shape mismatch.
- **No `/pack/{setId}` route** (spec Assumption 3). The dialog is launched by a button; the pool is passed in as a prop. The toolbar's Open-Packs button only shows when a set is in context (derive from the active route).
- **Reveal cards link to their card page** via the set's slug map (the set route already augments `cards` with `slug`).
- bun test + happy-dom.

---

## File structure

- `src/utils/roll-pack.ts` — restore from `main` (+ test).
- `src/components/booster-pack/booster-pack.tsx` — restore from `main`, adapt props.
- `src/components/islands/pack-dialog.tsx` — the pack-open client dialog (pool + setName + slug resolver as props).
- `src/routes/$series/$set/index.tsx` — modify: "Open Packs" button → `PackDialog` with the loaded cards as pool.

(Toolbar Open-Packs button: deferred to a follow-up — the set-page button is the primary entry. The toolbar button needs cross-route set context which is more plumbing; the set page is where you'd open a pack anyway. NOTED, not silently dropped — see Self-review.)

---

### Task 1: Restore `roll-pack` (pure)

**Files:**
- Create: `src/utils/roll-pack.ts` (from `main`)
- Test: `src/utils/roll-pack.test.ts` (from `main`)

- [ ] **Step 1: Restore both from `main`.**

```bash
git show main:src/utils/roll-pack.ts > src/utils/roll-pack.ts
git show main:src/utils/roll-pack.test.ts > src/utils/roll-pack.test.ts
```

- [ ] **Step 2: Run the test** — `bun test src/utils/roll-pack.test.ts`. Expected: pass (imports only `HoloCardData` from `../components/holo-card`, present). If the test imports a moved path, fix it.

- [ ] **Step 3: Commit**

```bash
git add src/utils/roll-pack.ts src/utils/roll-pack.test.ts
git commit -m "feat(pack): restore rarity-weighted pack roll"
```

---

### Task 2: Restore `BoosterPack` (adapt props)

**Files:**
- Create: `src/components/booster-pack/booster-pack.tsx`

- [ ] **Step 1: Restore from `main`, then adapt the prop shape.** The set route has a `NavSet` (`{name, logo, symbol}`), not a full `PokemonSet`. Change `BoosterPack` to take the minimal fields.

```bash
git show main:src/components/booster-pack/booster-pack.tsx > src/components/booster-pack/booster-pack.tsx
```
Then edit the file: replace the `PokemonSet` import + prop with a local minimal interface, and read `logo`/`symbol`/`name` directly:
```tsx
import "./booster-pack.css";

export interface PackArt {
	name: string;
	logo: string;
	symbol: string;
}

interface BoosterPackProps {
	art: PackArt;
	ripped: boolean;
	onRip: () => void;
}

export function BoosterPack({ art, ripped, onRip }: BoosterPackProps) {
	return (
		<button
			type="button"
			className={`booster-pack${ripped ? " ripped" : ""}`}
			aria-label={`Open the ${art.name} booster pack`}
			onClick={onRip}
		>
			<span className="booster-pack-foil" aria-hidden="true" />
			<span className="booster-pack-crimp booster-pack-crimp--top" aria-hidden="true" />
			<span className="booster-pack-tear" aria-hidden="true">
				<span className="booster-pack-tear-label">Rip to open</span>
			</span>
			<span className="booster-pack-art">
				<img className="booster-pack-logo" src={art.logo} alt="" />
				<strong className="booster-pack-name">{art.name}</strong>
			</span>
			<img className="booster-pack-symbol" src={art.symbol} alt="" aria-hidden="true" />
			<span className="booster-pack-crimp booster-pack-crimp--bottom" aria-hidden="true" />
		</button>
	);
}
```
(This mirrors `main`'s markup exactly; only the prop shape changes from `set: PokemonSet` to `art: PackArt`.)

- [ ] **Step 2: Typecheck** — `bun run typecheck` → 0.

- [ ] **Step 3: Commit**

```bash
git add src/components/booster-pack/booster-pack.tsx
git commit -m "feat(pack): restore booster-pack visual (minimal art props)"
```

---

### Task 3: Pack-open dialog island

**Files:**
- Create: `src/components/islands/pack-dialog.tsx`

- [ ] **Step 1: Implement the dialog.** Props: the card pool, the pack art, and a `cardHref` resolver (so reveals link to card pages). Internal: rip → timeout → `rollPack` → reveal grid; "open another" rerolls.

```tsx
import { Link, type LinkProps } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { BoosterPack, type PackArt } from "../booster-pack/booster-pack";
import { CollectionToggle } from "../collection-toggle";
import { HoloCard, type HoloCardData } from "../holo-card";
import { rollPack } from "../../utils/roll-pack";

const RIP_DURATION_MS = 320;

interface PackDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	art: PackArt;
	pool: HoloCardData[];
	cardHref: (card: HoloCardData) => LinkProps;
}

export function PackDialog({ open, onOpenChange, art, pool, cardHref }: PackDialogProps) {
	const [ripped, setRipped] = useState(false);
	const [pack, setPack] = useState<HoloCardData[] | null>(null);
	const ripTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Reset when the dialog closes.
	useEffect(() => {
		if (!open) {
			setRipped(false);
			setPack(null);
			if (ripTimer.current) clearTimeout(ripTimer.current);
		}
	}, [open]);

	// Clear a pending rip if unmounted mid-animation.
	useEffect(() => () => { if (ripTimer.current) clearTimeout(ripTimer.current); }, []);

	const onRip = () => {
		if (pool.length === 0) return;
		setRipped(true);
		if (ripTimer.current) clearTimeout(ripTimer.current);
		ripTimer.current = setTimeout(() => setPack(rollPack({ pool })), RIP_DURATION_MS);
	};
	const onReroll = () => {
		if (ripTimer.current) clearTimeout(ripTimer.current);
		setRipped(false);
		setPack(null);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
				<DialogTitle>{`Open a ${art.name} pack`}</DialogTitle>
				{!pack ? (
					<div className="flex justify-center py-6">
						<BoosterPack art={art} ripped={ripped} onRip={onRip} />
					</div>
				) : (
					<>
						<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
							{pack.map((card) => (
								<Link key={card.id} {...cardHref(card)} className="block">
									<HoloCard
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
										style={{ width: "100%" }}
									/>
								</Link>
							))}
						</div>
						<div className="flex justify-center pt-4">
							<Button onClick={onReroll}>Open another pack</Button>
						</div>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}
```

- [ ] **Step 2: Typecheck** — `bun run typecheck` → 0.

- [ ] **Step 3: Commit**

```bash
git add src/components/islands/pack-dialog.tsx
git commit -m "feat(pack): pack-open dialog island (rip -> roll -> reveal)"
```

---

### Task 4: Open-Packs button on the set page

**Files:**
- Modify: `src/routes/$series/$set/index.tsx`

- [ ] **Step 1: Add an "Open Packs" button next to the set header that opens the dialog with the set's cards as the pool.** Add state + the `PackDialog` (client — gate the whole thing in `ClientOnly` since it's interactive). The set route's `cards` (with `slug`) is the pool; `set` (NavSet) supplies the art.

Add imports:
```tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PackDialog } from "../../../components/islands/pack-dialog";
import { Package } from "lucide-react";
```
In `SetPage`, add state + button + dialog. Put the button in the header row:
```tsx
	const [packOpen, setPackOpen] = useState(false);
```
Header row (replace the `<h1>` block's container to include the button):
```tsx
			<div className="mb-3 flex items-center gap-3">
				<h1 className="text-xl font-bold">{set.name}</h1>
				<span className="text-sm text-muted-foreground">{cards.length} cards</span>
				<ClientOnly fallback={null}>
					<Button variant="outline" size="sm" className="ml-auto" onClick={() => setPackOpen(true)}>
						<Package className="size-4 sm:mr-2" />
						<span className="hidden sm:inline">Open Packs</span>
					</Button>
				</ClientOnly>
			</div>
```
Before the closing `</div>` of `SetPage` (alongside `<Outlet/>`), mount the dialog:
```tsx
			<ClientOnly fallback={null}>
				<PackDialog
					open={packOpen}
					onOpenChange={setPackOpen}
					art={{ name: set.name, logo: set.logo, symbol: set.symbol }}
					pool={cards}
					cardHref={(card) => ({
						to: "/$series/$set/$card",
						params: {
							series: params.series,
							set: params.set,
							card: cards.find((c) => c.id === card.id)?.slug ?? card.id,
						},
					})}
				/>
			</ClientOnly>
```
Note: `set.logo`/`set.symbol`/`set.name` are on the `NavSet`. `cards` are the full set pool (already loaded). Reveal cards link to their card page via the slug map.

- [ ] **Step 2: Build + SSR-verify the set page still renders + crawlable (button is client-only, doesn't affect SSR).**

```bash
bun run build && node .output/server/index.mjs & SERVER_PID=$!
sleep 3
curl -s -o /tmp/p12set.html -w "set=%{http_code}\n" "http://localhost:3000/sword-shield/brilliant-stars"
kill $SERVER_PID
node -e 'const h=require("fs").readFileSync("/tmp/p12set.html","utf8"); console.log("card imgs:", (h.match(/loading="lazy"/g)||[]).length)'
```
Expected: 200; card imgs present (SSR fallback unchanged by the client-only button).

- [ ] **Step 3: Commit**

```bash
git add "src/routes/\$series/\$set/index.tsx"
git commit -m "feat(routes): Open Packs button + pack dialog on the set page"
```

---

### Task 5: Verification gate

- [ ] **Step 1: Full gate (parallel):** `bun run typecheck` (0), `biome check --config-path=. src` (clean), `bun test` (all pass: prior + roll-pack), `bun run build` (0, prerender ~180 pages still).
- [ ] **Step 2: Per-route SSR smoke** (6 routes 200). Same loop.
- [ ] **Step 3: Commit lint autofixes** if any (`git add -u src/`).

---

## Self-review

- **Spec coverage:** Group 4 — pack opening (#7) as a client dialog (Assumption 3: no route), pool from the set's loaded cards, rarity-weighted `rollPack` restored, `BoosterPack` rip animation restored, reveal cards link to their pages + collection toggles.
- **Placeholders:** none.
- **Type consistency:** `PackArt` (T2) used by `BoosterPack` + `PackDialog` (T3) + set page (T4). `rollPack` (T1) used by dialog. `cardHref` returns `LinkProps` (matches the grid island's pattern). Pool = the set route's `cards` (with `slug`).
- **Restore fidelity:** `roll-pack` verbatim (+ its `main` test); `BoosterPack` markup verbatim, only the prop shape adapted (`set: PokemonSet` → `art: PackArt`) because the set route carries a `NavSet`, not a full `PokemonSet`.
- **Departures from `main` (explicit):** (a) no `/pack/{setId}` route — it's a client dialog (RNG content, nothing to crawl); (b) pool comes from the set page's already-loaded cards, not a separate `loadPackCards` fetch (the deleted `pack-cards-slice` is NOT restored — the data is already in hand); (c) the **toolbar Open-Packs button is deferred** — the set-page button is the primary entry; a global toolbar button needs cross-route set context (more plumbing) and adds little (you open a pack from a set page). Flagged, not silently dropped.

## Carried forward

- Plan 13 — timeline / view-mode.
- Toolbar global Open-Packs button (deferred; set-page button covers the feature).
- Tilt-to-shine on the card modal (deferred from Plan 10).
