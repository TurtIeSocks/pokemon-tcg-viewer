# Liquid Glass Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply one cohesive, token-governed visual language (violet "Liquid Glass") across the whole app — fusing Ethereal Glass chrome with content-derived Liquid Glass hero objects.

**Architecture:** A single token layer in `src/app.css` (`:root` primitives + Tailwind v4 `@theme inline`) is the source of truth; shadcn semantic vars are re-pointed to it. Shared glass/motion components are built once, then composed across every surface. The shell adopts shadcn `sidebar-04` (inset), re-skinned to glass. The holo-foil engine is left intact; only its frame is aligned.

**Tech Stack:** React 19 + TanStack Start, Tailwind v4 (`@tailwindcss/vite`, no config file — theme in `app.css`), shadcn `new-york` + Radix + CVA, Bun test (happy-dom + fake-indexeddb), biome, self-hosted woff2 fonts.

**Spec:** `docs/superpowers/specs/2026-06-03-liquid-glass-redesign-design.md` (authoritative — token values, glass recipes, per-surface plan, risks). **Visual targets:** mocks in `.superpowers/brainstorm/85187-1780513603/content/` (`vault-hub`, `sidebar-inset`, `card-manage`, `accent`, `palette`, `fonts`).

**Branch:** `redesign/liquid-glass-system` (already created; spec committed at `a335ade`).

**TDD note for this plan:** "Write the failing test" applies to logic-bearing units (e.g. `ProgressRing` math, className contracts that other code/tests depend on). For pure-CSS/JSX restyles, the verification step is **preview the surface and compare to the named mock** (use the preview tools; screenshot proof), plus the green-bar trio (`tsc -b`, `bun test`, `biome`). Do not invent CSS unit tests — happy-dom computed-style reads of custom properties are unreliable.

**Global commands (run in parallel where noted):**
- Typecheck: `bunx tsc -b`
- Tests: `bun test` (or a single file: `bun test src/path/foo.test.ts`)
- Lint: `bunx biome check --write <explicit paths>` (NOT `bun run lint` — fails on nested worktree `biome.json`)
- Dev preview: `bun run dev` (port 6201) — use the preview_* tools, never manual "please check"

---

## Task 0: Pre-flight baseline

**Files:** none (verification only)

- [ ] **Step 1: Confirm branch + clean tree**

Run: `git rev-parse --abbrev-ref HEAD && git status --short`
Expected: `redesign/liquid-glass-system`; no unexpected tracked changes (the gitignored `.superpowers/` and the spec are fine).

- [ ] **Step 2: Capture a green baseline (parallel)**

Run (one batch): `bunx tsc -b` · `bun test` · `bunx biome check src`
Expected: all green. If anything is red **before** you start, note it — it is pre-existing, not your regression.

- [ ] **Step 3: Locate the self-hosted fonts directory**

Run: `git ls-files | grep -iE '\.woff2?$' | head` and `grep -rn "@font-face" src/app.css`
Expected: find where Newsreader/JetBrains Mono woff2 live (e.g. `public/fonts/` or `src/assets/fonts/`) and how `@font-face` references them. **You will mirror this exact pattern** for the new fonts. Record the directory.

---

## Phase 0 — Foundation: tokens + fonts

> When Phase 0 lands, the whole app shifts to the violet system with no structural change. This is the highest-leverage phase; get the token values exact (spec §4).

### Task 0.1: Self-host the three fonts

**Files:**
- Create: `<fonts-dir>/ClashDisplay-Medium.woff2`, `ClashDisplay-Semibold.woff2`
- Create: `<fonts-dir>/SpaceGrotesk-{Regular,Medium,SemiBold,Bold}.woff2`
- Create: `<fonts-dir>/GeistMono-{Regular,Medium}.woff2`
- Modify: `src/app.css` (`@font-face` blocks)

- [ ] **Step 1: Fetch the woff2 files**

Sources (download, then place in `<fonts-dir>` from Task 0 Step 3):
- **Clash Display** — https://www.fontshare.com/fonts/clash-display (ITF Free License). Need weights 500 + 600.
- **Space Grotesk** — https://fonts.google.com/specimen/Space+Grotesk (OFL). Weights 400/500/600/700.
- **Geist Mono** — https://github.com/vercel/geist-font/releases (OFL). Weights 400/500.

Record the license note in a comment (Clash is ITF-Free; document it in `app.css`).

- [ ] **Step 2: Replace the `@font-face` blocks in `app.css`**

Read `src/app.css` first. **Remove** the Newsreader + JetBrains Mono `@font-face` blocks. Add (adjust `url()` to your fonts dir; `font-display: swap`):

```css
/* Clash Display — display/hero only. Fontshare, ITF Free License. */
@font-face { font-family:"Clash Display"; src:url("/fonts/ClashDisplay-Medium.woff2") format("woff2"); font-weight:500; font-style:normal; font-display:swap; }
@font-face { font-family:"Clash Display"; src:url("/fonts/ClashDisplay-Semibold.woff2") format("woff2"); font-weight:600; font-style:normal; font-display:swap; }
/* Space Grotesk — UI/body. OFL. */
@font-face { font-family:"Space Grotesk"; src:url("/fonts/SpaceGrotesk-Regular.woff2") format("woff2"); font-weight:400; font-style:normal; font-display:swap; }
@font-face { font-family:"Space Grotesk"; src:url("/fonts/SpaceGrotesk-Medium.woff2") format("woff2"); font-weight:500; font-style:normal; font-display:swap; }
@font-face { font-family:"Space Grotesk"; src:url("/fonts/SpaceGrotesk-SemiBold.woff2") format("woff2"); font-weight:600; font-style:normal; font-display:swap; }
@font-face { font-family:"Space Grotesk"; src:url("/fonts/SpaceGrotesk-Bold.woff2") format("woff2"); font-weight:700; font-style:normal; font-display:swap; }
/* Geist Mono — data/numbers. OFL. */
@font-face { font-family:"Geist Mono"; src:url("/fonts/GeistMono-Regular.woff2") format("woff2"); font-weight:400; font-style:normal; font-display:swap; }
@font-face { font-family:"Geist Mono"; src:url("/fonts/GeistMono-Medium.woff2") format("woff2"); font-weight:500; font-style:normal; font-display:swap; }
```

- [ ] **Step 3: Verify the dev server serves the fonts**

Start preview (`preview_start`), load `/`, then `preview_network` — confirm the woff2 requests return 200 (not 404). Fix paths if any 404.

- [ ] **Step 4: Commit**

```bash
git add <fonts-dir> src/app.css
git commit -m "feat(design): self-host Clash Display + Space Grotesk + Geist Mono; retire Newsreader + JetBrains Mono"
```

### Task 0.2: Install the violet token layer

**Files:**
- Modify: `src/app.css` (`:root` tokens + `@theme inline` + shadcn semantic var re-point)

- [ ] **Step 1: Read `src/app.css`** and identify (a) the `:root` block with the old oklch tokens (`--background`, `--primary`, `--accent`, `--radius`, `--sidebar-*`, etc.), (b) the `@theme inline` block mapping `--color-*`.

- [ ] **Step 2: Replace the `:root` primitives** with the violet system (spec §4 — exact values):

```css
:root {
  /* surfaces */
  --canvas:  oklch(0.12  0.012 290);
  --bg:      oklch(0.175 0.017 290);
  --card:    oklch(1 0 0 / 0.045);
  --card-2:  oklch(1 0 0 / 0.07);
  /* text */
  --ink:   oklch(0.97 0.006 290);
  --muted: oklch(0.71 0.016 290);
  --faint: oklch(0.57 0.018 290);
  /* accent (violet) */
  --primary:        oklch(0.70 0.19 295);
  --primary-strong: oklch(0.79 0.15 295);
  --primary-ink:    oklch(0.16 0.03 295);
  --primary-wash:   oklch(0.70 0.19 295 / 0.18);
  /* signals */
  --success: oklch(0.78 0.15 162);
  --warning: oklch(0.82 0.13 78);
  --danger:  oklch(0.70 0.19 18);
  /* lines + shape */
  --border:   oklch(1 0 0 / 0.09);
  --hairline: oklch(1 0 0 / 0.06);
  --r-panel: 18px; --r-control: 12px; --r-pill: 999px;
  --radius: 1rem; /* shadcn base — derived sm/md/lg/xl land near 12/14/16/20 */
  /* elevation */
  --shadow:      0 24px 60px -24px oklch(0 0 0 / 0.7),  inset 0 1px 0 oklch(1 0 0 / 0.09);
  --shadow-lift: 0 32px 80px -28px oklch(0 0 0 / 0.85), 0 0 0 1px var(--primary-wash), inset 0 1px 0 oklch(1 0 0 / 0.12);
  /* motion */
  --ease:        cubic-bezier(0.32, 0.72, 0, 1);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  /* ambient mesh */
  --ambient:
    radial-gradient(60% 50% at 14% 0%,   oklch(0.70 0.19 295 / 0.15), transparent 70%),
    radial-gradient(50% 45% at 96% 6%,   oklch(0.62 0.16 320 / 0.11), transparent 70%),
    radial-gradient(55% 55% at 80% 100%, oklch(0.58 0.14 270 / 0.09), transparent 70%);
}
```

- [ ] **Step 3: Re-point the shadcn semantic vars** (so every existing `bg-background`, `text-primary`, `border-border`, etc. inherits the new system). In the same `:root`, set:

```css
:root {
  --background: var(--canvas);
  --foreground: var(--ink);
  --card-foreground: var(--ink);
  --popover: var(--bg);
  --popover-foreground: var(--ink);
  --primary-foreground: var(--primary-ink);
  --secondary: oklch(1 0 0 / 0.06);
  --secondary-foreground: var(--ink);
  --muted-foreground: var(--muted);
  --accent: var(--primary);          /* cyan retired → violet (auto-fixes set-tile ring) */
  --accent-foreground: var(--primary-ink);
  --destructive: var(--danger);
  --input: var(--border);
  --ring: var(--primary);
  /* --card and --primary already defined above (glass fill / violet) */
}
```

Note: `--card` is the glass fill (`oklch(1 0 0 / 0.045)`); shadcn's `bg-card` becomes translucent glass — intended. If a specific surface needs an opaque card, it uses `--bg`.

- [ ] **Step 4: Map fonts + key tokens in `@theme inline`**

```css
@theme inline {
  --font-display: "Clash Display", system-ui, sans-serif;
  --font-sans:    "Space Grotesk", system-ui, sans-serif;
  --font-mono:    "Geist Mono", ui-monospace, monospace;
  --color-success: var(--success);
  --color-warning: var(--warning);
  --color-danger:  var(--danger);
  /* keep existing --color-* → --background/--primary/etc. mappings */
}
```

- [ ] **Step 5: Verify build + typecheck (parallel)**

Run: `bunx tsc -b` · `bunx biome check --write src/app.css`
Expected: green. **happy-dom guard:** confirm no token is self-referential (`--x: var(--x, …)`) — that hangs `bun test` (CLAUDE.md). Then run `bun test` and confirm it doesn't hang.

- [ ] **Step 6: Commit**

```bash
git add src/app.css
git commit -m "feat(design): violet Liquid Glass token system; re-point shadcn semantic vars"
```

### Task 0.3: Body base + ambient mesh + default fonts

**Files:**
- Modify: `src/app.css` (base layer)

- [ ] **Step 1:** In the base layer, set the body font + a fixed ambient mesh that never repaints on scroll:

```css
body {
  font-family: var(--font-sans);
  background: var(--canvas);
  color: var(--ink);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
  min-height: 100dvh;
  line-height: 1.5;
}
body::before { content:""; position:fixed; inset:0; z-index:0; pointer-events:none; background: var(--ambient); }
```

Ensure app content sits in a `position: relative; z-index: 1` container so the mesh stays behind it (the root layout, Task 2.3, handles this).

- [ ] **Step 2: Preview proof.** `preview_start`, load `/`, `preview_screenshot`. Expect: violet-tinted dark canvas with ambient glow, Space Grotesk body text. Numbers not yet mono (that's per-component).

- [ ] **Step 3: Fix className-assertion test breakage.** Run `bun test`. Any test asserting old colors/classes (e.g. a `--accent` cyan, a gold ring, the `rgba(120,100,255)` toggle) may fail. Grep for such asserts: `grep -rn "e0b341\|120,100,255\|0.72 0.14 200" src`. Update those assertions to the new contract. Re-run `bun test` green.

- [ ] **Step 4: Commit**

```bash
git add src/app.css <any updated test files>
git commit -m "feat(design): ambient mesh + Space Grotesk body base"
```

**✅ Phase 0 checkpoint:** App is fully violet. `tsc -b`, `bun test`, `biome` green. Screenshot `/` and one vault route to confirm no broken contrast. Do not proceed until green.

---

## Phase 1 — Primitives + shared components

> Build the reusable glass/motion vocabulary once. Per the user's CLAUDE.md: pre-extract non-component exports to sibling files to avoid `react-refresh/only-export-components`.

### Task 1.1: Extract `ProgressRing` (with real test)

**Files:**
- Create: `src/components/ui/progress-ring.tsx`
- Create: `src/components/ui/progress-ring.test.tsx`
- Modify: `src/components/shell/set-tile.tsx` (import the extracted ring)

- [ ] **Step 1: Write the failing test** (the pct→dashoffset math is the logic worth locking):

```tsx
import { render } from "@testing-library/react";
import { ProgressRing } from "./progress-ring";

test("ProgressRing maps pct to stroke-dashoffset (0% = full circumference, 100% = 0)", () => {
  const { container, rerender } = render(<ProgressRing pct={0} />);
  const arc = container.querySelectorAll("circle")[1];
  const circ = Number(arc.getAttribute("stroke-dasharray"));
  expect(Number(arc.getAttribute("stroke-dashoffset"))).toBeCloseTo(circ); // empty
  rerender(<ProgressRing pct={100} />);
  expect(Number(arc.getAttribute("stroke-dashoffset"))).toBeCloseTo(0);     // full
});

test("ProgressRing clamps out-of-range pct", () => {
  const { container } = render(<ProgressRing pct={250} />);
  const arc = container.querySelectorAll("circle")[1];
  expect(Number(arc.getAttribute("stroke-dashoffset"))).toBeCloseTo(0);
});
```

- [ ] **Step 2: Run it, verify it fails** — `bun test src/components/ui/progress-ring.test.tsx` → FAIL (module not found).

- [ ] **Step 3: Implement** (lift the ring out of `set-tile.tsx`; default stroke `var(--primary)`, size/stroke props):

```tsx
import type { ReactNode } from "react";

export function ProgressRing({ pct, size = 46, stroke = 4, children }:
  { pct: number; size?: number; stroke?: number; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(100, Math.max(0, pct)) / 100);
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx={size/2} cy={size/2} r={r} fill="none" strokeWidth={stroke} className="stroke-white/15" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset}
          className="stroke-(--primary) transition-[stroke-dashoffset] duration-500 ease-out" />
      </svg>
      <span className="relative z-10 flex items-center justify-center">{children}</span>
    </span>
  );
}
```

- [ ] **Step 4: Run test → PASS.** `bun test src/components/ui/progress-ring.test.tsx`.

- [ ] **Step 5: Refactor `set-tile.tsx`** to import `ProgressRing` and delete its inline copy. The stroke is now `var(--primary)` (violet) instead of `var(--accent,#e0b341)` — this is the ring gold→violet change. Run `bun test` (set-tile tests still pass) + `bunx tsc -b`.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/progress-ring.tsx src/components/ui/progress-ring.test.tsx src/components/shell/set-tile.tsx
git commit -m "refactor(design): extract ProgressRing; set-tile ring → violet"
```

### Task 1.2: `GlassPanel` + `BezelPanel`

**Files:**
- Create: `src/components/ui/glass.tsx`
- Create: `src/components/ui/glass.test.tsx`

- [ ] **Step 1: Failing test** (className contract — other surfaces depend on it):

```tsx
import { render } from "@testing-library/react";
import { GlassPanel, BezelPanel } from "./glass";

test("GlassPanel renders children and the glass surface classes", () => {
  const { getByText, container } = render(<GlassPanel>hi</GlassPanel>);
  getByText("hi");
  expect(container.firstChild).toHaveClass("backdrop-blur-xl");
});
test("BezelPanel nests a core", () => {
  const { getByText } = render(<BezelPanel>core</BezelPanel>);
  getByText("core");
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** (use `cn` from `@/lib/utils`; `interactive` adds hover lift; all motion `motion-reduce`-guarded):

```tsx
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function GlassPanel({ className, interactive, ...props }:
  ComponentProps<"div"> & { interactive?: boolean }) {
  return <div className={cn(
    "rounded-(--r-panel) border border-(--border) bg-(--card) backdrop-blur-xl",
    "shadow-(--shadow)",
    interactive && "transition-[transform,box-shadow,border-color] duration-300 ease-(--ease) hover:-translate-y-1 hover:shadow-(--shadow-lift) hover:border-[color-mix(in_oklch,var(--primary)_45%,var(--border))] motion-reduce:transition-none motion-reduce:hover:translate-y-0",
    className)} {...props} />;
}

export function BezelPanel({ className, children, ...props }: ComponentProps<"div">) {
  return (
    <div className={cn("rounded-[calc(var(--r-panel)+6px)] border border-(--hairline) bg-white/4 p-1.5 backdrop-blur-xl", className)} {...props}>
      <div className="rounded-(--r-panel) bg-(--bg) p-5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.10)]">{children}</div>
    </div>
  );
}
```

- [ ] **Step 4: Run → PASS.** Then `bunx biome check --write src/components/ui/glass.tsx`.

- [ ] **Step 5: Commit** `git commit -m "feat(design): GlassPanel + BezelPanel"`

### Task 1.3: `Eyebrow` + `Stat`

**Files:** Create `src/components/ui/eyebrow.tsx`, `src/components/ui/stat.tsx` (+ a shared `stat.test.tsx`).

- [ ] **Step 1: Failing test** for `Stat` (renders mono value + label):

```tsx
import { render } from "@testing-library/react";
import { Stat } from "./stat";
test("Stat shows value and label", () => {
  const { getByText } = render(<Stat value="1,248" label="owned" />);
  getByText("1,248"); getByText("owned");
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement.**

```tsx
// stat.tsx
export function Stat({ value, label, tone }: { value: string; label: string; tone?: "up" }) {
  return (
    <div>
      <div className={`font-mono text-2xl font-medium tabular-nums ${tone === "up" ? "text-(--success)" : "text-(--ink)"}`}>{value}</div>
      <div className="mt-0.5 text-[11px] uppercase tracking-wide text-(--faint)">{label}</div>
    </div>
  );
}
// eyebrow.tsx
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
export function Eyebrow({ className, ...p }: ComponentProps<"span">) {
  return <span className={cn("inline-block rounded-full border border-(--border) bg-(--primary-wash) px-[11px] py-[5px] text-[10.5px] font-semibold uppercase tracking-[0.22em] text-(--primary)", className)} {...p} />;
}
```

- [ ] **Step 4: Run → PASS.** Lint. **Step 5: Commit** `git commit -m "feat(design): Eyebrow + Stat primitives"`

### Task 1.4: Motion primitives — `Stagger`, `Sheen`, shimmer skeleton

**Files:** Create `src/components/ui/motion.tsx`; Modify `src/app.css` (keyframes + `.stagger`/`.skel` utilities).

- [ ] **Step 1:** Add to `app.css` (all reduced-motion guarded — spec §7):

```css
@keyframes lg-rise { to { opacity:1; transform:none; filter:blur(0); } }
@keyframes lg-shimmer { 100% { transform: translateX(100%); } }
.stagger > * { opacity:0; transform:translateY(18px); filter:blur(6px); animation: lg-rise .8s var(--ease) forwards; }
.stagger > *:nth-child(1){animation-delay:.04s} .stagger > *:nth-child(2){animation-delay:.12s}
.stagger > *:nth-child(3){animation-delay:.20s} .stagger > *:nth-child(4){animation-delay:.28s}
.stagger > *:nth-child(5){animation-delay:.36s} .stagger > *:nth-child(6){animation-delay:.44s}
.skel { position:relative; overflow:hidden; background: var(--card-2); border-radius: 8px; }
.skel::after { content:""; position:absolute; inset:0; transform:translateX(-100%);
  background: linear-gradient(90deg, transparent, var(--primary-wash), transparent); animation: lg-shimmer 1.8s var(--ease) infinite; }
@media (prefers-reduced-motion: reduce){ .stagger > *{opacity:1;transform:none;filter:none;animation:none} .skel::after{animation:none} }
```

- [ ] **Step 2:** Implement `Sheen` + `Stagger` wrappers:

```tsx
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
export function Stagger({ className, ...p }: ComponentProps<"div">) { return <div className={cn("stagger", className)} {...p} />; }
export function Sheen() {
  return <span aria-hidden className="pointer-events-none absolute inset-0 -translate-x-full bg-linear-to-r from-transparent via-white/15 to-transparent transition-transform duration-700 ease-(--ease) group-hover:translate-x-full motion-reduce:hidden" />;
}
```

- [ ] **Step 3:** Re-skin `ui/skeleton.tsx` to use the `.skel` class. Run `bun test` (skeleton tests, if any) + lint. **Step 4: Commit** `git commit -m "feat(design): motion primitives — Stagger, Sheen, shimmer skeleton"`

### Task 1.5: Re-skin `ui/button`

**Files:** Modify `src/components/ui/button.tsx` (+ update any test asserting old variant classes).

- [ ] **Step 1:** Update the CVA `buttonVariants`: base → `rounded-(--r-pill) font-medium`; `default` → `bg-(--primary) text-(--primary-ink) hover:bg-(--primary-strong) shadow-[0_10px_26px_-10px_var(--primary)]`; add `soft` → `bg-(--primary-wash) text-(--primary)`; `ghost` → `bg-white/5 text-(--ink) border border-(--border) hover:bg-white/9`; `outline`/`secondary`/`destructive` mapped to tokens. Keep sizes. Active press: `active:scale-[0.975] transition-transform`.

- [ ] **Step 2:** If a test asserts old button classes, update it to the new contract. Run `bun test` for button.

- [ ] **Step 3:** Preview a button (any route with a CTA) → `preview_screenshot`; compare to the pill buttons in the `accent` mock. **Step 4: Commit** `git commit -m "feat(design): pill button variants on tokens"`

### Task 1.6: Re-skin remaining primitives (grouped)

**Files (modify):** `ui/badge.tsx`, `ui/input.tsx`, `ui/textarea.tsx`, `ui/select.tsx`, `ui/switch.tsx`, `ui/dialog.tsx`, `ui/sheet.tsx`, `ui/popover.tsx`, `ui/dropdown-menu.tsx`, `ui/command.tsx`, `ui/tooltip.tsx`, `ui/separator.tsx`, `ui/scroll-area.tsx`, `ui/progress-bar.tsx`.

Apply the token contract (one small commit per 2-3 files; preview the `card-manage` mock as the form reference):
- **badge:** `default` → `bg-(--primary-wash) text-(--primary)`; add `success/warning/danger` wash variants (`color-mix(in oklch, var(--success) 18%, transparent)` etc.); rounded-full.
- **input/textarea:** `bg-white/4 border-(--border) rounded-(--r-control)`; focus → `border-(--primary) shadow-[0_0_0_3px_var(--primary-wash)]`; placeholder `text-(--faint)`.
- **select/dropdown/popover/command/tooltip:** panels → `bg-(--bg)/95 border-(--border) backdrop-blur-xl rounded-(--r-control)`; active item → `bg-(--primary-wash) text-(--ink)`.
- **switch:** checked track → `bg-(--primary)`.
- **dialog/sheet:** content → `GlassPanel`-style (glass + `--shadow`); overlay → `bg-black/60 backdrop-blur-sm`.
- **progress-bar:** fill → `bg-linear-to-r from-(--primary) to-(--primary-strong)`; track → `bg-white/8`.

- [ ] **Step 1–N:** For each group: edit → update any class-asserting test → `bun test` + `biome` → `preview_screenshot` a surface that uses it → commit (`feat(design): re-skin <components>`).

**✅ Phase 1 checkpoint:** Build a throwaway "kitchen-sink" preview (or use an existing dense route like card-manage) and screenshot every primitive. Parallel green: `tsc -b` · `bun test` · `biome`. The component vocabulary now matches the mocks.

---

## Phase 2 — Shell: shadcn `sidebar-04` (inset), re-skinned

### Task 2.1: Install the block

**Files:** Created by the CLI — `src/components/ui/sidebar.tsx` (+ it may add `use-mobile`, `skeleton`, etc. if missing).

- [ ] **Step 1:** Run `npx shadcn@latest add sidebar-04`. It generates the `sidebar` primitive + a `sidebar-04` block (a `Sidebar` + `SidebarInset` example). Accept overwrites only for files it owns; if it tries to overwrite an already-customized primitive, decline and reconcile manually.
- [ ] **Step 2:** `bunx tsc -b` — fix any import/path mismatches (alias is `@/components`). **lucide-react gotcha:** this repo pins `lucide-react@^1.17.0` (unusual); if a generated icon import (e.g. `ChevronRight`, `PanelLeft`) doesn't resolve, check the installed export names and adjust imports.
- [ ] **Step 3: Commit** the raw generated files first (so the re-skin diff is reviewable): `git add src/components/ui/sidebar.tsx <other generated> && git commit -m "chore(design): add shadcn sidebar-04 (unstyled)"`

### Task 2.2: Map `--sidebar-*` vars + glass-skin the sidebar primitive

**Files:** Modify `src/app.css` (sidebar vars), `src/components/ui/sidebar.tsx` (surface classes).

- [ ] **Step 1:** In `:root`, point the sidebar vars at the glass system:

```css
--sidebar: var(--card);
--sidebar-foreground: var(--ink);
--sidebar-primary: var(--primary);
--sidebar-primary-foreground: var(--primary-ink);
--sidebar-accent: var(--primary-wash);
--sidebar-accent-foreground: var(--ink);
--sidebar-border: var(--hairline);
--sidebar-ring: var(--primary);
```

- [ ] **Step 2:** In `sidebar.tsx`, give the `Sidebar` container the floating-glass treatment (rounded, `bg-(--card)`, `border-(--border)`, `backdrop-blur-xl`, `--shadow`) and active `SidebarMenuButton` (`data-active`) → `bg-(--primary-wash)` + inset violet ring. Target the `sidebar-inset` mock.
- [ ] **Step 3:** `bun test` + `biome` + preview. **Commit** `git commit -m "feat(design): glass-skin sidebar + map sidebar vars"`

### Task 2.3: Compose the inset shell in the root layout

**Files:** Modify `src/routes/__root.tsx`; Modify/replace `src/components/shell/app-toolbar.tsx`; **retire** `src/components/shell/sidebar-collapsible.tsx` + `sidebar-nav.tsx` (delete once data is ported).

- [ ] **Step 1:** Wrap the app in `SidebarProvider` → `Sidebar` (variant `inset`) + `SidebarInset`. Put the frosted sticky toolbar (rail toggle `SidebarTrigger` + breadcrumb + pill search) at the top of `SidebarInset`. Content `Outlet` below. Reference the `sidebar-inset` mock for structure.
- [ ] **Step 2:** Port the series/set tree (from `sidebar-nav.tsx`/nav-tree data) into `SidebarGroup` → `SidebarMenu` items grouped "Vault" / "Series". Keep existing nav data source; only the rendering changes.
- [ ] **Step 3:** Delete the retired components; fix imports; `bunx tsc -b`.
- [ ] **Step 4: Verify behavior** (not just looks): preview → toggle the rail (button + keyboard shortcut), resize to mobile (`preview_resize`) and confirm the sheet opens, check `prefers-reduced-motion`. `preview_screenshot` desktop + mobile.
- [ ] **Step 5:** `bun test` (route/shell tests; pre-seed corpus where a test renders grids — `useCorpusRuntime.setState({ index: buildIndex([...]) })`, CLAUDE.md). **Commit** `git commit -m "feat(design): inset glass shell; retire hand-rolled sidebar"`

**✅ Phase 2 checkpoint:** Shell is the two-glass-plates layout, fully functional (toggle/mobile/a11y). Green trio.

---

## Phase 3 — Hero surfaces

### Task 3.1: Set tiles confirm violet
**Files:** `src/components/shell/set-tile.tsx` (already uses `ProgressRing` from 1.1).
- [ ] Confirm the ring is violet and remove any lingering `var(--accent,#e0b341)` references (grep). Preview a set grid; compare to `vault-hub` tiles. Commit if changed.

### Task 3.2: Vault hub
**Files:** `src/routes/vault/index.tsx`, `src/components/vault/vault-summary.tsx`, `src/components/binders/binder-card.tsx`.
- [ ] **Step 1:** Rebuild the hub to the `vault-hub` mock: `Eyebrow` + Clash `h1`; `BezelPanel` summary (big `ProgressRing` + `Stat` row, mono values, `+N` in `--success`); set-completion `SetTile` grid; binder cards (`GlassPanel interactive` + token progress bar). Wrap main groups in `Stagger`.
- [ ] **Step 2:** Keep all data hooks/selectors unchanged (`useOwnedCardCount`, `useBinderProgress`, etc.) — this is presentation only.
- [ ] **Step 3:** `bun test` (pre-seed corpus for grid tests) + `tsc` + `biome`; `preview_screenshot` vault hub vs mock. **Commit** `git commit -m "feat(design): vault hub to spec"`

### Task 3.3: Home
**Files:** `src/routes/index.tsx`, `src/components/islands/home-recents.tsx`.
- [ ] Rebuild hero (Clash headline, `Eyebrow`, pill search) + recents as Liquid-Glass tiles; `Stagger` entrance. Preview vs the orientation board feel. **Commit** `git commit -m "feat(design): home hero"`

**✅ Phase 3 checkpoint:** Hero surfaces match mocks. Green trio.

---

## Phase 4 — Grids + search

### Task 4.1: Search/filter controls + toggles
**Files:** `src/components/islands/search-controls.tsx`, `view-mode-toggle.tsx`, `match-mode-toggle.tsx`.
- [ ] **Step 1:** Replace the ad-hoc `rgba(120,100,255,0.25)` in `match-mode-toggle.tsx` with the token segmented-control pattern (active seg → `bg-(--primary) text-(--primary-ink)`; track → `bg-white/5 border-(--border)`). Same for `view-mode-toggle`. Grep to confirm no `rgba(120,100,255` remains.
- [ ] **Step 2:** Filter bar → `GlassPanel`; inputs/selects already re-skinned (1.6). Update any test asserting the old toggle bg. `bun test` + preview. **Commit** `git commit -m "feat(design): search controls on tokens"`

### Task 4.2: Card grids
**Files:** `src/routes/search.tsx`, `src/routes/$series/$set/index.tsx`, `src/routes/vault/sets/$set.tsx`, `src/components/vault/owned-missing-grid.tsx`, `owned-card-tile.tsx`.
- [ ] Apply glass tile treatment to grid tiles; tabs (all/owned/missing) → token pills; "owned" badge → `--success`. Keep Virtuoso grid parents at a definite height (memory: `tailwind-class-collisions`). `bun test` (pre-seed corpus) + preview each grid. **Commit** per route group.

**✅ Phase 4 checkpoint:** All grids + search styled. Green trio.

---

## Phase 5 — Detail + forms + modals

### Task 5.1: Card detail + Copy Manager
**Files:** `src/components/card/card-detail.tsx`, `src/components/collection/card-collection-manager.tsx`, `copy-manager.tsx`, `copy-edit-form.tsx`, `copy-row.tsx`, `src/components/islands/card-modal.tsx`, `card-prices.tsx`.
- [ ] **Step 1:** Rebuild to the `card-manage` mock: holo hero frame aligned to tokens (name plate, rarity badge, `GlassPanel` price panel with mono tabular prices, market in `--success`); Copy Manager list (selected copy → `--primary-wash`, PSA grade → `--success` chip, primary → violet ★); edit form using the re-skinned fields (segmented Variant + Raw/Graded, Condition select, `$` mono price, violet-focus date, Notes textarea, Primary switch).
- [ ] **Step 2:** TanStack Form patterns unchanged — render-prop `children`, `value={x ?? ""}`, map empty→null (CLAUDE.md). Presentation only.
- [ ] **Step 3:** Verify the modal's two-face swipe (detail ↔ manage) still works (`card-overlay`/`card-route` history-state) — preview, click into a card, swipe to manage. `bun test` (pre-seed corpus). **Commit** `git commit -m "feat(design): card detail + copy manager to spec"`

### Task 5.2: Binders + dialogs
**Files:** `src/components/binders/binder-detail.tsx`, `binder-form-dialog.tsx`, `share-dialog.tsx`, `src/components/vault/import-dialog.tsx`, `bulk-add-menu.tsx`, `src/components/islands/pack-dialog.tsx`, `src/components/shell/about-dialog.tsx`.
- [ ] Dialogs use the re-skinned glass `dialog`/`sheet`; forms use re-skinned fields; binder progress → token bar; rules list → glass rows. Preview each modal. `bun test`. **Commit** per group.

**✅ Phase 5 checkpoint:** Dense form + modal surfaces match the `card-manage` mock language. Green trio.

---

## Phase 6 — Holo alignment + polish + docs

### Task 6.1: Verify rarity foils on the new canvas
**Files:** `src/components/holo-card/rarity-styles.css` (only if a foil reads poorly).
- [ ] Preview a card of each major rarity (cosmos/vintage, reverse-holo, V/VMAX, rainbow, gold-secret, masked-CDN). The foils were tuned against the old `oklch(0.12 0.04 290)` background; the new canvas is `oklch(0.12 0.012 290)` (same lightness, less chroma) so changes should be minimal. If a blend washes out, nudge only that rarity's `filter`/blend. Do **not** rework the engine. Commit only if changed.

### Task 6.2: A11y + motion sweep
- [ ] Contrast: verify `--primary-ink` on `--primary` ≥ AA; focus rings visible on all interactive elements; `--muted`/`--faint` on canvas ≥ AA for body/labels. Fix any failures by nudging lightness.
- [ ] Motion: every transition/animation has a `motion-reduce:` guard; test with `prefers-reduced-motion` emulation in preview. Add `Stagger` entrance to remaining route mounts. **Commit** `git commit -m "feat(design): a11y + reduced-motion sweep"`

### Task 6.3: Update project docs
**Files:** `CLAUDE.md` ("Design system" section), any stale design note.
- [ ] Update the CLAUDE.md "Design system — Liquid Glass" section: accent gold `#e0b341` → violet `var(--primary)`; add the token list, the two-language split (Ethereal chrome / Liquid hero), the font stack, and point to this spec. **Commit** `git commit -m "docs: CLAUDE.md design system → violet Liquid Glass"`

**✅ Phase 6 checkpoint / final:** Full suite — `bunx tsc -b` · `bun test` (full) · `bunx biome check src`. Full preview pass of every surface against its mock. Screenshot the shell, vault hub, a grid, and card-manage for the PR.

---

## Self-Review (completed by plan author)

**Spec coverage:** every spec section maps to a task — §4 tokens→0.2, §5 fonts→0.1, §6 glass→1.2/3.1, §7 motion→1.4/6.2, §8 Tailwind→0.2, §9 shell→Phase 2, §10 components→Phase 1, §11 holo→6.1, §12 per-surface→Phases 3–5, §13 phasing→phase structure, §14 testing→verification steps, §15 risks→called out inline (happy-dom self-ref var, lucide pin, sidebar vars, class collisions, corpus pre-seed, worktree), §16 out-of-scope→honored (no engine rebuild, no behavior change), §17→folded into 0.1/0.2.

**Placeholder scan:** no "TBD"/"handle appropriately"; compositional surface tasks name the exact mock + primitives + elements to build (not literal full JSX for all 13 surfaces — by design, since they compose Phase-1 primitives against committed visual targets; this is concrete, not a placeholder).

**Type consistency:** `ProgressRing(pct,size,stroke,children)`, `GlassPanel({interactive})`, `BezelPanel`, `Stat({value,label,tone})`, `Eyebrow`, `Sheen`, `Stagger` — names used consistently across Phases 1–5. Tokens (`--primary`, `--primary-ink`, `--primary-wash`, `--canvas`, `--bg`, `--success`, `--r-panel/-control/-pill`, `--shadow/-lift`, `--ease`) consistent with spec §4.

## Execution Handoff

Offered after save (subagent-driven vs inline).
