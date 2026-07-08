# Print Missing — Pricing line + QR code

Date: 2026-07-08
Status: Approved (brainstorming) → ready for implementation plan
Component: `src/components/binders/print-missing-dialog.tsx`

## Summary

Add two per-card elements to the "Print missing cards" placeholders:

1. **Price line** — the card's current market price, as an extra text line in the
   placeholder stack.
2. **QR code** — a scannable code linking to that card's canonical `/prices` page,
   for fast in-hand lookups.

Both are individually toggleable + size-adjustable, persist via `useUiPrefs.printPrefs`
like the existing name/#/set lines, and **default ON**. Both render as **foreground
paint** (SVG / HTML text), never CSS backgrounds — the print pipeline drops CSS
backgrounds, so a QR drawn as a background would not print (this is a documented,
previously-burned constraint in this codebase; see `PrintSheet` docs + memory
`project_print_svg_foreground`).

## Goals

- Reuse the app's **canonical** price selection so a placeholder matches the Pricing
  tab — no new pricing logic.
- QR is generated **fully client-side** (no external QR-image service, no network),
  rendered as inline SVG so it prints crisp at any mm size and works offline.
- Graceful omission: a card with no price, or one whose slug can't be resolved, simply
  omits that element — no `—`, no blank gap, no "loading" text.
- Preserve the existing 2×2 control-grid layout and the pure/dumb `PrintSheet`.

## Non-goals

- No change to per-sheet layout math (`print-missing.ts` / `sheetLayout`) — the new
  elements live *inside* a placeholder and don't affect card dimensions or per-page fit.
- No new price data source, no graded pricing, no currency picker (USD-only display,
  matching the rest of the app today).
- No QR for anything other than the `/prices` page.

## Design

### A. Price line

**Which number.** Reuse the canonical valuation helper (from
`src/store/userland/valuation.ts`) with a null printing (missing cards own no stack):

```ts
unitMarketValueUsdCents({ printing: null }, entry, fx)
```

= TCGplayer **market**, Normal-first finish fallback (N→H→1N→1H), USD cents; if no TP
entry, Cardmarket **trend** converted EUR→USD via the blob's `fx`. `entry =
pricesById.get(card.id)`.

**Data source.** The live price runtime (`src/store/corpus/prices-runtime.ts`):
- `pricesById = usePricesRuntime((s) => s.byId)` — `Map<cardId, CardPriceEntry> | null`.
- `fx = usePricesRuntime((s) => s.meta?.fx ?? null)`.
- The dialog calls `useEnsurePrices()` on mount so the blob is hydrated/fetched when the
  print modal opens (the binder page does not otherwise load prices).

**Format.** `formatPrice(cents, "USD")` (from `src/store/userland/money.ts`) → `$4.20`.

**Render.** A 4th text line at the bottom of the existing centered flex column (below
set name), gated by `showPrice` and by a non-null price. Own base size `priceSizeMm`,
scaled by the shared `textScale` like every other line.

**Unpriced / blob unavailable.** The price for that card is `null` → the line is not
rendered for that card. No placeholder text. (Prices are live, so this is the minority.)

### B. QR code

**Library.** Add `qrcode-generator` (~4 KB, zero runtime deps, MIT) + `@types/qrcode-generator`
(dev). It yields the raw module matrix; we render the SVG ourselves to match the
placeholder's existing foreground-`<rect>` approach. Justification for a new dep: QR
encoding (Reed–Solomon ECC + version/bit layout) is not "a few lines" — hand-rolling it
is the wrong trade.

**Pure util — `src/lib/qr.ts`:**

```ts
import qrcode from "qrcode-generator";

const QUIET = 4; // standard QR quiet-zone, in modules

export interface QrSvg { count: number; path: string; }

/** Build a QR for `text`; returns the total viewBox module count (data + quiet zone)
 *  and a single SVG path `d` covering all dark modules. null on empty text or on the
 *  rare overflow (URL longer than the max QR version) so one bad card can't throw the
 *  whole sheet. DOM-free → unit-testable. */
export function qrSvgPath(text: string): QrSvg | null {
  if (!text) return null;
  try {
    const qr = qrcode(0, "M");     // type 0 = auto-fit smallest version; ECC level M
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    let d = "";
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++)
        if (qr.isDark(r, c)) d += `M${c + QUIET} ${r + QUIET}h1v1h-1z`;
    return { count: n + QUIET * 2, path: d };
  } catch {
    return null;
  }
}
```

**Render in `PrintSheet`** (only when `showQr` && a non-null `qrUrl`):

```html
<svg width={qrSizeMm}mm height={qrSizeMm}mm viewBox="0 0 {count} {count}"
     preserveAspectRatio="none" aria-hidden="true">
  <rect x=0 y=0 width={count} height={count} fill="#ffffff"/>   <!-- quiet zone, foreground paint -->
  <path d={path} fill="#000000"/>
</svg>
```

Sits at the bottom of the same centered flex column (last child) → the "bottom-center
strip". Fixed black-on-white for scan reliability (independent of the placeholder's
chosen text/border colors). ECC level **M** tolerates minor ink bleed / cut misalignment.

**URL it encodes:**

```
{window.location.origin}/{series}/{set}/{card}/prices        (+ ?lang=xx when the card's face language ≠ en)
```

- Slugs via `cardRouteParams(useSlugIndex(), { id: card.id, setId: card.setId })` →
  `{ series, set, card }` (same resolution the detail/pricing routes use).
- Path matches `TAB_MASK.pricing` (`/$series/$set/$card/prices`). Prod serves at `/`
  (no base path), so `origin + path` is the correct absolute URL.
- `?lang` appended when `faceLanguageFor(card, activeLang) !== "en"`, mirroring
  `cardPricesLinkPropsFor` — so a scanned Japanese-region card cold-loads its own catalog.
- Built behind a `typeof window !== "undefined"` guard; on SSR the url is `null` (element
  omitted) and the client re-renders it. The dialog is client-only and the sheet only
  shows once opened, so in practice `window` exists.

**Slug unresolved** (corpus/slug index not ready, or card absent): `qrUrl` is `null` →
QR omitted for that card. Same graceful-omit rule as price.

### C. Store — `src/store/ui-prefs.ts`

Add to `PrintPrefs` + `DEFAULT_PRINT_PREFS`:

```ts
showPrice: boolean;   // default true
priceSizeMm: number;  // default 2.8  (matches numberSizeMm / setNameSizeMm)
showQr: boolean;      // default true
qrSizeMm: number;     // default 18
```

`resetPrintPrefs` already restores from `DEFAULT_PRINT_PREFS` → covered. `merge` uses
`deepmerge(current, persisted)`, so existing users' persisted prefs (which lack these
keys) inherit the new defaults automatically — the "both ON" default reaches them with
no migration.

### D. Controls — `print-missing-dialog.tsx` (keep the 2×2 grid)

- Add a `qrSize` entry to the `FIELD` bounds map:
  `qrSize: { unit: "mm", min: 10, max: 40, step: 1, precision: 0 }`. Price reuses `fontLine`.
- **Price** → a 4th `FontSizeField` in the existing **Font sizes** `ControlGroup`
  (checkbox + size), wired to `showPrice` / `priceSizeMm`.
- **QR** → a toggle+size row added to the **Style** `ControlGroup`. Generalize
  `FontSizeField` to accept an optional `spec` prop defaulting to `FIELD.fontLine`, then
  the QR row is `<FontSizeField label="QR code" spec={FIELD.qrSize} .../>` wired to
  `showQr` / `qrSizeMm`. One small DRY change, no new component.

### E. `PrintSheet` stays pure

The dialog precomputes, in a `useMemo` keyed on `[cards, pricesById, fx, slugIndex]`, a
`Map<cardId, { price: string | null; qrUrl: string | null }>` and passes it to
`PrintSheet` alongside `prefs`/`columns`. `PrintSheet` reads the map only (no store/hook
calls) — so the on-screen preview and the body-portal print target render from the same
data and stay identical. Price/QR visibility gated by `prefs.showPrice` / `prefs.showQr`
inside `PrintSheet`.

## Files touched

- `src/store/ui-prefs.ts` — 4 new `PrintPrefs` fields + defaults.
- `src/lib/qr.ts` — **new** pure QR util.
- `src/lib/qr.test.ts` — **new** unit test.
- `src/components/binders/print-missing-dialog.tsx` — precompute map, `useEnsurePrices`,
  `useSlugIndex`, `FIELD.qrSize`, generalized `FontSizeField`, Price + QR controls,
  `PrintSheet` price line + QR block.
- `src/components/binders/print-missing-dialog.test.tsx` — extend for price + QR.
- `package.json` + `bun.lock` — add `qrcode-generator` (+ `@types/qrcode-generator` dev);
  reconcile + commit lockfile in the same unit of work.

## Testing

- **`qr.test.ts`** (pure): a known URL → non-null result; stable `count`; empty string →
  `null`; a couple asserted dark-module coordinates (or a stable `count` for a fixed URL)
  so a broken matrix build fails loudly.
- **`print-missing-dialog.test.tsx`**: seed `usePricesRuntime.setState({ byId, meta })`
  and the corpus/slug index (per the project no-network rule — pre-seed
  `useCorpusRuntime` so `loadCorpus` early-returns), then assert:
  - `showPrice` on + priced card → price line text present; unpriced card → absent.
  - `showQr` on + resolvable card → a QR `<svg>` with a `<path>` renders; unresolved → absent.
- **Live verification**: boot `vite dev` on the preview port, open a binder with missing
  cards → open the print dialog → screenshot showing the price line + QR in the preview
  sheet; inspect the SVG path exists.

## Edge cases

- Very long URL overflowing max QR version → `qrSvgPath` returns `null` (try/catch) → QR
  omitted, sheet still renders. (URLs are ~60 chars, far within capacity; guard is belt-and-suspenders.)
- Price blob `unavailable`/still loading → all price lines omit; QR unaffected (QR needs
  only slugs, not prices).
- SSR (`window` undefined) → `qrUrl` null; client re-renders. Guarded.
- QR colors are fixed black/white regardless of the user's placeholder colors, so a
  light-on-light choice can't produce an unscannable code.
