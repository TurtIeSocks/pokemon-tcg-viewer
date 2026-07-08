# Liquid Glass Redesign — design system + whole-app application

- **Date:** 2026-06-03
- **Status:** Approved (brainstorm complete, visual mocks signed off)
- **Scope:** Whole-app cohesive redesign (Scope A) — one design language, end to end.
- **Governing skills:** `redesign-existing-projects`, `high-end-visual-design`, `tailwind-design-system`, `liquid-glass-design`.
- **Supersedes:** the ad-hoc visual direction across prior docs (`2026-05-30-design-revamp`, `2026-06-01-card-detail-redesign`, `2026-05-30-home-hero-redesign`). Those remain valid for *behavior/layout*; this doc is the single source of truth for *visual language* (tokens, type, glass, motion).
- **Visual reference mocks:** `.superpowers/brainstorm/85187-1780513603/content/` — `orientation`, `fonts`, `accent`, `palette`, `vault-hub`, `sidebar-inset`, `card-manage`; the source `control-room.{html,css}` (Ethereal Glass origin) lives in the same dir. (Dir is gitignored — local reference scratch.)

---

## 1. Problem (audit)

The app is feature-rich but visually incoherent — surfaces were built in rapid succession with no shared visual plan. Concrete symptoms:

- **Accents fighting:** purple `--primary` tokens (`oklch(0.62 0.22 295)`) vs set-tile rings stroked with `var(--accent, #e0b341)` (the cyan `--accent`, gold fallback) vs a cyan `--accent` (`oklch(0.72 0.14 200)`) vs ad-hoc `rgba(120,100,255,0.25)` in the match-mode toggle. No single brand voice.
- **Glass on one surface only:** `set-tile.tsx` is a polished Liquid-Glass surface; everything else is flat shadcn `new-york` neutral.
- **Type mismatch:** body set in **Newsreader** (a serif) under a glass card system that wants a grotesk; data in JetBrains Mono.
- **Drift:** spacing, radii, and elevation differ route to route.

The cure is **cohesion governed by tokens**, not a fresh coat of paint per screen.

## 2. Direction

Fuse the **two design languages the user already likes** into one token-governed system:

- **Ethereal Glass** (from the `control-room.{html,css}` reference) — owns **chrome**: shell, nav, panels, forms, lists, dialogs, data. Cool near-black canvas, one accent, frosted panels + the "double-bezel" machined enclosure, tabular data.
- **Liquid Glass** (from `set-tile.tsx`) — owns **hero objects**: set tiles, card tiles, the holo-card frame. A glass pane glowing in the *content's own color* (set logo / card art bleeds through, upscaled + blurred), specular sheen on hover.

These are complementary, not competing: chrome-glass is **fixed-palette** (violet system); content-glass is **polychrome** (color from art). They coexist because they live at different depths and the canvas is near-neutral, so the loud polychrome cards never blur into the violet chrome.

## 3. Approved decisions (the locked forks)

| Fork | Decision |
|---|---|
| Scope | **A** — whole app, cohesive. Every surface restyled; holo foil *engine* left intact, its frame aligned. |
| Headline/display font | **Clash Display** (Fontshare, ITF-Free) |
| UI/body font | **Space Grotesk** |
| Data/number font | **Geist Mono** (tabular) |
| Retired fonts | **Newsreader**, **JetBrains Mono** |
| Brand accent | **Violet** `oklch(0.70 0.19 295)` |
| Canvas | **Whisper-violet near-neutral** `oklch(0.12 0.012 290)` (almost no chroma) — *not* flat purple; darker so the inset shell's floating panels separate |
| Completion rings / progress | **Violet** (brand) |
| "Owned" state | **Emerald** `--success` (reserved, not violet) |
| Shell sidebar | Adopt **shadcn `sidebar-04` (inset variant)**, re-skinned to glass; retire hand-rolled `sidebar-collapsible.tsx` |
| Killed | set-tile ring `var(--accent,#e0b341)` → violet · cyan `--accent` value retired · ad-hoc `rgba()` toggle → token · flat-purple canvas → neutral |

---

## 4. Design tokens

Single source of truth: `src/app.css` `:root` (primitive values) + `@theme inline` (Tailwind v4 mapping). **All values oklch.** Every token is a **concrete value** — never self-referential (`--x: var(--x, …)` hangs happy-dom and freezes `bun test`; see CLAUDE.md).

### 4.1 Surfaces

```css
--canvas:  oklch(0.12  0.012 290);  /* page/tray base — whisper-violet near-black */
--bg:      oklch(0.175 0.017 290);  /* solid panel base (bezel core) */
--card:    oklch(1 0 0 / 0.045);    /* glass fill */
--card-2:  oklch(1 0 0 / 0.07);     /* raised glass fill */
```

Canvas is the dominant surface (the whole app sits in the inset shell — §9 — so the "tray" backdrop is what you see most). Kept dark (`0.12`) so the floating glass panels separate cleanly. A rare full-bleed screen may lift its own surface toward `0.14` if it reads too dark.

### 4.2 Text

```css
--ink:   oklch(0.97 0.006 290);  /* primary text */
--muted: oklch(0.71 0.016 290);  /* secondary */
--faint: oklch(0.57 0.018 290);  /* labels / captions */
```

### 4.3 Accent ramp (violet) + signals

```css
--primary:        oklch(0.70 0.19 295);
--primary-strong: oklch(0.79 0.15 295);          /* hover */
--primary-ink:    oklch(0.16 0.03 295);          /* text/icon ON filled violet */
--primary-wash:   oklch(0.70 0.19 295 / 0.18);   /* active rows, soft buttons, badges */

--success: oklch(0.78 0.15 162);  /* emerald — "owned", positive deltas */
--warning: oklch(0.82 0.13 78);   /* amber */
--danger:  oklch(0.70 0.19 18);   /* rose — destructive */
```

### 4.4 Lines, shape, elevation, motion

```css
--border:   oklch(1 0 0 / 0.09);   /* glass edge */
--hairline: oklch(1 0 0 / 0.06);   /* faint divider */

--r-panel:   18px;   /* cards, panels, tiles */
--r-control: 12px;   /* inputs, selects, small tiles */
--r-pill:    999px;  /* buttons, badges, toggles */
/* shadcn base --radius set to 1rem so its derived sm/md/lg/xl land near 12/14/16/20 */

--shadow:      0 24px 60px -24px oklch(0 0 0 / 0.7),  inset 0 1px 0 oklch(1 0 0 / 0.09);
--shadow-lift: 0 32px 80px -28px oklch(0 0 0 / 0.85), 0 0 0 1px var(--primary-wash), inset 0 1px 0 oklch(1 0 0 / 0.12);

--ease:        cubic-bezier(0.32, 0.72, 0, 1);    /* heavy, "expensive" */
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
```

### 4.5 Ambient mesh (the signature glow)

A fixed, non-repainting background layer (`body::before`, `position:fixed`) in violet/magenta/blue-violet — gives the dark canvas depth without competing with content.

```css
--ambient:
  radial-gradient(60% 50% at 14% 0%,   oklch(0.70 0.19 295 / 0.15), transparent 70%),
  radial-gradient(50% 45% at 96% 6%,   oklch(0.62 0.16 320 / 0.11), transparent 70%),
  radial-gradient(55% 55% at 80% 100%, oklch(0.58 0.14 270 / 0.09), transparent 70%);
```

## 5. Typography

| Role | Family | Weights | Source / license | Usage |
|---|---|---|---|---|
| Display / hero | **Clash Display** | 500, 600 | Fontshare, ITF Free | Page titles, section headings, set names, card names — large text only |
| UI / body | **Space Grotesk** | 400, 500, 600, 700 | Google, OFL | All UI text, body copy, labels, buttons |
| Data / numbers | **Geist Mono** | 400, 500 | OFL | **Every number**: counts, %, prices, dates, ids. `font-feature-settings: "tnum"` so columns align |

- **Self-host all three** as woff2 (matches the existing self-hosted-fonts pattern; no runtime Google/Fontshare fetch). Replace the Newsreader + JetBrains Mono `@font-face` blocks in `app.css`.
- Type scale (display uses `text-wrap: balance`, tight tracking `-0.02em` on Clash):
  - `display-xl` clamp(40px, 7vw, 72px) · `display-lg` clamp(30px, 4vw, 46px) · `h1` ~34px · `h2` ~20–21px · body 16px / 1.5 · label 11px uppercase `.18em`.
- **Rule:** Clash for display/hero only — it is *not* a body face. Space Grotesk carries everything functional. Geist Mono is reserved for data so numeric columns stay aligned.

## 6. Glass recipes

### 6.1 Chrome-glass (Ethereal) — fixed palette

Single frosted surface and the double-bezel "machined plate in a tray":

```css
.glass {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--r-panel);
  box-shadow: var(--shadow);
  backdrop-filter: blur(22px) saturate(1.4);
}
/* double-bezel: outer shell + concentric inner core (reads as hardware) */
.bezel      { background: oklch(1 0 0 / 0.04); border: 1px solid var(--hairline);
              border-radius: calc(var(--r-panel) + 6px); padding: 6px; backdrop-filter: blur(22px) saturate(1.4); }
.bezel-core { background: var(--bg); border-radius: var(--r-panel);
              box-shadow: inset 0 1px 1px oklch(1 0 0 / 0.10); padding: 22px; }
```

Used for: toolbar, sidebar, content panels, the Vault summary hero, dialogs, form panels, price panel.

### 6.2 Content-glass (Liquid) — polychrome, color from art

The existing `set-tile.tsx` recipe, generalized. Four layers, back → front (verbatim from CLAUDE.md "Design system"):

1. **Color backdrop** — the surface's own image (set logo / card art) `scale-[1.7] blur-2xl saturate-150 opacity-50`, so it glows in its own palette; over a base gradient `from-black/40 via-black/10 to-black/75` for legibility.
2. **Frosted pane** — `rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl` + bright top edge / inset depth: `shadow-[inset_0_1px_0_rgba(255,255,255,0.28),inset_0_-1px_0_rgba(0,0,0,0.35)]`.
3. **Specular sheen** (interactive) — `-translate-x-full … group-hover:translate-x-full` sweep `via-white/15`, `motion-reduce:hidden`.
4. **Content** — crisp hero (logo/name) + accent-stroked **progress ring** + bold `tabular-nums`.

Used for: set tiles, card tiles, the holo-card frame, any "hero object".

**The one change to existing content-glass:** the progress ring stroke + symbol accent move from `var(--accent, #e0b341)` to **violet** `var(--primary)` (pinning `--accent` → violet in §8 fixes the ring automatically; `SetTile` is confirmed in §10). The art-derived backdrop stays polychrome (that's the point).

## 7. Motion

Adopt the Ethereal Glass motion conventions (the user liked the reference, which ships these). **All motion guarded by `motion-reduce:` / `prefers-reduced-motion`.**

- **Easing:** `--ease` (heavy/expensive) for transforms + opacity; `--ease-spring` for playful affordances.
- **Entrance choreography:** parent `.stagger` → direct children rise in sequence (`opacity 0→1`, `translateY(18px)→0`, `blur(6px)→0`), 0.8s `--ease`, staggered 60–80ms. Applied to main content groups on route mount.
- **Hover lift:** interactive cards/tiles `translateY(-3px to -4px)` + `--shadow-lift`.
- **Specular sheen:** the sweep on Liquid-Glass hero objects (§6.2 layer 3).
- **Loading = skeleton shimmer, never a spinner:** `.skel` block with a `--primary-wash` shimmer sweep (1.8s). Scoped "working…" glow for async/generative moments.

## 8. Tailwind v4 integration

`app.css` already drives the theme (no `tailwind.config.ts`). Plan:

1. **Primitives** → `:root` (the §4 token block).
2. **`@theme inline`** maps Tailwind color/font utilities to tokens: `--color-background`, `--color-foreground`, `--color-primary`, `--color-card`, `--color-border`, `--color-ring`, `--color-success/warning/danger`, `--font-display` (Clash), `--font-sans` (Space Grotesk), `--font-mono` (Geist Mono).
3. **Re-point shadcn semantic vars** to the new oklch values: `--background`, `--foreground`, `--card`, `--card-foreground`, `--primary`, `--primary-foreground`, `--secondary`, `--muted`, `--accent` (→ violet, no longer cyan), `--destructive`, `--border`, `--input`, `--ring`, and the `--sidebar-*` set (see §9).
4. **Glass as utilities, not bare global classes.** Expose `.glass`, `.bezel`, `.stagger`, `.skel` via `@utility` (Tailwind v4) or small components — **namespaced** to avoid the bare-class/Tailwind collision documented in memory (`tailwind-class-collisions`). Prefer the `GlassPanel`/`BezelPanel` components (§10) over global classes where a component fits.
5. Expose `--shadow`, `--shadow-lift`, `--ease` for use via arbitrary values (`shadow-(--shadow)`, `ease-(--ease)`).

## 9. Shell — adopt shadcn `sidebar-04` (inset), re-skinned

- **Install** `npx shadcn@latest add sidebar-04` during implementation (adds the `sidebar.tsx` primitive + the inset block). Keep its **structure**: collapsible groups, rail toggle, mobile sheet, keyboard shortcut, focus management, a11y.
- **Re-skin** to glass: `Sidebar` + `SidebarInset` become floating rounded frosted panels (`.glass` recipe) on the ambient-mesh canvas — "two glass plates floating on the tray". Active `SidebarMenuButton` → `--primary-wash` + inset violet ring. Group labels → faint uppercase. Header → violet gradient icon tile + Clash wordmark. Map shadcn's `--sidebar-*` vars onto our tokens (`--sidebar-background` → glass, `--sidebar-accent` → wash, `--sidebar-ring` → violet).
- **Toolbar / breadcrumb:** frosted sticky bar with rail-toggle + breadcrumb trail + pill search (per the `sidebar-inset` mock).
- **Retire** the hand-rolled `src/components/shell/sidebar-collapsible.tsx` and `sidebar-nav.tsx` once the block covers their behavior. Port the series/set tree data into `SidebarMenu` items.

## 10. Component inventory

### Re-skin (token + variant changes only, no API change)

`ui/button`, `ui/badge`, `ui/input`, `ui/textarea`, `ui/select`, `ui/label`, `ui/field`, `ui/dialog`, `ui/sheet`, `ui/popover`, `ui/dropdown-menu`, `ui/command`, `ui/tooltip`, `ui/radio-group`, `ui/switch`, `ui/collapsible`, `ui/scroll-area`, `ui/separator`, `ui/skeleton`, `ui/progress-bar`.

- Buttons → pill (`--r-pill`), `primary` = filled violet w/ `--primary-ink`; add `soft` (wash) + keep `ghost`; trailing `›` icon-pill affordance on primary CTAs.
- Badges → `azure→violet` default, plus `success/warning/danger` washes.
- Inputs/select/textarea → glass fill, `--border`, violet focus ring (`0 0 0 3px var(--primary-wash)`).
- Switch → violet track when on. Skeleton → shimmer (§7).

### New shared components

| Component | Purpose | Notes |
|---|---|---|
| `GlassPanel` | `.glass` surface wrapper | props: `as`, `interactive` (hover lift) |
| `BezelPanel` | double-bezel enclosure | wraps the Vault summary hero, dialogs |
| `ProgressRing` | accent-stroked completion ring | **extract from `set-tile.tsx`**, default stroke `--primary`; reused by tiles + summary |
| `Eyebrow` | micro uppercase label chip | violet wash + border |
| `Stat` / `StatBlock` | big Geist-Mono number + label | summary hero, prices |
| `Sheen` | specular sweep overlay | for Liquid-Glass hero objects |
| `Stagger` | entrance choreography wrapper | applies `.stagger` |

### Update

- `SetTile` — ring gold → violet; otherwise the canonical Liquid-Glass recipe (unchanged structure). Becomes the reference others copy.
- `HoloCard` — **engine unchanged** (see §11); only align the surrounding frame/chrome (borders, name plate, badges) to tokens.

## 11. Holo-card engine — alignment only (not a rebuild)

The holo foil system (`holo-card/`, `rarity-styles.css` ~1263 lines, the per-rarity foil/mask layers, tilt + pointer hooks, CDN foil assets) is **out of scope to rebuild**. It is the app's crown jewel and orthogonal to the design system.

Required work, minimal:
- Verify each rarity foil **reads well on the new whisper-violet canvas** (the foils were tuned against the old purple-290 background; spot-check cosmos/rainbow/gold-secret for contrast).
- Align the card **frame, name plate, rarity badge, price panel** (the chrome *around* the card) to tokens — done in the `card-manage` mock.
- Keep `holo-textures/` assets and the foil math as-is.

## 12. Per-surface application plan (Scope A)

Grouped by archetype. Each surface inherits tokens for free; the work is composing the re-skinned primitives + applying the right glass language.

| # | Surface(s) | Archetype | Key work |
|---|---|---|---|
| 1 | `__root.tsx`, `shell/*`, toolbar | Shell | `sidebar-04` inset re-skin; frosted toolbar + breadcrumb; ambient mesh on `body` |
| 2 | `routes/index.tsx` (Home) | Hero | Clash hero, Liquid-Glass recents, eyebrow, stagger entrance |
| 3 | `routes/search.tsx` + `search-controls`, `view-mode-toggle`, `match-mode-toggle` | Grid + controls | toggles → tokens (kill `rgba(120,100,255)`); glass filter bar; card grid |
| 4 | `$series/$set/index.tsx` | Grid | card grid; set header w/ Liquid-Glass set hero |
| 5 | `$series/$set/$card.tsx` + `$card_.manage.tsx`, `card/*`, `collection/*` | Detail + forms | **card-manage mock** — holo hero + Copy Manager + edit form re-skin |
| 6 | `vault/index.tsx` + `vault/*`, `vault-summary`, `binders/*` | Dashboard | **vault-hub mock** — BezelPanel summary, Liquid-Glass set tiles, binder cards |
| 7 | `vault/sets/$set.tsx`, `owned-missing-grid` | Grid | tabbed owned/missing grid; tile glass |
| 8 | `binders/binder-detail`, `binder-form-dialog`, `share-dialog`, `import-dialog`, `pack-dialog`, `about-dialog` | Modals/forms | dialog glass; form fields; pill actions |
| 9 | `pokemon/$name.tsx` + `pokemon-timeline` | Timeline | token pass; mono for stats |

## 13. Implementation phasing

Ordered so each phase is independently shippable and the app never breaks visually mid-flight (redesign-existing-projects: preserve functionality, apply incrementally).

- **Phase 0 — Foundation.** Tokens in `app.css` (§4) + self-host the three fonts + retire Newsreader/JetBrains Mono + `@theme` mapping + re-point shadcn vars. *App immediately shifts to the violet system; nothing structural changes.*
- **Phase 1 — Primitives + shared components.** Re-skin `ui/*`; build `GlassPanel`, `BezelPanel`, `ProgressRing` (extracted), `Eyebrow`, `Stat`, `Sheen`, `Stagger`.
- **Phase 2 — Shell.** `sidebar-04` inset, re-skinned; toolbar/breadcrumb; retire `sidebar-collapsible`/`sidebar-nav`.
- **Phase 3 — Hero surfaces.** Vault hub, set tiles (ring → violet), Home.
- **Phase 4 — Grids + search.** Search controls/toggles, card grids, set/owned-missing grids.
- **Phase 5 — Detail + forms + modals.** Card detail/manage, copy manager, binders, all dialogs.
- **Phase 6 — Holo alignment + polish.** Verify foils on new canvas; a11y/contrast + reduced-motion sweep; entrance choreography; final spacing/radii audit.

## 14. Testing & verification

- **Per phase, in parallel:** `bun test` · `bunx tsc -b` · `bunx biome check --write <files>` (pass explicit paths — `bun run lint` fails on nested worktree `biome.json`, see memory).
- **Visual:** dev server preview (`bun run dev`, port 6201) per surface; verify before/after.
- **A11y:** contrast AA for `--primary-ink` on violet, focus rings visible, all motion respects `prefers-reduced-motion`.
- **Test fragility:** any component test asserting specific class names (e.g. gold ring, cyan accent, old toggle bg) will need updating — grep + fix. Grid-rendering tests must pre-seed the corpus (`useCorpusRuntime.setState`) so `loadCorpus` early-returns (memory + CLAUDE.md).
- **happy-dom:** confirm no token is self-referential (would hang `bun test`).

## 15. Risks & gotchas

- **happy-dom self-referential CSS var hang** — every token concrete; never `--x: var(--x, …)`.
- **`lucide-react` is pinned `^1.17.0`** (unusual — upstream is ~0.4xx). Verify the `sidebar-04` block's icon imports resolve against this version; adjust imports if names differ.
- **shadcn `new-york` + Tailwind v4** — the sidebar block expects `--sidebar-*` vars; define them (§9) or the block renders unstyled.
- **Clash Display licensing** — ITF Free License; document the source + self-hosted woff2 in the repo (e.g. a `FONTS.md` or comment in `app.css`).
- **React Compiler manual memo** is intentional — don't strip `useMemo`/`useCallback` (CLAUDE.md).
- **Route files** export `Route` + component → `only-export-components` lint fires; expected/unavoidable.
- **Tailwind class collisions** — namespace any bare custom class; prefer `@utility` / components (memory).
- **Worktree setup** — if implemented in a worktree: `bun install` locally + `cp <base>/.env .env` first (CLAUDE.md), or dev server breaks in confusing ways.

## 16. Out of scope / non-goals

- Holo foil **engine** rebuild (alignment only — §11).
- Behavioral / data-model / routing changes — this is a **visual** redesign; functionality is preserved.
- **Light mode** — app is dark-only; a light theme is a future token set, not this pass.
- New features. (If a surface is missing a state the redesign exposes, note it; don't build new behavior here.)

## 17. Resolved during review (2026-06-03)

- **Fonts:** self-host **all three** (Clash Display, Space Grotesk, Geist Mono) as woff2. JetBrains Mono + Newsreader retired — no fallback hedge.
- **Inset-tray darkness:** `--canvas: oklch(0.12 0.012 290)` — darker tray so the inset shell's floating glass panels separate. Full-bleed screens may lift their own surface toward `0.14` if needed.

No open questions remain.
