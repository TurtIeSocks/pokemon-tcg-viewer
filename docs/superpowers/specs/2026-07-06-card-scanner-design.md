# Card Scanner — free on-device OCR + Plus AI scan (design)

Approved 2026-07-06 (delegate-mode brainstorm; assumptions reviewed, guided-frame
choice explicitly confirmed by owner). Companion strategy context: the
competitive teardown identified the scanner as the #1 featural gap and
"never uploads your camera feed" as an ownership-wedge extension no
competitor claims.

## Goal

Camera-based card entry. Free tier: scanner running entirely on-device
(Tesseract.js WASM) — photos never leave the browser, unlimited, works
signed-out. Plus tier: AI scan (one server-proxied vision call per frame) that
tolerates glare, wear, and sloppy framing. Both converge on one
confirm-and-add flow ending in the existing `addStack`/`addStacks` actions.

## Decisions (R-numbered, cite these in code comments)

- **R1 — Guide-frame alignment, not edge detection.** The UI draws a fixed
  card-shaped outline; the user aligns the card to it. Crop regions (name
  strip, bottom number strip) are fixed rectangles relative to the guide.
  Zero CV. Edge-detection auto-crop is the recorded v2 upgrade path and is
  OUT of v1 scope. Owner explicitly confirmed this trade (align-per-card
  effort accepted; accuracy comes from known region positions).
- **R2 — Number+total is the primary match key; name is the tiebreaker.**
  `parse` extracts `{number, total}` from OCR text (formats: `086/198`,
  `86/102`; OCR-confusion tolerant: O→0, l/I→1, S→5, B→8). `match` narrows to
  sets whose printed count equals `total`, picks the card at `number`, ranks
  by fuzzy name score (reuse `src/store/corpus/fuzzy.ts`). Promos without a
  total (e.g. `SWSH123`) fall back to name-only fuzzy.
- **R3 — Multi-frame voting makes cheap OCR reliable.** OCR runs every
  ~500ms; a reading is confident after 2 agreeing frames; the accumulator
  resets when readings diverge (card swapped). Single-frame results are never
  trusted.
- **R4 — Tesseract.js is the OCR engine**, lazy-loaded on the `/scan` route
  only (~3MB wasm + traineddata; cached). Digit+slash character whitelist on
  the number region. No other OCR dependency.
- **R5 — AI scan lives in the CORE, not the billing plugin.** Route
  `src/routes/api/scan.ts`. Entitlement enforced server-side via the existing
  `is_pro_self()` RPC evaluated with the caller's JWT — billing off (self-host)
  ⇒ everyone entitled, consistent with the RLS gate. Self-hosters who set
  their own `ANTHROPIC_API_KEY` get AI scan free; that is deliberate
  open-core behavior.
- **R6 — Vision call:** `@anthropic-ai/sdk`, model id from server env
  `SCAN_MODEL` (default `claude-haiku-4-5` — extraction-grade task, vision +
  structured outputs supported, ~$0.0025/scan protects the $4/mo Plus margin;
  flip env to `claude-opus-4-8` if accuracy disappoints). Structured outputs
  (`output_config.format`, json_schema) so the reply is guaranteed parseable:
  `{ name, number, setTotal, language, confidence }`. One guide-cropped JPEG
  (~200KB) per call, base64 image block. `ANTHROPIC_API_KEY` is server-only
  env: joins DEPLOY.md inventory + `/etc/tcg/env`; never `VITE_`-prefixed.
- **R7 — Free scanner is unlimited and requires no account.** It costs the
  operator nothing (user's device does the work). Marketing copy on the scan
  panel: scanning happens on your device; photos never leave it. The AI scan
  button discloses the upload explicitly.
- **R8 — No per-user scan metering v1.** nginx: `/api/scan` joins the
  existing `stripe` rate-limit zone. Fair-use language is a ToS item (007).
  Metering is a recorded follow-up, built only if abused.
- **R9 — Digit matching is region-agnostic.** Number/total digits are latin
  on JP/zh cards too; `match` runs against the active region corpus. JP name
  OCR is best-effort; UI copy sets expectations ("Japanese cards may need a
  manual pick").
- **R10 — Dev fixture capture.** A dev-gated (same gate as the preview login
  panel) "capture fixture" button dumps the exact cropped regions + full
  frame to downloadable files. Owner shoots ~15 real cards (holos, sleeved,
  vintage, JP, promo, dim light) once the UI boots; those become the OCR
  regression corpus. Clean TCGdex scans (low-res, small set) are committed as
  plumbing fixtures only — they must not be treated as accuracy evidence.

## Architecture — three units

### 1. Scan engine — `src/store/scan/` (pure, no DOM)

| File | Responsibility |
|---|---|
| `parse.ts` | OCR text → `{ number, total } \| null`, confusion-tolerant regex |
| `match.ts` | `{ number?, total?, nameText? }` + corpus index → top-3 ranked candidates `{ cardId, score }` |
| `vote.ts` | streaming accumulator: readings in, confident consensus out (R3) |

Interfaces take the corpus index/sets as arguments (no hidden imports of
runtime singletons) so tests inject fixtures. This unit is the test surface:
unit tests incl. OCR-noise fixtures, promo/vintage/JP cases.

### 2. Scanner UI — `src/routes/scan.tsx` + `src/components/scan/`

- Lazy route; heavy deps (Tesseract) dynamic-imported inside it.
- `use-camera.ts`: getUserMedia (rear preferred), torch toggle where
  supported, tracks stopped on unmount/visibility loss, file-upload fallback
  when no camera/permission (same pipeline on a still image).
- Guide overlay (R1) → fixed-region canvas crops → grayscale/contrast
  preprocess → Tesseract worker → `parse` → `vote` → `match`.
- Candidate tray: top matches as thumbs; tap → quick-add sheet (variant,
  quantity; sane defaults) → `addStack` → toast → continue scanning. Session
  count chip; "done" shows batch summary.
- No-match after ~6s: hint chip (light/fill frame) + manual search prefilled
  with best OCR name guess.
- Entry points: Vault CTA, command palette, sidebar. Ethereal Glass styling,
  `motion-reduce` guards. Copy: no em-dashes.

### 3. AI scan — `src/routes/api/scan.ts` (+ client hook)

- POST JSON `{ imageBase64 }` (guide-cropped JPEG) → session check (Supabase JWT) → entitlement
  check (R5) → vision call (R6) → JSON out. 401 / 403(`needs_plus`) / 5xx
  terse bodies + `console.error` forensics (established policy; never log the
  image).
- Client: "AI scan" button; free users see Plus chip → `/billing`; failures
  fall back to on-device flow. Upload disclosure inline (R7).
- Handler logic extracted as a testable function with DI for the Anthropic
  client + entitlement lookup (health.ts pattern).

## Error handling summary

| Failure | Behavior |
|---|---|
| No camera / denied | file-upload fallback |
| OCR no-consensus | hint chip + manual search prefill |
| AI 401 | sign-in prompt |
| AI 403 | billing CTA |
| AI 5xx / network | fall back to device scan; terse error |
| Corpus not loaded | `useEnsureCorpus()` before scanning starts |

## Testing

- Engine: bun unit tests (the bulk).
- API route: DI-mocked handler tests (no live Anthropic; no network — project
  rule).
- Camera loop: live preview verification + R10 fixture path; not unit-tested
  (happy-dom has no camera).
- Full suite + `tsc -b --force` gates before merge.

## Out of scope v1 (recorded)

Edge-detection auto-crop (v2), multi-card-per-frame, scan history, graded
slab OCR, PWA install prompt work, per-user scan metering (R8), native apps.

## Env additions

| Var | Where | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | `/etc/tcg/env` (server-only) | AI scan; absent ⇒ /api/scan returns 503 `scan not configured` |
| `SCAN_MODEL` | `/etc/tcg/env`, optional | default `claude-haiku-4-5` |

## Amendment 2026-07-07 — R1b: detection-assisted regions

Field testing on real hardware (phone, autofocus) confirmed guide-frame
alignment alone is too finicky: exact framing frustration, and vintage cards
mismatching on shared printed totals (Base Set vs Triumphant, both /102)
because the name strip missed the actual card name and the tiebreaker tied.

- **R1b — lightweight on-device card-box detection, no new deps.** Per frame:
  downscale to ~160px, luminance + Otsu threshold, row/column histogram
  trimming to a bounding box, validated by card aspect (w/h 0.55-0.9), area
  fraction (8-90%), and fill ratio (>=0.65), trying both polarity classes
  (bright card on dark, dark card on bright). Valid box => OCR regions are
  computed from the DETECTED box; invalid/null => fall back to the R1 guide
  frame unchanged. The guide overlay remains as an aiming hint; a live
  outline shows the detected box (lock-on feedback). Full perspective
  warp/OpenCV remains out of scope (recorded v2 ceiling).
- The AI scan crop also prefers the detected box.
- Pure engine code (`src/store/scan/detect.ts`) tested on synthetic frames;
  region math additions live in guide.ts with tests.
