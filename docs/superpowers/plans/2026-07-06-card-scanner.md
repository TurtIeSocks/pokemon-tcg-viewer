# Card Scanner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Camera-based card entry: free on-device OCR scanner (Tesseract.js, photos never leave the browser) + Plus-gated AI scan (one server-proxied Claude vision call), both feeding one confirm-and-add flow into the existing vault actions.

**Architecture:** Three units per the spec (`docs/superpowers/specs/2026-07-06-card-scanner-design.md`): a pure scan engine (`src/store/scan/` — parse/match/vote, fully unit-tested), a lazy `/scan` route (guide-frame camera UI, R1), and a core server route `/api/scan` (entitlement-gated vision call, R5/R6). Matching keys on card number + printed set total (R2) with multi-frame voting (R3).

**Tech Stack:** TanStack Start (server routes), Tesseract.js (new dep, lazy), @anthropic-ai/sdk (new server dep), existing corpus index + fuzzy helpers, Supabase SSR client, bun test.

## Global Constraints

- Read the spec first: `docs/superpowers/specs/2026-07-06-card-scanner-design.md`. Cite R-numbers (R1–R10) in code comments where a decision is load-bearing.
- Optional persisted fields are `null`, never `undefined`. `interface` over `type` for object shapes. Manual `useMemo`/`useCallback` allowed (React Compiler is on but hand-memo is the convention).
- Tests must not hit the network. Components rendering card grids must pre-seed `useCorpusRuntime.setState({ index: buildIndex([...]) })`.
- Never `mock.module` in bun tests (poisons later files) — use `spyOn` or DI.
- User-facing copy: no em-dashes (periods/commas instead). All motion behind `motion-reduce:` guards. Ethereal Glass styling (`GlassPanel`, pill buttons; see `src/components/ui/glass`).
- Lint per-file: `bunx biome check --write <files>`. Typecheck: `bunx tsc -b --force`. Scoped tests during tasks; full suite only at the end.
- Conventional commits. `git add` specific paths, never `-A`.
- Route files export `Route` + component (TanStack). Non-component exports go in sibling `.ts` files (react-refresh rule).
- Server env is read at runtime via `process.env` (never `VITE_`-prefixed for secrets). `ANTHROPIC_API_KEY` and `SCAN_MODEL` are server-only.

## File Structure

```
src/store/scan/
  parse.ts            OCR text → {number,total} (R2 regex, confusion-tolerant)
  parse.test.ts
  match.ts            number/total/name → ranked corpus candidates (R2)
  match.test.ts
  vote.ts             multi-frame consensus accumulator (R3)
  vote.test.ts
  ocr.ts              Tesseract worker wrapper (lazy, whitelist) — thin, untested
  scan-types.ts       shared interfaces
src/components/scan/
  use-camera.ts       getUserMedia lifecycle + torch + file fallback
  guide.ts            guide-frame geometry + region crop math (pure, tested)
  guide.test.ts
  scan-view.tsx       camera view + overlay + live loop
  candidate-tray.tsx  ranked matches + quick-add sheet
  fixture-capture.ts  dev-gated frame dump (R10)
src/routes/scan.tsx   lazy route shell
src/routes/api/scan.ts        POST handler (delegates to scan-handler)
src/lib/scan/scan-handler.ts  DI-testable handler logic (R5/R6)
src/lib/scan/scan-handler.test.ts
```

---

### Task 1: Scan engine — `parse.ts` (OCR text → number/total)

**Files:**
- Create: `src/store/scan/scan-types.ts`, `src/store/scan/parse.ts`
- Test: `src/store/scan/parse.test.ts`

**Interfaces:**
- Produces: `interface NumberReading { number: string; total: number | null }` (in scan-types.ts); `parseNumberText(raw: string): NumberReading | null`; `parseNameText(raw: string): string | null` (trimmed/cleaned name guess or null).
- Consumes: nothing.

- [ ] **Step 1: Write failing tests**

```ts
// src/store/scan/parse.test.ts
import { describe, expect, test } from "bun:test";
import { parseNameText, parseNumberText } from "./parse";

describe("parseNumberText", () => {
	test("modern number/total", () => {
		expect(parseNumberText("086/198")).toEqual({ number: "86", total: 198 });
	});
	test("vintage", () => {
		expect(parseNumberText(" 4/102 ")).toEqual({ number: "4", total: 102 });
	});
	test("secret rare keeps printed denominator", () => {
		expect(parseNumberText("205/198")).toEqual({ number: "205", total: 198 });
	});
	test("OCR confusions: O->0, l->1, S->5, B->8", () => {
		expect(parseNumberText("O86/l98")).toEqual({ number: "86", total: 198 });
		expect(parseNumberText("S1/B2")).toEqual({ number: "51", total: 82 });
	});
	test("promo without total", () => {
		expect(parseNumberText("SWSH123")).toEqual({ number: "SWSH123", total: null });
	});
	test("garbage returns null", () => {
		expect(parseNumberText("@@ ##")).toBeNull();
		expect(parseNumberText("")).toBeNull();
	});
	test("picks number/total out of surrounding OCR noise", () => {
		expect(parseNumberText("Illus. Kagemaru 086/198 ©2022")).toEqual({
			number: "86",
			total: 198,
		});
	});
});

describe("parseNameText", () => {
	test("strips non-letters noise and trims", () => {
		expect(parseNameText("  Pikachu ex |")).toBe("Pikachu ex");
	});
	test("null on empty/garbage", () => {
		expect(parseNameText("###")).toBeNull();
	});
});
```

- [ ] **Step 2: Run to verify failure** — `bun test src/store/scan/parse.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// src/store/scan/scan-types.ts
/** R2: what the number-strip OCR yields. total null = promo-style id. */
export interface NumberReading {
	number: string;
	total: number | null;
}

/** One candidate the matcher returns; score in [0,1]. */
export interface ScanCandidate {
	cardId: string;
	score: number;
}
```

```ts
// src/store/scan/parse.ts
import type { NumberReading } from "./scan-types";

// R2: OCR confusion map applied only inside numeric contexts.
const CONFUSIONS: Record<string, string> = { O: "0", o: "0", l: "1", I: "1", S: "5", s: "5", B: "8" };
const deconfuse = (s: string) => s.replace(/[OolISsB]/g, (c) => CONFUSIONS[c] ?? c);

/** Extract `{number,total}` from noisy number-strip OCR text (R2). */
export function parseNumberText(raw: string): NumberReading | null {
	const text = raw.trim();
	if (!text) return null;
	// Primary: N/T anywhere in the noise, after de-confusion.
	const frac = deconfuse(text).match(/(\d{1,3})\s*\/\s*(\d{1,3})/);
	if (frac) {
		return { number: String(Number(frac[1])), total: Number(frac[2]) };
	}
	// Promo ids: letters+digits token (e.g. SWSH123, SM210). No de-confusion:
	// the letter prefix is real. Require 2+ letters then 1+ digits.
	const promo = text.match(/\b([A-Z]{2,5}\d{1,3})\b/);
	if (promo) return { number: promo[1], total: null };
	return null;
}

/** Clean a name-strip OCR guess; null when nothing letter-like survives. */
export function parseNameText(raw: string): string | null {
	const cleaned = raw.replace(/[^\p{L}\p{N}'’.\- ]/gu, " ").replace(/\s+/g, " ").trim();
	return /\p{L}{3}/u.test(cleaned) ? cleaned : null;
}
```

- [ ] **Step 4: Run to green** — `bun test src/store/scan/parse.test.ts` → all pass.
- [ ] **Step 5: Lint + commit** — `bunx biome check --write src/store/scan/` then `git add src/store/scan/ && git commit -m "feat(scan): number/name OCR parsing (R2)"`.

---

### Task 2: Scan engine — `match.ts` (corpus candidate ranking)

**Files:**
- Create: `src/store/scan/match.ts`
- Test: `src/store/scan/match.test.ts`

**Interfaces:**
- Consumes: `CorpusCard` (`src/store/corpus/corpus-types.ts` — fields `id`, `name`, `number`, `setId`), `PokemonSet` (`src/server/card-mappers.ts` — fields `id`, `printedTotal?: number`, `total: number`), `normalize` + `editDistance` from `src/store/corpus/fuzzy.ts`, `NumberReading`/`ScanCandidate` from Task 1.
- Produces: `matchScan(input: { reading: NumberReading | null; nameText: string | null }, cards: CorpusCard[], sets: PokemonSet[]): ScanCandidate[]` — ranked, max 3, empty when nothing plausible.

- [ ] **Step 1: Write failing tests** — fixture corpus of 3 sets / 6 cards; cases: (a) `86/198` + name noise → right card first; (b) two sets share printedTotal 198, name breaks the tie; (c) secret `205/198` matches via printedTotal even though number > printedTotal; (d) promo `SWSH123` with `total: null` → name-only fuzzy path; (e) no reading + name only → fuzzy; (f) garbage → `[]`. Use the shapes below verbatim:

```ts
// src/store/scan/match.test.ts (core fixture shape)
const sets = [
	{ id: "swsh9", name: "Brilliant Stars", series: "SwSh", releaseDate: "2022-02-25", printedTotal: 172, total: 186, images: {} },
	{ id: "sv1", name: "Scarlet & Violet", series: "SV", releaseDate: "2023-03-31", printedTotal: 198, total: 258, images: {} },
	{ id: "sv2", name: "Paldea Evolved", series: "SV", releaseDate: "2023-06-09", printedTotal: 193, total: 279, images: {} },
] satisfies PokemonSet[];
const card = (id: string, name: string, number: string, setId: string): CorpusCard =>
	({ id, name, number, setId, imageUrl: "", imageUrlSmall: "", supertype: "Pokémon" });
const cards = [
	card("sv1-86", "Skiddo", "86", "sv1"),
	card("sv1-205", "Miraidon ex", "205", "sv1"),
	card("sv2-86", "Meowscarada", "86", "sv2"),
	card("swsh9-86", "Flittle", "86", "swsh9"),
	card("swsh9-p1", "Charizard", "SWSH123", "swsh9"),
];
```

- [ ] **Step 2: Verify failure.**
- [ ] **Step 3: Implement**

```ts
// src/store/scan/match.ts
import type { PokemonSet } from "@/server/card-mappers";
import type { CorpusCard } from "../corpus/corpus-types";
import { editDistance, normalize } from "../corpus/fuzzy";
import type { NumberReading, ScanCandidate } from "./scan-types";

const nameScore = (guess: string | null, cardName: string): number => {
	if (!guess) return 0.5; // unknown name neither helps nor hurts
	const a = normalize(guess);
	const b = normalize(cardName);
	if (!a || !b) return 0.5;
	const dist = editDistance(a, b);
	return Math.max(0, 1 - dist / Math.max(a.length, b.length));
};

/** R2: number+total primary key, name tiebreaker; name-only fallback. */
export function matchScan(
	input: { reading: NumberReading | null; nameText: string | null },
	cards: CorpusCard[],
	sets: PokemonSet[],
): ScanCandidate[] {
	const { reading, nameText } = input;
	let pool: CorpusCard[];
	if (reading?.total != null) {
		// Secret rares print number > printedTotal but keep the printed
		// denominator, so match the denominator against printedTotal (fall back
		// to total for sets without one).
		const setIds = new Set(
			sets.filter((s) => (s.printedTotal ?? s.total) === reading.total).map((s) => s.id),
		);
		const wanted = String(Number(reading.number)) === "NaN" ? reading.number : String(Number(reading.number));
		pool = cards.filter(
			(c) => setIds.has(c.setId) && String(Number(c.number) || c.number) === wanted,
		);
	} else if (reading) {
		// Promo id: exact number match anywhere (case-insensitive).
		const wanted = reading.number.toUpperCase();
		pool = cards.filter((c) => c.number.toUpperCase() === wanted);
	} else if (nameText) {
		pool = cards; // name-only fallback
	} else {
		return [];
	}
	const scored = pool
		.map((c) => ({ cardId: c.id, score: nameScore(nameText, c.name) }))
		.sort((x, y) => y.score - x.score)
		.slice(0, 3);
	// Name-only fallback demands real similarity; keyed matches tolerate weak names.
	const floor = reading ? 0.15 : 0.55;
	return scored.filter((c) => c.score >= floor);
}
```

- [ ] **Step 4: Green.** — `bun test src/store/scan/match.test.ts`
- [ ] **Step 5: Lint + commit** — `git commit -m "feat(scan): corpus candidate matching (R2)"`.

---

### Task 3: Scan engine — `vote.ts` (multi-frame consensus, R3)

**Files:**
- Create: `src/store/scan/vote.ts`
- Test: `src/store/scan/vote.test.ts`

**Interfaces:**
- Consumes: `NumberReading` (Task 1).
- Produces: `createVoter(agreeCount = 2)` returning `{ push(r: NumberReading | null): NumberReading | null; reset(): void }` — `push` returns the consensus reading once `agreeCount` consecutive-compatible readings agree, else null; a conflicting reading restarts the tally (card swapped).

- [ ] **Step 1: Failing tests** — cases: two agreeing pushes → consensus on 2nd; null pushes don't reset but don't count; conflicting reading resets tally and starts counting the new value; `reset()` clears; consensus repeats while readings persist (returns the reading again, UI dedupes).
- [ ] **Step 2: Verify failure.**
- [ ] **Step 3: Implement** — key = `` `${r.number}/${r.total}` ``; keep `{key, count, reading}`; on push: null → return null; same key → count+1; different → count=1 with new reading; return reading when `count >= agreeCount`.
- [ ] **Step 4: Green.**
- [ ] **Step 5: Lint + commit** — `git commit -m "feat(scan): multi-frame vote accumulator (R3)"`.

---

### Task 4: Guide geometry + camera hook + Tesseract wrapper

**Files:**
- Create: `src/components/scan/guide.ts`, `src/components/scan/guide.test.ts`, `src/components/scan/use-camera.ts`, `src/store/scan/ocr.ts`
- Modify: `package.json` (add `tesseract.js`)

**Interfaces:**
- Produces:
  - `guide.ts`: `interface Rect { x: number; y: number; w: number; h: number }`; `guideRect(viewW: number, viewH: number): Rect` (centered card outline, 63:88 aspect, 80% of the limiting dimension); `nameRegion(guide: Rect): Rect` (top 12% band, inset 8% horizontally); `numberRegion(guide: Rect): Rect` (bottom-left: x=guide.x+2%w, y=guide.y+90%h, w=45%w, h=8%h — covers both bottom corners is NOT needed; bottom-LEFT first, fall back full-width bottom band `numberRegionWide(guide)` = y+88%h, full w, 10%h).
  - `use-camera.ts`: `useCamera(): { videoRef, status: "idle"|"active"|"denied"|"unavailable", start(): Promise<void>, stop(): void, torch: { supported: boolean; on: boolean; toggle(): Promise<void> } }`. Stops tracks on unmount and on `visibilitychange` hidden. Rear camera via `facingMode: { ideal: "environment" }`.
  - `ocr.ts`: `getOcr(): Promise<{ recognizeNumber(c: HTMLCanvasElement): Promise<string>; recognizeName(c: HTMLCanvasElement): Promise<string> }>` — lazy `import("tesseract.js")`, one worker, `tessedit_char_whitelist: "0123456789/ABCDEFGHIJKLMNOPQRSTUVWXYZ"` for number pass (letters kept for promo ids), no whitelist for name pass. Memoized module-level promise. R4.
- Consumes: nothing from other tasks.

- [ ] **Step 1: Failing tests for `guide.ts` only** (pure math; camera/OCR are not unit-testable in happy-dom): landscape view centers card by height; portrait by width; regions sit inside the guide; wide fallback spans full width.
- [ ] **Step 2: Verify failure.**
- [ ] **Step 3: Implement `guide.ts`; `bun add tesseract.js`; implement `ocr.ts` + `use-camera.ts`.** Note: verify installed tesseract.js major version's API (`createWorker` signature) against `node_modules/tesseract.js/README.md` before writing `ocr.ts`; adapt if v6 differs from v5 (`createWorker("eng")` then `setParameters`).
- [ ] **Step 4: Green** (`bun test src/components/scan/guide.test.ts`) + `bunx tsc -b --force` exit 0.
- [ ] **Step 5: Commit incl. lockfile** — `git add src/components/scan/ src/store/scan/ocr.ts package.json bun.lock && git commit -m "feat(scan): guide geometry, camera hook, lazy Tesseract wrapper (R1,R4)"`.

---

### Task 5: `/scan` route — live loop, tray, quick-add, fixture capture

**Files:**
- Create: `src/routes/scan.tsx`, `src/components/scan/scan-view.tsx`, `src/components/scan/candidate-tray.tsx`, `src/components/scan/fixture-capture.ts`
- Test: `src/components/scan/candidate-tray.test.tsx`

**Interfaces:**
- Consumes: Tasks 1–4 exports; `useEnsureCorpus()` (see `src/components/vault/owned-cards-grid.tsx` for usage pattern); corpus runtime index + sets (read how `owned-cards-grid` obtains them); `hydrateCard`/`setsById` from `src/store/corpus/corpus-engine.ts`; `addStack(cardId, fields?)` from `src/store/userland/userland-store.ts`; `notifyLocalWrite()` same module; toast via the app's existing toast util (grep `sonner`/`toast(` and follow).
- Produces: route `/scan`; `<CandidateTray candidates={ScanCandidate[]} onAdd={(cardId, quantity) => void} />`.

- [ ] **Step 1: Failing test for `candidate-tray.tsx`** — pre-seed corpus (`useCorpusRuntime.setState({ index: buildIndex([...fixture cards]) })` per Global Constraints), render with two candidates, assert thumbs render and tapping one then confirming quantity calls `onAdd("sv1-86", 1)`.
- [ ] **Step 2: Verify failure.**
- [ ] **Step 3: Implement.** Structure:
  - `scan.tsx`: route shell; `useEnsureCorpus()`; renders `<ScanView/>` behind a `React.lazy`/dynamic import so Tesseract never loads elsewhere. Cold-load safe.
  - `scan-view.tsx`: video + guide overlay (absolutely positioned rounded outline, `border-white/40`, dimmed surround); loop = `setInterval` 500ms (cleared on unmount): draw video → crop `numberRegion` (retry `numberRegionWide` when parse null) + `nameRegion` to offscreen canvases (grayscale via `ctx.filter = "grayscale(1) contrast(1.6)"`) → `getOcr()` passes → `parseNumberText`/`parseNameText` → `voter.push` → on consensus `matchScan` → tray. Copy block (R7): "Scanning happens on your device. Photos never leave it." Session count chip; hint chip after ~6s without consensus ("More light. Fill the frame."); manual search link prefilled with last name guess (existing search route query param — grep how search links are built). File-upload fallback when `status !== "active"`: `<input type="file" accept="image/*" capture="environment">` → same pipeline on the still.
  - `candidate-tray.tsx`: thumbs via hydrated cards; tap → quantity stepper (default 1) + confirm → `onAdd` → parent calls `await addStack(cardId, { quantity })` (omit quantity field when 1; check `EditableStackFields` in `src/store/userland/types.ts` for the exact field name before writing) then `notifyLocalWrite()` + toast + `voter.reset()`.
  - `fixture-capture.ts` (R10): gated on `import.meta.env.VITE_CLAUDE_PREVIEW === "true" || import.meta.env.DEV`; button dumps full frame + both crops as PNG downloads named `fixture-<ts>-{full,number,name}.png`.
- [ ] **Step 4: Green** — tray test + `bunx tsc -b --force`.
- [ ] **Step 5: Boot `bun run dev`, verify `/scan` renders (routeTree regenerates on boot), camera prompt appears or fallback shows. Commit** — `git commit -m "feat(scan): /scan route with guided-frame OCR loop and quick-add (R1,R3,R7,R10)"`.

---

### Task 6: `/api/scan` — entitlement-gated vision handler (R5, R6)

**Files:**
- Create: `src/lib/scan/scan-handler.ts`, `src/lib/scan/scan-handler.test.ts`, `src/routes/api/scan.ts`
- Modify: `package.json` (add `@anthropic-ai/sdk`)

**Interfaces:**
- Consumes: `getServerClient()` from `src/lib/supabase/server.ts` (cookie-bridged user client; `.auth.getUser()`, `.rpc("is_pro_self")`); `isCloudEnabled()` from `src/lib/supabase/client.ts`; route-file pattern from `src/routes/api/health.ts`.
- Produces: `interface ScanDeps { cloudEnabled(): boolean; getUser(): Promise<{ id: string } | null>; isEntitled(): Promise<boolean>; vision(imageBase64: string): Promise<AiScanResult> }`; `interface AiScanResult { name: string; number: string; setTotal: number | null; language: string; confidence: number }`; `handleScan(req: Request, deps?: ScanDeps): Promise<Response>`; `realVision()` built on `@anthropic-ai/sdk`.

- [ ] **Step 1: Failing DI tests** — cases: `ANTHROPIC_API_KEY` unset → 503 `{"error":"scan not configured"}`; cloud enabled + no user → 401; cloud enabled + user + not entitled → 403 `{"error":"needs_plus"}`; cloud DISABLED (self-host) → skips auth/entitlement entirely and calls vision (R5 open-core: no cloud = no accounts = operator's own key, everyone entitled); happy path returns vision JSON; oversized body (>1.5MB base64) → 413; vision throws → 502 terse body and `console.error` forensic line WITHOUT the image payload.
- [ ] **Step 2: Verify failure.**
- [ ] **Step 3: Implement.**

```ts
// src/lib/scan/scan-handler.ts (core shape)
const SCHEMA = {
	type: "object",
	additionalProperties: false,
	required: ["name", "number", "setTotal", "language", "confidence"],
	properties: {
		name: { type: "string" },
		number: { type: "string" },
		setTotal: { type: ["integer", "null"] },
		language: { type: "string" },
		confidence: { type: "number" },
	},
} as const;

export function realVision() {
	return async (imageBase64: string): Promise<AiScanResult> => {
		const { default: Anthropic } = await import("@anthropic-ai/sdk");
		const client = new Anthropic(); // ANTHROPIC_API_KEY from env
		const model = process.env.SCAN_MODEL || "claude-haiku-4-5"; // R6
		const response = await client.messages.create({
			model,
			max_tokens: 300,
			output_config: { format: { type: "json_schema", schema: SCHEMA } },
			messages: [{
				role: "user",
				content: [
					{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: imageBase64 } },
					{ type: "text", text: "Identify this Pokémon trading card. Return the card name exactly as printed, the collector number (numerator only, e.g. \"86\" from \"086/198\", or the full promo id like \"SWSH123\"), the printed set total as an integer (null if none is printed), the card language as a BCP-47-ish code (en, ja, fr...), and your confidence 0-1." },
				],
			}],
		});
		const text = response.content.find((b) => b.type === "text");
		if (!text || text.type !== "text") throw new Error("no text block");
		return JSON.parse(text.text) as AiScanResult;
	};
}
```

  Handler: parse `{ imageBase64 }` JSON body; size guard; `deps.cloudEnabled()` false → straight to vision; else `getUser()` → 401, `isEntitled()` (rpc `is_pro_self` returns boolean) → 403. Real deps built lazily inside the route handler (never at module top level — SSR import cost). Route file mirrors `api/health.ts` (`createFileRoute("/api/scan")`, `server.handlers.POST`).
- [ ] **Step 4: Green** — `bun test src/lib/scan/ && bunx tsc -b --force`.
- [ ] **Step 5: Commit incl. lockfile** — `git commit -m "feat(scan): /api/scan entitlement-gated vision handler (R5,R6)"`.

---

### Task 7: AI scan client integration

**Files:**
- Modify: `src/components/scan/scan-view.tsx`
- Create: `src/components/scan/use-ai-scan.ts`, `src/components/scan/use-ai-scan.test.ts`

**Interfaces:**
- Consumes: `/api/scan` contract (Task 6), `matchScan` (Task 2), `useBilling()` from `src/lib/billing/use-billing.ts` (entitlement for UI state only, render-only per R15 convention), guide crop canvases (Task 4/5).
- Produces: `useAiScan(): { run(frameJpegBase64: string): Promise<ScanCandidate[]>, state: "idle"|"loading"|"error"|"unauthorized"|"needs_plus" }` — maps vision result through `matchScan` (`{ reading: { number, total: setTotal }, nameText: name }`).

- [ ] **Step 1: Failing hook tests** — mock `fetch` (spyOn): 200 → candidates via matchScan against pre-seeded fixture corpus; 401 → state `unauthorized`; 403 → `needs_plus`; 500 → `error`.
- [ ] **Step 2: Verify failure.**
- [ ] **Step 3: Implement + wire into `scan-view.tsx`:** "AI scan" pill button captures the current guide crop as JPEG (quality 0.8) base64. Free/lapsed users see the button with a violet "Plus" chip; tapping it in `needs_plus`/`unauthorized` state routes to `/billing` (Link). Disclosure line under the button: "AI scan sends this one photo to the server." Errors fall back silently to the device loop plus a toast.
- [ ] **Step 4: Green + tsc.**
- [ ] **Step 5: Commit** — `git commit -m "feat(scan): Plus AI scan client flow with disclosure and fallbacks (R6,R7)"`.

---

### Task 8: Entry points, nginx, docs

**Files:**
- Modify: `src/components/shell/command-palette-data.ts` (add Scan cards entry → `/scan`; follow the file's existing entry shape), the Vault hub page (grep `routes/vault.tsx` for the CTA/actions block; add a "Scan cards" action), sidebar nav (where /billing and vault links live in `src/components/shell/` — follow existing item shape), `deploy/nginx/tcg.conf` (add `location /api/scan { ... }` copying the `/api/stripe/` block, same `limit_req zone=stripe`), `deploy/DEPLOY.md` (env table: `ANTHROPIC_API_KEY` server-only secret, `SCAN_MODEL` optional default `claude-haiku-4-5`; one runbook line: /api/scan 503 = key missing, R6/R8), `docs/improve/plans/007-user-launch-checklist.md` (§D.2 add the two vars; §A.3 ToS note: AI-scan fair use line).
- Test: none new (config/docs + trivial UI wiring); existing suites must stay green.

- [ ] **Step 1: Implement all wiring above.**
- [ ] **Step 2: Full gates** — `bun test` (full suite, twice) + `bunx tsc -b --force` + `bunx biome check --write` on touched files.
- [ ] **Step 3: Commit** — `git commit -m "feat(scan): entry points, rate limit, env docs (R8)"`.

---

### Task 9 (owner-in-loop, after UI boots): fixture session + accuracy pass

Not an agent task until fixtures exist. Owner shoots ~15 cards via the R10 capture button (holos, sleeved, vintage, JP, promo, dim). Then: add fixtures under `src/store/scan/__fixtures__/`, extend `parse.test.ts` with real OCR outputs (run OCR once, snapshot the raw text), tune the confusion map/regions, document accuracy notes in the spec. Blocked-on-owner; tracked, not scheduled.

## Self-review notes

- Spec coverage: R1 (T4/T5), R2 (T1/T2), R3 (T3), R4 (T4), R5/R6 (T6), R7 (T5/T7), R8 (T8), R9 (T2 digit matching is region-agnostic by construction; copy in T5), R10 (T5 + T9). Env table (T8). All covered.
- Type consistency: `NumberReading`/`ScanCandidate` defined once (T1) and consumed by T2/T3/T5/T7; `AiScanResult.setTotal` maps to `NumberReading.total` explicitly in T7.
- No placeholders: every code step shows real code or names the exact source file whose pattern to copy.

## Recorded deviations (final review)

- Quick-add (`candidate-tray.tsx`) ships quantity only; there is no variant field, unlike the spec §2 prose ("variant, quantity; sane defaults").
- There is no batch summary screen when the user is done scanning; only the running session-count chip (`scan-view.tsx`).
- AI scan 401 routes the button to `/billing` (same as `needs_plus`), not a sign-in prompt as the spec's error-handling table states.
