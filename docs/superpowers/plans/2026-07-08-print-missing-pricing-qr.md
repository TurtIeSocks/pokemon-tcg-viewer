# Print Missing — Pricing line + QR code — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-card market-price line and a QR code (linking to the card's `/prices` page) to the "Print missing cards" placeholders, both toggleable + size-adjustable, defaulting ON.

**Architecture:** A pure QR util (`src/lib/qr.ts`) turns a URL into an inline-SVG path. A pure precompute (`src/components/binders/print-extras.ts`) joins each missing card to its canonical market price (via the existing `unitMarketValueUsdCents`) and its `/prices` URL + QR (via `cardRouteParams` + `qrSvgPath`). The dialog memoizes that map and feeds it to the existing `PrintSheet`, which stays pure and gains a price line + QR block rendered as foreground SVG/text (so they print).

**Tech Stack:** React 19 + TanStack, Zustand (`useUiPrefs`, `usePricesRuntime`, corpus runtime), Bun test + @testing-library/react + happy-dom, `qrcode-generator`.

## Global Constraints

- **Foreground paint only for anything printed.** The print pipeline drops CSS backgrounds; render fills/QR/text as SVG shapes or HTML text (SVG `fill`/`stroke`, `<path>`, `<rect>`), never `background:`. (Documented in `PrintSheet` + memory `project_print_svg_foreground`.)
- **Money is USD cents (integer) at the boundary**, formatted via `formatPrice(cents, "USD")` → `"$4.20"`; `null` = unknown (never `0`).
- **Tests must not hit the network.** Any test that mounts `PrintMissingDialog` (which loads prices on open) MUST stub the price fetchers via `setPricesFetchersForTests`.
- **Optional fields are `null`, never `undefined`.**
- **Package manager is bun.** After editing `package.json` deps, run `bun install` and commit the `bun.lock` diff in the same commit.
- **Biome in worktrees:** lint with `bunx biome check --write --config-path=. <files>` (not `bun run lint`).
- **No em-dashes in user-facing copy.** (Control labels here are plain words: "Price", "QR code".)

---

### Task 1: Pure QR util + `qrcode-generator` dependency

**Files:**
- Modify: `package.json` (add dep + types)
- Create: `src/lib/qr.ts`
- Test: `src/lib/qr.test.ts`

**Interfaces:**
- Produces: `qrSvgPath(text: string): QrSvg | null` where `interface QrSvg { count: number; path: string }`. `count` = viewBox side (data modules + 2×4 quiet-zone). `path` = SVG `<path>` `d` covering all dark modules. `null` on empty text or overflow.

- [ ] **Step 1: Add the dependency**

Run:
```bash
bun add qrcode-generator && bun add -d @types/qrcode-generator
```
Expected: `package.json` gains `qrcode-generator` (dependencies) + `@types/qrcode-generator` (devDependencies); `bun.lock` updated.

- [ ] **Step 2: Write the failing test**

Create `src/lib/qr.test.ts`:
```ts
import { expect, test } from "bun:test";
import { qrSvgPath } from "./qr";

test("encodes a URL into a QR path with a quiet-zone-padded viewBox", () => {
	const out = qrSvgPath("https://x.test/base/base-set-2/magikarp-50/prices");
	if (!out) throw new Error("expected a QR result");
	// Smallest QR is version 1 = 21 modules; + 2×4 quiet zone = 29 minimum.
	expect(out.count).toBeGreaterThanOrEqual(29);
	expect(out.path.length).toBeGreaterThan(0);
	expect(out.path.startsWith("M")).toBe(true);
});

test("is deterministic for the same input", () => {
	expect(qrSvgPath("https://x.test/a/b/c/prices")).toEqual(
		qrSvgPath("https://x.test/a/b/c/prices"),
	);
});

test("returns null for empty text", () => {
	expect(qrSvgPath("")).toBeNull();
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test src/lib/qr.test.ts`
Expected: FAIL — `qr.ts` does not exist / `qrSvgPath` not exported.

- [ ] **Step 4: Write the implementation**

Create `src/lib/qr.ts`:
```ts
import qrcode from "qrcode-generator";

/** Standard QR quiet-zone width, in modules. */
const QUIET = 4;

export interface QrSvg {
	/** viewBox side length in modules (data grid + quiet zone on both sides). */
	count: number;
	/** SVG path `d` covering every dark module, offset into the quiet zone. */
	path: string;
}

/**
 * Encode `text` as a QR code and return the data to render it as ONE inline SVG
 * <path>. Returns null for empty text or the rare overflow (text longer than the
 * largest QR version) so one bad card can never throw the whole print sheet.
 *
 * DOM-free (pure string math) → unit-testable without a browser. The caller draws:
 *   <svg viewBox="0 0 count count"><rect .. fill=white/><path d=path fill=black/></svg>
 * SVG shapes are FOREGROUND paint, so — unlike a CSS background — the code prints.
 */
export function qrSvgPath(text: string): QrSvg | null {
	if (!text) return null;
	try {
		const qr = qrcode(0, "M"); // type 0 = smallest fitting version; ECC level M
		qr.addData(text, "Byte"); // URLs have lowercase → byte mode, not alphanumeric
		qr.make();
		const n = qr.getModuleCount();
		let path = "";
		for (let r = 0; r < n; r++) {
			for (let c = 0; c < n; c++) {
				if (qr.isDark(r, c)) path += `M${c + QUIET} ${r + QUIET}h1v1h-1z`;
			}
		}
		return { count: n + QUIET * 2, path };
	} catch {
		return null;
	}
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test src/lib/qr.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Lint + commit**

Run: `bunx biome check --write --config-path=. src/lib/qr.ts src/lib/qr.test.ts`
```bash
git add package.json bun.lock src/lib/qr.ts src/lib/qr.test.ts
git commit -m "feat(print): pure qrSvgPath util + qrcode-generator dep"
```

---

### Task 2: Print-prefs store fields

**Files:**
- Modify: `src/store/ui-prefs.ts` (interface `PrintPrefs` + `DEFAULT_PRINT_PREFS`)
- Test: `src/store/ui-prefs.test.ts`

**Interfaces:**
- Produces: `PrintPrefs` gains `showPrice: boolean`, `priceSizeMm: number`, `showQr: boolean`, `qrSizeMm: number`. Defaults: `true / 2.8 / true / 18`.

- [ ] **Step 1: Write the failing test**

In `src/store/ui-prefs.test.ts` add (ensure `DEFAULT_PRINT_PREFS` is imported from `./ui-prefs`):
```ts
test("print defaults enable the price line and QR at sensible sizes", () => {
	expect(DEFAULT_PRINT_PREFS.showPrice).toBe(true);
	expect(DEFAULT_PRINT_PREFS.priceSizeMm).toBe(2.8);
	expect(DEFAULT_PRINT_PREFS.showQr).toBe(true);
	expect(DEFAULT_PRINT_PREFS.qrSizeMm).toBe(18);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/store/ui-prefs.test.ts`
Expected: FAIL — properties are `undefined`.

- [ ] **Step 3: Add the fields**

In `src/store/ui-prefs.ts`, in `interface PrintPrefs` after `setNameSizeMm: number;`:
```ts
	/** Show the card's current market price as a placeholder line, base size (mm, before textScale). */
	showPrice: boolean;
	priceSizeMm: number;
	/** Show a QR code linking to the card's /prices page; square, sized in mm. */
	showQr: boolean;
	qrSizeMm: number;
```

In `DEFAULT_PRINT_PREFS` after `setNameSizeMm: 2.8,`:
```ts
	showPrice: true,
	priceSizeMm: 2.8,
	showQr: true,
	qrSizeMm: 18,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/store/ui-prefs.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint + commit**

Run: `bunx biome check --write --config-path=. src/store/ui-prefs.ts src/store/ui-prefs.test.ts`
```bash
git add src/store/ui-prefs.ts src/store/ui-prefs.test.ts
git commit -m "feat(print): showPrice/showQr prefs (default on) + sizes"
```

---

### Task 3: Pure per-card extras builder (price + QR URL + QR)

**Files:**
- Create: `src/components/binders/print-extras.ts`
- Test: `src/components/binders/print-extras.test.ts`

**Interfaces:**
- Consumes: `qrSvgPath` (Task 1); `unitMarketValueUsdCents` (`@/store/userland/valuation`); `formatPrice` (`@/store/userland/money`); `cardRouteParams` (`@/lib/card-route`); `faceLanguageFor` + `SupportedLanguage` (`@/lib/languages`); `SlugIndex` (`@/lib/slug`); `CardPriceEntry`, `FxTable` (`@/lib/corpus/price-types`); `HoloCardData`.
- Produces:
  - `pricesUrl(card, slugIndex, origin, activeLang): string | null`
  - `buildPlaceholderExtras(args): Map<string, PlaceholderExtra>` where `interface PlaceholderExtra { price: string | null; qr: QrSvg | null }`.

- [ ] **Step 1: Write the failing test**

Create `src/components/binders/print-extras.test.ts`:
```ts
import { expect, test } from "bun:test";
import type { CardPriceEntry, FxTable } from "@/lib/corpus/price-types";
import type { SlugIndex } from "@/lib/slug";
import type { HoloCardData } from "../holo-card/types";
import { buildPlaceholderExtras, pricesUrl } from "./print-extras";

function slugIndex(): SlugIndex {
	return {
		seriesBySlug: new Map(),
		setIdBySlug: new Map(),
		cardIdBySlug: new Map(),
		setSlugById: new Map([
			["base-set-2", { seriesSlug: "base", setSlug: "base-set-2" }],
		]),
		cardSlugById: new Map([["bs2-50", "magikarp-50"]]),
	};
}

function hcard(o: Partial<HoloCardData> = {}): HoloCardData {
	return {
		id: "bs2-50",
		imageUrl: "",
		name: "Magikarp",
		setId: "base-set-2",
		setName: "Base Set 2",
		setSeries: "Base",
		cardNumber: "50",
		...o,
	} as HoloCardData;
}

const FX: FxTable = { base: "EUR", date: "2026-07-03", rates: { USD: 1.09 } };

test("builds an absolute /prices URL from the slug index", () => {
	expect(pricesUrl(hcard(), slugIndex(), "https://x.test", "en")).toBe(
		"https://x.test/base/base-set-2/magikarp-50/prices",
	);
});

test("null URL when the card slug can't be resolved", () => {
	expect(
		pricesUrl(hcard({ id: "nope" }), slugIndex(), "https://x.test", "en"),
	).toBeNull();
});

test("null URL when origin is empty (SSR)", () => {
	expect(pricesUrl(hcard(), slugIndex(), "", "en")).toBeNull();
});

test("formats the market price and builds a QR for a priced, resolvable card", () => {
	const prices = new Map<string, CardPriceEntry>([
		["bs2-50", { tp: { N: [420, 300] } }],
	]);
	const extras = buildPlaceholderExtras({
		cards: [hcard()],
		pricesById: prices,
		fx: FX,
		slugIndex: slugIndex(),
		origin: "https://x.test",
		activeLang: "en",
	});
	const e = extras.get("bs2-50");
	expect(e?.price).toBe("$4.20");
	expect(e?.qr).not.toBeNull();
});

test("price is null when the card is unpriced", () => {
	const extras = buildPlaceholderExtras({
		cards: [hcard()],
		pricesById: new Map(),
		fx: FX,
		slugIndex: slugIndex(),
		origin: "https://x.test",
		activeLang: "en",
	});
	expect(extras.get("bs2-50")?.price).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/components/binders/print-extras.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `src/components/binders/print-extras.ts`:
```ts
import { cardRouteParams } from "@/lib/card-route";
import type { CardPriceEntry, FxTable } from "@/lib/corpus/price-types";
import { faceLanguageFor, type SupportedLanguage } from "@/lib/languages";
import { qrSvgPath, type QrSvg } from "@/lib/qr";
import type { SlugIndex } from "@/lib/slug";
import { formatPrice } from "@/store/userland/money";
import { unitMarketValueUsdCents } from "@/store/userland/valuation";
import type { HoloCardData } from "../holo-card/types";

/** Per-placeholder derived extras; each field null when unavailable. */
export interface PlaceholderExtra {
	/** Formatted market price ("$4.20"), or null when the card is unpriced. */
	price: string | null;
	/** Prebuilt QR for the card's /prices page, or null when unresolvable. */
	qr: QrSvg | null;
}

/**
 * Absolute `/prices` URL for a card, or null when its slug can't be resolved or
 * `origin` is empty (SSR). Appends `?lang` when the card's face language is not
 * English (mirrors `cardPricesLinkPropsFor`), so a scanned non-Western card
 * cold-loads its own catalog region.
 */
export function pricesUrl(
	card: Pick<HoloCardData, "id" | "setId" | "region">,
	slugIndex: SlugIndex | null,
	origin: string,
	activeLang: SupportedLanguage,
): string | null {
	if (!slugIndex || !origin) return null;
	const p = cardRouteParams(slugIndex, card);
	if (!p) return null;
	const lang = faceLanguageFor(card, activeLang);
	const suffix = lang !== "en" ? `?lang=${lang}` : "";
	return `${origin}/${p.series}/${p.set}/${p.card}/prices${suffix}`;
}

/**
 * Precompute the price string + QR for every card. Pure: all inputs injected, so
 * it's unit-testable and safe to memoize. The market price reuses the app's
 * canonical valuation (`unitMarketValueUsdCents` with a null printing → Normal-first
 * TCGplayer market, Cardmarket-trend fallback), so a placeholder matches the
 * Pricing tab. Unpriced → `price: null`; unresolvable slug → `qr: null`.
 */
export function buildPlaceholderExtras(args: {
	cards: HoloCardData[];
	pricesById: Map<string, CardPriceEntry> | null;
	fx: FxTable | null;
	slugIndex: SlugIndex | null;
	origin: string;
	activeLang: SupportedLanguage;
}): Map<string, PlaceholderExtra> {
	const { cards, pricesById, fx, slugIndex, origin, activeLang } = args;
	const out = new Map<string, PlaceholderExtra>();
	for (const card of cards) {
		const entry = pricesById?.get(card.id) ?? null;
		const cents = unitMarketValueUsdCents({ printing: null }, entry, fx);
		const url = pricesUrl(card, slugIndex, origin, activeLang);
		out.set(card.id, {
			price: cents == null ? null : formatPrice(cents, "USD"),
			qr: url ? qrSvgPath(url) : null,
		});
	}
	return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/components/binders/print-extras.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Lint + commit**

Run: `bunx biome check --write --config-path=. src/components/binders/print-extras.ts src/components/binders/print-extras.test.ts`
```bash
git add src/components/binders/print-extras.ts src/components/binders/print-extras.test.ts
git commit -m "feat(print): pure buildPlaceholderExtras (price + /prices QR url)"
```

---

### Task 4: Wire price + QR into the dialog and PrintSheet

**Files:**
- Modify: `src/components/binders/print-missing-dialog.tsx`
- Test: `src/components/binders/print-missing-dialog.test.tsx`

**Interfaces:**
- Consumes: `buildPlaceholderExtras`, `PlaceholderExtra` (Task 3); `loadPrices`, `syncPrices`, `usePricesRuntime` (`@/store/corpus/prices-runtime`); `useSlugIndex` (`@/store/corpus/corpus-runtime`); `getActiveI18nLang` (`@/store/corpus/i18n-active`); `isSupportedLanguage` (`@/lib/languages`); `PrintPrefs.showPrice/priceSizeMm/showQr/qrSizeMm` (Task 2).

- [ ] **Step 1: Write the failing dialog tests**

In `src/components/binders/print-missing-dialog.test.tsx`:

Add imports at top:
```ts
import {
	setPricesFetchersForTests,
	usePricesRuntime,
} from "@/store/corpus/prices-runtime";
```

Replace the existing `beforeEach` with one that also inerts the price fetchers (no network on the dialog's on-open price load) and clears the price cache:
```ts
beforeEach(() => {
	useUiPrefs.setState({ printPrefs: { ...DEFAULT_PRINT_PREFS } });
	// The dialog loads prices when it opens; stub the fetchers so tests never hit
	// the wire, and start from a "ready" (empty) cache so loadPrices early-returns.
	setPricesFetchersForTests({
		fetchVersion: async () => {
			throw Object.assign(new Error("unavailable"), { status: 503 });
		},
		fetchBlob: async () => {
			throw Object.assign(new Error("unavailable"), { status: 503 });
		},
	});
	usePricesRuntime.setState({ byId: new Map(), meta: null, status: "ready" });
});
```

Add two tests:
```ts
test("shows a market price line for a priced card and hides it when toggled off", () => {
	usePricesRuntime.setState({
		byId: new Map([["a", { tp: { N: [420, 300] } }]]),
		meta: {
			date: "2026-07-03",
			sources: { tp: "2026-07-03", cm: null },
			fx: { base: "EUR", date: "2026-07-03", rates: { USD: 1.09 } },
		},
		status: "ready",
	});
	render(<PrintMissingDialog open onOpenChange={() => {}} cards={missing} />);
	// Card "a" (Bulbasaur) is priced at 420 cents → $4.20; b/c are unpriced.
	expect(within(preview()).getByText("$4.20")).toBeDefined();

	act(() => {
		fireEvent.click(screen.getByLabelText("Show Price"));
	});
	expect(within(preview()).queryByText("$4.20")).toBeNull();
});

test("exposes a QR-code toggle, on by default", () => {
	render(<PrintMissingDialog open onOpenChange={() => {}} cards={missing} />);
	const qr = screen.getByLabelText("Show QR code") as HTMLInputElement;
	expect(qr.checked).toBe(true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/components/binders/print-missing-dialog.test.tsx`
Expected: FAIL — no `$4.20` price line, no "Show QR code" control (and import errors for the not-yet-wired store).

- [ ] **Step 3: Add the `FIELD.qrSize` bound**

In `print-missing-dialog.tsx`, in the `FIELD` object after the `textPct` entry:
```ts
	// QR is a square; size is its side length in mm.
	qrSize: { unit: "mm", min: 10, max: 40, step: 1, precision: 0 },
```

- [ ] **Step 4: Generalize `FontSizeField` to take an optional `spec`**

Change the `FontSizeField` signature + the size input's `spec` (so the QR row can reuse it with `FIELD.qrSize`):
```ts
function FontSizeField({
	label,
	shown,
	onToggle,
	sizeMm,
	onSize,
	spec = FIELD.fontLine,
}: {
	label: string;
	shown: boolean;
	onToggle: (on: boolean) => void;
	sizeMm: number;
	onSize: (n: number) => void;
	spec?: UnitFieldSpec;
}) {
	return (
		<div className="flex items-center justify-between gap-3">
			<span className="text-xs font-medium text-(--ink-muted)">{label}</span>
			<div className="flex items-center gap-2.5">
				<input
					type="checkbox"
					checked={shown}
					onChange={(e) => onToggle(e.target.checked)}
					aria-label={`Show ${label}`}
					className="size-4 shrink-0 cursor-pointer accent-primary"
				/>
				<NumberUnitInput
					label={`${label} size`}
					value={sizeMm}
					spec={spec}
					disabled={!shown}
					onCommit={onSize}
				/>
			</div>
		</div>
	);
}
```
Note the size input aria-label changes from `${label} font size` to `${label} size`. Update the two existing tests that reference the old label: in this file, `"Card # font size"` → `"Card # size"` (the "unchecking a font-size line hides it" test) and `"Card name font size"` → `"Card name size"` (the "per-line font-size field" test).

- [ ] **Step 5: Add the imports + price/QR precompute in `PrintMissingDialog`**

Add imports at the top of `print-missing-dialog.tsx`:
```ts
import { useEffect, useMemo } from "react";
import { isSupportedLanguage } from "@/lib/languages";
import { getActiveI18nLang } from "@/store/corpus/i18n-active";
import { useSlugIndex } from "@/store/corpus/corpus-runtime";
import {
	loadPrices,
	syncPrices,
	usePricesRuntime,
} from "@/store/corpus/prices-runtime";
import { buildPlaceholderExtras } from "./print-extras";
```
(Keep the existing `import type { ReactNode } from "react"`; merge `useEffect`/`useMemo` into a value import.)

Inside `PrintMissingDialog`, after the `printPrefs` destructure, add the four new fields to the destructure:
```ts
		showPrice,
		priceSizeMm,
		showQr,
		qrSizeMm,
```
Then add the price load (on open) + precompute:
```ts
	// Load prices when the dialog opens (the binder page doesn't otherwise fetch them).
	useEffect(() => {
		if (open) void loadPrices().then(() => syncPrices());
	}, [open]);

	const pricesById = usePricesRuntime((s) => s.byId);
	const fx = usePricesRuntime((s) => s.meta?.fx ?? null);
	const slugIndex = useSlugIndex();
	const extras = useMemo(() => {
		const active = getActiveI18nLang();
		const activeLang = isSupportedLanguage(active) ? active : "en";
		const origin =
			typeof window === "undefined" ? "" : window.location.origin;
		return buildPlaceholderExtras({
			cards,
			pricesById,
			fx,
			slugIndex,
			origin,
			activeLang,
		});
	}, [cards, pricesById, fx, slugIndex]);
```
Change the `sheet` element to pass `extras`:
```ts
	const sheet = (
		<PrintSheet
			cards={cards}
			prefs={printPrefs}
			columns={layout.columns}
			extras={extras}
		/>
	);
```

- [ ] **Step 6: Thread `extras` through `PrintSheet` + render price line and QR**

Change the `PrintSheet` signature:
```ts
function PrintSheet({
	cards,
	prefs,
	columns,
	extras,
}: {
	cards: HoloCardData[];
	prefs: PrintPrefs;
	columns: number;
	extras: Map<string, PlaceholderExtra>;
}) {
```
Add to its `prefs` destructure: `showPrice, priceSizeMm, showQr, qrSizeMm,`.
Add the import: `import type { PlaceholderExtra } from "./print-extras";`

Convert the `cards.map((card) => (` body to a block that reads the card's extra, and add the price line + QR after the `showSetName` block, inside the same centered overlay `<div>`:
```tsx
			{cards.map((card) => {
				const extra = extras.get(card.id);
				return (
					<div
						key={card.id}
						className="tcgv-placeholder"
						style={{
							position: "relative",
							width: `${cardWidthMm}mm`,
							height: `${cardHeightMm}mm`,
							overflow: "hidden",
							breakInside: "avoid",
						}}
					>
						{/* ...existing SVG fill <rect> unchanged... */}
						<div
							style={{
								/* ...existing overlay flex-column styles unchanged... */
							}}
						>
							{/* ...existing showName / showNumber / showSetName blocks unchanged... */}
							{showPrice && extra?.price ? (
								<div
									style={{
										marginTop: "1mm",
										fontWeight: 700,
										fontSize: mm(priceSizeMm * textScale),
										fontVariantNumeric: "tabular-nums",
									}}
								>
									{extra.price}
								</div>
							) : null}
							{showQr && extra?.qr ? (
								<svg
									width={mm(qrSizeMm)}
									height={mm(qrSizeMm)}
									viewBox={`0 0 ${extra.qr.count} ${extra.qr.count}`}
									preserveAspectRatio="none"
									aria-hidden="true"
									style={{ marginTop: "1.5mm", display: "block" }}
								>
									<rect
										x={0}
										y={0}
										width={extra.qr.count}
										height={extra.qr.count}
										fill="#ffffff"
									/>
									<path d={extra.qr.path} fill="#000000" />
								</svg>
							) : null}
						</div>
					</div>
				);
			})}
```
(Keep the existing SVG `<rect>` fill block and the name/number/set overlay lines exactly as they are; only add the two new blocks and the `const extra` + block-body/`return`.)

- [ ] **Step 7: Add the Price + QR controls**

In the **Font sizes** `ControlGroup`, after the "Set name" `FontSizeField`:
```tsx
								<FontSizeField
									label="Price"
									shown={showPrice}
									onToggle={(on) => setPrintPrefs({ showPrice: on })}
									sizeMm={priceSizeMm}
									onSize={(n) => setPrintPrefs({ priceSizeMm: n })}
								/>
```
In the **Style** `ControlGroup`, after the "Text size" `UnitField`:
```tsx
								<FontSizeField
									label="QR code"
									spec={FIELD.qrSize}
									shown={showQr}
									onToggle={(on) => setPrintPrefs({ showQr: on })}
									sizeMm={qrSizeMm}
									onSize={(n) => setPrintPrefs({ qrSizeMm: n })}
								/>
```

- [ ] **Step 8: Run the dialog tests to verify they pass**

Run: `bun test src/components/binders/print-missing-dialog.test.tsx`
Expected: PASS (all — the 2 new + the existing, with the two aria-label references updated in Step 4).

- [ ] **Step 9: Run the full binder test directory (catch dialog-consumers hitting the wire)**

Run: `bun test src/components/binders/`
Expected: PASS. If any test that mounts `PrintMissingDialog` (e.g. `binder-detail.test.tsx`) now errors or hangs on a price fetch, add the same `setPricesFetchersForTests` + `usePricesRuntime.setState({ status: "ready" })` stub to that file's `beforeEach`.

- [ ] **Step 10: Lint + commit**

Run: `bunx biome check --write --config-path=. src/components/binders/print-missing-dialog.tsx src/components/binders/print-missing-dialog.test.tsx`
```bash
git add src/components/binders/print-missing-dialog.tsx src/components/binders/print-missing-dialog.test.tsx
git commit -m "feat(print): price line + QR code on missing-card placeholders"
```

---

### Task 5: Full verification (types, lint, tests, live preview)

**Files:** none (verification only).

- [ ] **Step 1: Typecheck + lint + full test in parallel**

Run (one batch):
```bash
bunx tsc -b
bunx biome check --config-path=. src/lib/qr.ts src/lib/qr.test.ts src/components/binders/print-extras.ts src/components/binders/print-extras.test.ts src/components/binders/print-missing-dialog.tsx src/store/ui-prefs.ts
bun test
```
Expected: `tsc` clean; biome clean; full suite green (no regressions).
Fix any failure before proceeding.

- [ ] **Step 2: Live preview verification**

Boot the dev server (`preview_start`, port 6201 per `.claude/launch.json`), open a binder that has missing cards, open the "Print missing" dialog, and confirm in the on-screen preview:
- a `$X.XX` price line appears on priced placeholders,
- a QR code renders in the bottom-center strip,
- toggling **Price** / **QR code** off removes each, and their size inputs drive the rendered size,
- (optional) scan a QR with a phone → lands on that card's `/prices` page.
Capture a screenshot for the user.

- [ ] **Step 3: Final commit (if the live pass required tweaks)**

```bash
git add -A
git commit -m "fix(print): live-preview adjustments for price + QR"
```
(Skip if Step 2 needed no changes.)

---

## Self-Review

**Spec coverage:**
- Price line (canonical `unitMarketValueUsdCents`, `formatPrice`, unpriced→omit) → Task 3 + Task 4 Steps 5-7. ✓
- QR client-side inline SVG, `/prices` URL + `?lang`, unresolved→omit → Task 1 + Task 3 + Task 4 Step 6. ✓
- 4 `PrintPrefs` fields, default ON, deepmerge reaches existing users → Task 2. ✓
- Controls stay 2×2 (Price→Font sizes, QR→Style, generalized `FontSizeField`) → Task 4 Steps 3,4,7. ✓
- `PrintSheet` stays pure (fed precomputed map) → Task 4 Steps 5,6. ✓
- Dep + lockfile, tests, live verify → Tasks 1, 5. ✓
- Foreground-paint QR (SVG rect+path, not CSS bg) → Task 1 doc + Task 4 Step 6. ✓

**Placeholder scan:** none — every step has concrete code/commands.

**Type consistency:** `QrSvg { count, path }` (Task 1) consumed verbatim in Task 3 (`qr: QrSvg | null`) and rendered in Task 4 (`extra.qr.count` / `extra.qr.path`). `PlaceholderExtra { price, qr }` produced in Task 3, consumed in Task 4's `PrintSheet` prop. `buildPlaceholderExtras` arg names (`pricesById`, `fx`, `slugIndex`, `origin`, `activeLang`) match between Task 3 impl/test and Task 4 call site. Store fields (`showPrice`/`priceSizeMm`/`showQr`/`qrSizeMm`) consistent across Tasks 2 and 4.

**Deferred/edge notes:** QR SVG *render* (given a non-null `extra.qr`) is verified in live preview (Task 5 Step 2), not jsdom — because forcing `useSlugIndex` non-null in a component test needs both the corpus index and the sets store seeded; the URL/encode logic itself is fully unit-tested in Task 3. Deliberate, stated.
