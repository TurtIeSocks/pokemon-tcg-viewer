# Cardstack Rebrand — Phase 1 Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite all existing user-facing copy + brand identifiers to the approved Cardstack community-first voice (Phase 1), and add the two brand docs. Phase 2 (net-new community UI) is out of this plan — gated on the Discord hub URL.

**Architecture:** Mechanical string edits across ~11 source files, each followed by updating the tests that assert on those strings. Two new markdown docs under `docs/brand/`. No new dependencies, no logic changes. Exact old→new strings come from the approved spec: `docs/superpowers/specs/2026-06-26-cardstack-rebrand-copy-design.md`.

**Tech Stack:** TanStack Start + React, Bun test runner (`bun test`), `bunx tsc -b` typecheck, Biome lint.

## Global Constraints

Copied verbatim from the spec — every task implicitly includes these:
- **No em-dashes (—)** in any user-facing string. Use periods/commas/restructure. (Code comments are exempt; do not touch them.)
- **No AI tells / buzzwords:** seamless, elevate, streamline, optimize, unlock, supercharge, effortless, leverage, robust, empower, "look no further", "whether you're X or Y".
- **Accent:** always "Pokémon" (with `é`), used only descriptively. Brand name "Cardstack" stays Pokémon-free.
- **Title separators:** `Cardstack: <descriptor>` (brand-leading) · `<Page> · Cardstack` (page-leading, middot). No pipes.
- **Connectors:** `&` in short title-case labels; spell out "and" in sentence copy.
- **"the Stack" nickname:** never appears in Phase 1 (shipped) surfaces.
- **Honesty:** never imply in-app social/following/feeds exist. No community CTAs in Phase 1 (the hero eyebrow ships as `Browse · Collect · Own it`, not `Belong`).
- Preserve fullwidth `＋` glyphs on existing buttons.
- Use exact strings from the spec deck (§4). When this plan quotes a string, it is the source of truth for that edit.

**Verification commands** (run touched test file per task; full suite only at the end):
- Test one file: `bun test <path>`
- Typecheck: `bunx tsc -b`
- Lint touched files: `bunx biome check --write --config-path=. <paths>`

---

### Task 1: Landing / home (`src/routes/index.tsx`)

**Files:**
- Modify: `src/routes/index.tsx`
- Test: `src/routes/index.test.tsx`

**Interfaces:** Produces the new `HomeHero` h1 text + search aria-label that `index.test.tsx` asserts on.

- [ ] **Step 1: Update the test to the new strings**

In `src/routes/index.test.tsx`, change the heading assertion from `"Holo Playground"` to `"Just your cards"`, and the searchbox name matcher from `/search cards/i` to `/search any card/i`:

```tsx
expect(screen.getByRole("heading", { level: 1 }).textContent).toContain(
  "Just your cards",
);
expect(
  screen.getByRole("searchbox", { name: /search any card/i }),
).toBeDefined();
```

- [ ] **Step 2: Run the test, expect FAIL**

Run: `bun test src/routes/index.test.tsx`
Expected: FAIL (h1 still says "Holo Playground", searchbox name still "Search cards by name").

- [ ] **Step 3: Apply the copy edits in `src/routes/index.tsx`**

- eyebrow (≈line 40): `Browse · collect · admire the holo` → `Browse · Collect · Own it`
- headline line 1 (≈line 46): `Pokémon TCG` → `No ads. No snooping.`
- headline line 2 (≈line 48): `Holo Playground` → `No landlord. Just your cards.`
- subhead (≈line 52): `Search the catalog · admire the holo` → `Track your whole Pokémon TCG collection. Local-first and open-source, so it's actually yours. No account to start, no judgment about the fourth Charizard.`
- hero search placeholder (≈line 65): `Search cards by name…` → `Search any card by name…`
- search aria-label (≈line 66): `Search cards by name` → `Search any card by name`
- page `<title>` (≈line 98): → `Cardstack: track your Pokémon TCG collection, local-first`
- meta description (≈line 102): → `Cardstack tracks your whole Pokémon TCG collection. Local-first and open-source, so your data stays yours. Browse the full catalog free, no account needed.`

- [ ] **Step 4: Run the test, expect PASS**

Run: `bun test src/routes/index.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/index.tsx src/routes/index.test.tsx
git commit -m "feat(brand): rebrand landing hero + meta to Cardstack voice"
```

---

### Task 2: Global meta + header (`src/routes/__root.tsx`)

**Files:**
- Modify: `src/routes/__root.tsx`

**Interfaces:** No test asserts these strings; verify via dev preview `<head>`.

- [ ] **Step 1: Apply the copy edits**

- page `<title>` (≈line 39): `Pokémon TCG Holo Playground` → `Cardstack: track your Pokémon TCG collection`
- og:title (≈line 46): → `Cardstack: track your Pokémon TCG collection`
- og:description (≈line 50): → `Browse the whole Pokémon TCG catalog free, then track every copy you own. Local-first and open-source, so your cards stay yours.`
- header search placeholder (≈line 188): `Search 20,000 cards…` → `Search the catalog…`
- breadcrumb root label `Browse`: leave unchanged.

- [ ] **Step 2: Typecheck**

Run: `bunx tsc -b`
Expected: PASS, no errors.

- [ ] **Step 3: Commit**

```bash
git add src/routes/__root.tsx
git commit -m "feat(brand): rebrand global title/OG + header search to Cardstack"
```

---

### Task 3: Sidebar brand (`src/components/shell/app-sidebar.tsx`)

**Files:**
- Modify: `src/components/shell/app-sidebar.tsx`

- [ ] **Step 1: Apply the copy edits**

- under-logo line (≈line 94): `Home` → `Your cards. Your call.`
- brand tooltip (≈line 74): `CardStack — home` → `Cardstack, home` (fix casing + remove em-dash)
- nav labels (Overview / All Cards / Sets / Binders), group labels "Vault" and "Series & Sets": leave unchanged.

- [ ] **Step 2: Typecheck**

Run: `bunx tsc -b`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/shell/app-sidebar.tsx
git commit -m "feat(brand): sidebar tagline + tooltip to Cardstack voice"
```

---

### Task 4: Billing / pricing (`src/routes/billing.tsx`)

**Files:**
- Modify: `src/routes/billing.tsx`

- [ ] **Step 1: Apply the copy edits**

- `<title>`: `Billing & plan — Pokémon TCG` → `Billing & plan · Cardstack`
- heading `Billing & plan`: unchanged
- sub-paragraph: → `The whole app is free and local-first. Plus pays for the sync servers, not for access to your own cards. Self-hosters get it unbilled.`
- cloud-disabled panel: → `Cloud is off on this build. Your Vault lives on this device, and there's nothing to bill.`
- billing-disabled panel: → `This instance runs self-hosted, so every cloud feature is already free. Nothing to upgrade.`
- `PLUS_FEATURES`: `["Sync every card, every device", "Stacks and binders kept in sync", "Pick up on phone, tablet, or desktop"]`
- `FREE_FEATURES`: `["Your full Vault, offline, no caps", "CSV import and export, always on", "Edit, delete, or export it anytime. It's your data."]`
- upgrade button: `Upgrade to Plus` → `Get Plus`
- manage button `Manage subscription`: unchanged
- success toast: `Welcome to Plus — your Vault now syncs everywhere.` → `You're on Plus. Your Vault now syncs everywhere.`

- [ ] **Step 2: Typecheck + run any billing test**

Run: `bunx tsc -b` and `bun test src/routes/billing.test.tsx` (skip the test command if the file does not exist).
Expected: PASS. If a billing test asserts on a changed string, update it to match the new copy in this step.

- [ ] **Step 3: Commit**

```bash
git add src/routes/billing.tsx
git commit -m "feat(brand): billing copy to anti-landlord Cardstack voice"
```

---

### Task 5: Auth / sign-in (`src/routes/auth/callback.tsx` + `src/components/shell/sidebar-user-menu.tsx`)

**Files:**
- Modify: `src/routes/auth/callback.tsx`
- Modify: `src/components/shell/sidebar-user-menu.tsx`

- [ ] **Step 1: Apply edits in `callback.tsx`**

- page `<title>`: `Signing in… — Pokémon TCG` → `Signing in… · Cardstack`
- loading subtext: `Verifying your magic link.` → `Checking your magic link. One sec.`
- error title: `Sign-in link didn't work` → `That link didn't work`
- error body: `This sign-in link is invalid or has expired. Request a new one.` → `This link is expired or already used. Ask for a fresh one and you're back in.`
- catch-all error: `Sign-in failed.` → `Sign-in hit a snag. Try the link again.`
- cloud-disabled error (if present, e.g. `Cloud sign-in is not enabled in this build.`): → `Cloud sync is off in this build. Your cards still work locally.`
- loading heading `Signing you in…` and back button `Back to your Vault`: unchanged.

- [ ] **Step 2: Apply edits in `sidebar-user-menu.tsx`**

- sign-in dialog title: `Sign in` → `Sign in to sync`
- sign-in dialog body: `Sync your Vault across devices. We'll email you a magic link — no password needed.` → `Sign-in is just for sync. Browse and collect work fine without it. Want your Vault on every device? We'll email a magic link. No password, no snooping.`
- menu items (`Sign in to sync`, `Edit profile`, `Billing & plan`, `Sign out`): unchanged.

- [ ] **Step 3: Typecheck**

Run: `bunx tsc -b`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/routes/auth/callback.tsx src/components/shell/sidebar-user-menu.tsx
git commit -m "feat(brand): auth + sign-in copy (optional/local-first framing)"
```

---

### Task 6: Vault area (`src/routes/vault*.tsx`, `src/components/vault/owned-cards-grid.tsx`)

**Files:**
- Modify: `src/routes/vault.tsx`, `src/routes/vault/index.tsx`, `src/routes/vault/cards.tsx`, `src/routes/vault/binders/index.tsx`, `src/routes/vault/sets/index.tsx`
- Modify: `src/components/vault/owned-cards-grid.tsx`
- Test: `src/components/vault/owned-cards-grid.test.tsx`

- [ ] **Step 1: Update the owned-cards-grid test**

In `src/components/vault/owned-cards-grid.test.tsx` line ≈56, change the empty-state matcher:

```tsx
expect(screen.getByText(/nothing here yet/i)).toBeDefined();
```

- [ ] **Step 2: Run it, expect FAIL**

Run: `bun test src/components/vault/owned-cards-grid.test.tsx`
Expected: FAIL (empty state still "Your binder is empty").

- [ ] **Step 3: Apply the copy edits**

`vault.tsx`:
- `<title>`: `Your Vault — Pokémon TCG` → `Your Vault · Cardstack`

`vault/index.tsx`:
- overview subtitle: `Every copy you own, joined live to the corpus.` → `Every copy you own, in one place.`
- empty (no cards): `No cards yet, browse a set to start your collection.` → `No cards yet. Find your first one and the chase begins.`
- binders empty (overview): `No binders yet. Create one to organize your collection.` → `No binders yet. Make your first one.`

`vault/cards.tsx`:
- title: `All Cards` → `All cards`
- subtitle: `Browse and manage every card you own.` → `Every card you own, yours to sort and track.`
- loading: `Loading your collection…` → `Pulling your cards…`

`components/vault/owned-cards-grid.tsx`:
- empty: `Your binder is empty. Add cards from any set.` → `Nothing here yet. Add a card from any set to start the stack.`

`vault/binders/index.tsx`:
- subtitle: `Curated lists with smart rules and manual picks.` → `Lists that fill themselves by rule, plus the ones you hand-pick.`
- empty: `No binders yet. Create one to organize your card collection.` → `No binders yet. Make one to group the cards that go together.`

`vault/sets/index.tsx`:
- subtitle: `Track completion across every set.` → `See how close you are on every set.`
- empty: `You don't own any cards yet. Your sets will appear here once you add some.` → `No cards yet, so no sets to track. Add a few and they show up here.`

Leave unchanged: section titles ("Set completion", "Binders"), `View all sets →`, `New binder` buttons, `Browse all sets`, toggles ("Owned sets"/"All sets"), loading states `Loading binders…` / `Loading sets…`.

- [ ] **Step 4: Run the test + typecheck, expect PASS**

Run: `bun test src/components/vault/owned-cards-grid.test.tsx` and `bunx tsc -b`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/routes/vault.tsx src/routes/vault/index.tsx src/routes/vault/cards.tsx src/routes/vault/binders/index.tsx src/routes/vault/sets/index.tsx src/components/vault/owned-cards-grid.tsx src/components/vault/owned-cards-grid.test.tsx
git commit -m "feat(brand): vault area copy + empty states to Cardstack voice"
```

---

### Task 7: Profile (`src/routes/profile.tsx`)

**Files:**
- Modify: `src/routes/profile.tsx`

- [ ] **Step 1: Apply the copy edits**

- `<title>`: `Your Profile — Pokémon TCG` → `Your profile · Cardstack`
- empty bio: `No bio yet.` → `No bio yet. Add the cards you chase.`
- favorite-set empty: `No favorite set yet. Pick one to show it off.` → `No favorite set yet. Pick the one you'd show off first.`
- favorite-set button: `Choose favorite set` → `Pick favorite set`
- eyebrow, default name "Collector", stat labels: unchanged.

- [ ] **Step 2: Typecheck**

Run: `bunx tsc -b`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/routes/profile.tsx
git commit -m "feat(brand): profile copy to collector-identity voice"
```

---

### Task 8: Collection-management microcopy (incl. the missed `CollectionToggle` aria-label)

**Files:**
- Modify: `src/components/card/card-detail.tsx`
- Modify: `src/components/collection-toggle/collection-toggle.tsx`
- Modify: `src/components/binders/binder-form-dialog.tsx`
- Modify: `src/components/vault/bulk-add-menu.tsx`
- Test: `src/components/card/card-detail.test.tsx`, `src/components/collection-toggle/collection-toggle.test.tsx`

**Interfaces:** Both `card-detail.tsx` and `collection-toggle.tsx` must use the same object noun "Vault" for the add action so the two surfaces stay consistent.

- [ ] **Step 1: Update the tests to the new accessible names**

`src/components/card/card-detail.test.tsx`: replace every `/add to collection/i` matcher with `/add to vault/i` (lines ≈30 and ≈49), and update the test titles/comments at lines ≈27, ≈40, ≈50 from "Add to collection" to "Add to Vault".

`src/components/collection-toggle/collection-toggle.test.tsx`: line ≈52, change `name: /add .* collection/i` to `name: /add .* vault/i`. (Line ≈65 `/stacks|manage|collection/i` still matches "Manage stacks of …" — leave it.)

- [ ] **Step 2: Run both tests, expect FAIL**

Run: `bun test src/components/card/card-detail.test.tsx src/components/collection-toggle/collection-toggle.test.tsx`
Expected: FAIL (buttons still named "…to collection").

- [ ] **Step 3: Apply the copy edits**

- `card-detail.tsx` (≈line 131) CTA: `＋ Add to collection` → `＋ Add to Vault` (keep the fullwidth `＋`)
- `collection-toggle.tsx` (≈line 58) aria-label: `Add ${card.name} to collection` → `Add ${card.name} to Vault` (leave line ≈38 `Manage stacks of ${card.name}` unchanged)
- `binder-form-dialog.tsx` create description: `Create a new binder to organize your card collection.` → `A binder to sort your cards however you like. Sets, types, the chase pile.`
- `binder-form-dialog.tsx` edit description: `Update this binder's name and description.` → `Rename this binder or tweak its description.`
- `bulk-add-menu.tsx` dialog description: `Pick a binder to add these cards to.` → `Drop these cards into a binder.`
- `binder-picker-dialog.tsx` `＋ New binder…`: leave unchanged.

- [ ] **Step 4: Run both tests + typecheck, expect PASS**

Run: `bun test src/components/card/card-detail.test.tsx src/components/collection-toggle/collection-toggle.test.tsx` and `bunx tsc -b`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/card/card-detail.tsx src/components/card/card-detail.test.tsx src/components/collection-toggle/collection-toggle.tsx src/components/collection-toggle/collection-toggle.test.tsx src/components/binders/binder-form-dialog.tsx src/components/vault/bulk-add-menu.tsx
git commit -m "feat(brand): collection microcopy + unify Add-to-Vault accessible name"
```

---

### Task 9: About dialog (`src/components/shell/about-dialog.tsx`)

**Files:**
- Modify: `src/components/shell/about-dialog.tsx`

- [ ] **Step 1: Apply the copy edits**

- title: `About` → `About Cardstack`
- intro: `A fan-made browser for the Pokémon Trading Card Game. With thanks to:` → `Cardstack is a fan-made, open-source collection manager for the Pokémon TCG. Local-first, your data, no ads, no snooping. Built by collectors, with thanks to:`
- Pokémon credit body: → `Pokémon and all related names are trademarks of Nintendo, Creatures Inc., and GAME FREAK inc. Cardstack is an unofficial, non-commercial fan project. It is not affiliated with, endorsed, or sponsored by them.`
- Card data & images body: → `Every card you browse and collect is served by the Pokémon TCG API.`
- Holo effects body: → `The holo and foil shaders that make the chase cards glint are adapted from Pokémon Cards CSS by Simon Goellner (@simeydotme).`
- footer body: `Source code: TurtIeSocks/pokemon-tcg-viewer` → `Open source, top to bottom. No landlord, no lock-in.`
- footer link label: → `View source on GitHub` (keep the existing `href` to the real repo)

- [ ] **Step 2: Typecheck**

Run: `bunx tsc -b`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/shell/about-dialog.tsx
git commit -m "feat(brand): about dialog to open-source Cardstack pride"
```

---

### Task 10: Voice & messaging guide doc

**Files:**
- Create: `docs/brand/voice-and-messaging-guide.md`

- [ ] **Step 1: Write the doc**

Write `docs/brand/voice-and-messaging-guide.md` covering (content from spec §2 and §5): name + TM rule; positioning + tagline (`No ads. No snooping. No landlord. Just your cards.`); the browse→collect→belong spine + the `Own it`/`Belong` eyebrow gating rule; voice principles (warm insider + principled undercurrent) with do/don't pairs; the AI-tell ban list (em-dashes + buzzwords); lexicon (approved: Vault, Binder, Stack [data], the chase, the pull, "the Stack" [community, ≤1 wink/surface]; banned: holo-playground framing, corporate-speak); mechanics rules (accent, separators, connectors, "the Stack" cap); 3-4 before/after voice swatches drawn from the spec deck (§4); the i18n-deferred note (deck is the future extraction map).

- [ ] **Step 2: Verify no em-dashes in the doc's example copy**

Run: `rg -n '—' docs/brand/voice-and-messaging-guide.md`
Expected: no matches inside quoted example/brand copy. (Prose explaining the rule may name the character; that is fine.)

- [ ] **Step 3: Commit**

```bash
git add docs/brand/voice-and-messaging-guide.md
git commit -m "docs(brand): voice & messaging guide"
```

---

### Task 11: Community launch playbook doc

**Files:**
- Create: `docs/brand/community-launch-playbook.md`

- [ ] **Step 1: Write the doc**

Write `docs/brand/community-launch-playbook.md` covering (content from spec §5): platform pick (Discord primary + rationale; Reddit later for discovery/SEO); community identity ("collectors who own their stuff"); channel architecture (start-here · show-your-pulls · trades · set-completion-help · feedback/roadmap · off-topic); new-member journey (pinned welcome, intro prompt, first-week nudges, app→hub bridge); founding-member plan (recruit 20-50 by hand, seed conversations, do things that don't scale); rituals (weekly "what'd you pull", monthly set-completion challenge, roadmap AMA); on-site→hub bridge (map each Phase 2 nudge from spec §4 to its link); health metrics (DAU/MAU, new-member post rate, % non-staff posts) + warning signs; the Phase 2 gate (in-app community section ships when the hub URL is live).

- [ ] **Step 2: Commit**

```bash
git add docs/brand/community-launch-playbook.md
git commit -m "docs(brand): community launch playbook (Discord-first)"
```

---

### Task 12: Final verification sweep

**Files:** none (verification only)

- [ ] **Step 1: Em-dash sweep over changed source strings**

Run: `git diff main --name-only -- 'src/**' | xargs rg -n '—' 2>/dev/null`
Manually confirm any hit is inside a code comment, not a user-facing string. Fix any user-facing em-dash found.

- [ ] **Step 2: Stale-comment cleanup (optional, cosmetic)**

In `src/components/islands/card-grid-island.test.tsx` (lines ≈166-180), the comments say "Add to collection". Update them to "Add to Vault" so they match reality. No assertion changes.

- [ ] **Step 3: Full check in parallel**

Run (in one batch): `bun test`, `bunx tsc -b`, `bunx biome check --config-path=. src/`
Expected: all green. Fix any test that still asserts an old string.

- [ ] **Step 4: Dev-preview spot check**

Boot the dev server and confirm the new copy renders and the SSR `<head>` is correct on: landing hero, sidebar, billing, sign-in dialog, a vault empty state, the about dialog.

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "test(brand): align tests + comments with Cardstack copy"
```

---

## Self-Review

- **Spec coverage:** Every Phase 1 deck entry (§4) maps to Tasks 1-9; both docs (§5) to Tasks 10-11; the em-dash guard downgraded to a manual sweep (Task 12 Step 1) because an automated grep is all comment false-positives; test impacts (index, owned-cards-grid, card-detail, collection-toggle) covered in their owning tasks; the missed `collection-toggle.tsx` aria-label folded into Task 8. Phase 2 deck intentionally excluded (gated).
- **Placeholders:** none — every edit lists exact old→new strings.
- **Consistency:** "Add to Vault" object noun unified across `card-detail.tsx` and `collection-toggle.tsx` (Task 8); separator/accent/connector rules applied per Global Constraints.
- **Out of scope (unchanged):** repo/package rename, i18n, Phase 2 community UI.
