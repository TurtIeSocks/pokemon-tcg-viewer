# Cardstack rebrand — branding, copy & community design

**Date:** 2026-06-26
**Status:** Approved (brainstorm), ready for implementation plan
**Scope:** Site-wide branding, voice, and copy rework to align the product with its new core goal: a **collector community**. Plus two reusable docs (voice guide, community playbook) and net-new community UI copy.

---

## 1. Problem

The product evolved from a "Pokémon TCG Holo Playground" (card viewer) into a local-first, open-source **collection manager** (Vault, Binders, stacks, CSV import/export, profiles, cloud sync, a $4/mo Plus tier). The marketing/branding never caught up: the landing page still sells "browse & admire the holo." Branding lags the product by a full pivot, and the new goal is **community-first** (the tool is the on-ramp; the people are the moat).

## 2. Locked decisions

| Decision | Value |
|---|---|
| **Name** | **Cardstack** (locked). Brand name stays Pokémon-free for trademark safety. "Pokémon TCG" is used only **descriptively** (nominative fair use), with the accent: **Pokémon**. |
| **Core goal** | Collector community. Tool = on-ramp, people = moat. |
| **Funnel** | **Browse → Collect → Belong** (browse the catalog free/instant → track what you own, local-first → find the collectors who get it). |
| **Community home** | External **Discord** (primary). Reddit added later purely as a discovery/SEO funnel. In-app social (following/feeds/discovery) is **roadmap, not live**. |
| **Tagline** | **No ads. No snooping. No landlord. Just your cards.** |
| **Community nickname** | "the Stack" (members of the Stack; "Join the Stack"). Use **sparingly — ≤1 wink per surface**. |
| **Voice** | Warm insider (collector-to-collector) with a principled undercurrent (open-source, local-first, your data, no corporate landlord). |
| **Primary landing action** | Browse, then belong: keep the low-commitment browse/search hook; community is the payoff. |

### Honesty rules (hard)
- Never market in-app social/following/feeds/discovery as if it exists today. It does not.
- Community CTAs point to the **external Discord**.
- No fake counts or fabricated testimonials. Default to founding-member / qualitative framing.

### Style bans (hard — this is a brand whose pitch is "non-corporate / real")
- **No em-dashes (—)** anywhere in user-facing copy. Use periods, commas, or restructure. (Code/commits unaffected.)
- No AI tells / corporate buzzwords: seamless, elevate, streamline, optimize, unlock, supercharge, effortless, "in today's fast-paced world", "whether you're X or Y", "look no further", "leverage", "robust", "empower".
- No exclamation spam, no emoji-bullet spam, no fake scarcity.
- Keep collector slang newcomer-legible.

### Mechanics rules (from the whole-deck cohesion sweep — these are law)
- **Accent:** always "Pokémon" (the codebase already uses `é`).
- **Title separators:** `Cardstack: <descriptor>` for brand-leading titles; `<Page> · Cardstack` (middot) for page-leading titles. No pipes.
- **Connectors:** `&` in short title-case labels (nav/headings: "Billing & plan", "Series & Sets"); spell out "and" in sentence/body copy.
- **"the Stack":** ≤1 prominent hit per page/surface; never on shipped (Phase 1) surfaces.

## 3. Phasing (Approach C)

### Phase 1 — ships now (this branch)
- Rewrite all existing strings (see §4 deck).
- Update brand identifiers (titles, OG tags, About). Wordmark is already "Cardstack".
- Write both brand docs (§5).
- Hero eyebrow ships as **`Browse · Collect · Own it`** (the "Belong" beat has no on-page payoff until Phase 2).

### Phase 2 — gated on the Discord hub URL existing
- New Liquid-Glass components: landing community section, social-proof block, 3 in-app hub nudges (§4 Phase 2 deck).
- Single hub-URL config source (env) so every nudge links consistently.
- Flip hero eyebrow `Own it` → `Belong` when the community section lands (gate them together so the eyebrow never promises a step the page does not deliver).

### Out of scope (on the record)
- **Repo/package rename** (`pokemon-tcg-viewer` → cardstack). Parked; orthogonal plumbing, not branding copy. The About "View source" link keeps the real repo href.
- **i18n.** Deliberately deferred. The deck below is a clean old→new string map, so a future i18n extraction is a mechanical sweep, not a rebuild. Note: the brand voice is English-idiomatic and would require per-locale transcreation, not literal translation — that is part of why it is its own future project.
- **Actual in-app social** (following/feeds). Still roadmap; copy never implies it exists.
- Currency/locale money formatting (rides with i18n).

## 4. Copy deck (old → new)

### Phase 1 — rewrite existing strings

#### Landing / home (`src/routes/index.tsx`)
- eyebrow: `Browse · collect · admire the holo` → **`Browse · Collect · Own it`**
- headline L1: `Pokémon TCG` → **`No ads. No snooping.`**
- headline L2: `Holo Playground` → **`No landlord. Just your cards.`**
- subhead: `Search the catalog · admire the holo` → **`Track your whole Pokémon TCG collection. Local-first and open-source, so it's actually yours. No account to start, no judgment about the fourth Charizard.`**
- hero search placeholder: `Search cards by name…` → **`Search any card by name…`**
- search aria-label: `Search cards by name` → **`Search any card by name`**
- `<title>`: → **`Cardstack: track your Pokémon TCG collection, local-first`**
- meta description: → **`Cardstack tracks your whole Pokémon TCG collection. Local-first and open-source, so your data stays yours. Browse the full catalog free, no account needed.`**

#### Global meta + header (`src/routes/__root.tsx`)
- page `<title>`: → **`Cardstack: track your Pokémon TCG collection`**
- og:title: → **`Cardstack: track your Pokémon TCG collection`**
- og:description: → **`Browse the whole Pokémon TCG catalog free, then track every copy you own. Local-first and open-source, so your cards stay yours.`**
- header search placeholder: `Search 20,000 cards…` → **`Search the catalog…`**
- breadcrumb root label: `Browse` (unchanged)

#### Sidebar brand + nav (`src/components/shell/app-sidebar.tsx`)
- under-logo line: `Home` → **`Your cards. Your call.`**
- brand tooltip: `CardStack — home` → **`Cardstack, home`** (casing + em-dash fixed)
- nav labels unchanged (Overview / All Cards / Sets / Binders); group "Vault"; "Series & Sets"

#### Billing / pricing (`src/routes/billing.tsx`)
- `<title>`: `Billing & plan — Pokémon TCG` → **`Billing & plan · Cardstack`**
- heading: `Billing & plan` (unchanged)
- sub: `…Plus adds hosted multi-device sync — self-hosters get it unbilled.` → **`The whole app is free and local-first. Plus pays for the sync servers, not for access to your own cards. Self-hosters get it unbilled.`**
- cloud-disabled: → **`Cloud is off on this build. Your Vault lives on this device, and there's nothing to bill.`**
- billing-disabled: → **`This instance runs self-hosted, so every cloud feature is already free. Nothing to upgrade.`**
- PLUS features: → **`Sync every card, every device`** · **`Stacks and binders kept in sync`** · **`Pick up on phone, tablet, or desktop`**
- FREE features: → **`Your full Vault, offline, no caps`** · **`CSV import and export, always on`** · **`Edit, delete, or export it anytime. It's your data.`**
- upgrade button: `Upgrade to Plus` → **`Get Plus`**
- manage button: `Manage subscription` (unchanged)
- success toast: `Welcome to Plus — your Vault now syncs everywhere.` → **`You're on Plus. Your Vault now syncs everywhere.`**

#### Auth / sign-in (`src/routes/auth/callback.tsx` + `src/components/shell/sidebar-user-menu.tsx`)
- callback `<title>`: `Signing in… — Pokémon TCG` → **`Signing in… · Cardstack`**
- loading heading: `Signing you in…` (unchanged)
- loading subtext: `Verifying your magic link.` → **`Checking your magic link. One sec.`**
- error title: `Sign-in link didn't work` → **`That link didn't work`**
- error body: `This sign-in link is invalid or has expired. Request a new one.` → **`This link is expired or already used. Ask for a fresh one and you're back in.`**
- catch-all error: `Sign-in failed.` → **`Sign-in hit a snag. Try the link again.`**
- cloud-disabled error: → **`Cloud sync is off in this build. Your cards still work locally.`**
- back button: `Back to your Vault` (unchanged)
- dialog title: `Sign in` → **`Sign in to sync`**
- dialog body: `Sync your Vault across devices. We'll email you a magic link — no password needed.` → **`Sign-in is just for sync. Browse and collect work fine without it. Want your Vault on every device? We'll email a magic link. No password, no snooping.`**
- menu items: `Sign in to sync` / `Edit profile` / `Billing & plan` / `Sign out` (unchanged)

#### Vault area (`src/routes/vault*.tsx`, `src/components/vault/*`)
- `vault.tsx` `<title>`: `Your Vault — Pokémon TCG` → **`Your Vault · Cardstack`**
- overview subtitle: `Every copy you own, joined live to the corpus.` → **`Every copy you own, in one place.`**
- overview empty (cards): `No cards yet, browse a set to start your collection.` → **`No cards yet. Find your first one and the chase begins.`**
- overview binders empty: `No binders yet. Create one to organize your collection.` → **`No binders yet. Make your first one.`** (terser — de-duped from the binders page)
- `cards.tsx` title: `All Cards` → **`All cards`**
- `cards.tsx` subtitle: `Browse and manage every card you own.` → **`Every card you own, yours to sort and track.`**
- `cards.tsx` loading: `Loading your collection…` → **`Pulling your cards…`**
- `owned-cards-grid.tsx` empty: `Your binder is empty. Add cards from any set.` → **`Nothing here yet. Add a card from any set to start the stack.`**
- `binders/index.tsx` subtitle: `Curated lists with smart rules and manual picks.` → **`Lists that fill themselves by rule, plus the ones you hand-pick.`**
- `binders/index.tsx` empty: `No binders yet. Create one to organize your card collection.` → **`No binders yet. Make one to group the cards that go together.`** (canonical full version)
- `sets/index.tsx` subtitle: `Track completion across every set.` → **`See how close you are on every set.`**
- `sets/index.tsx` empty: `You don't own any cards yet. Your sets will appear here once you add some.` → **`No cards yet, so no sets to track. Add a few and they show up here.`**
- loading states `Loading binders…` / `Loading sets…` (unchanged); nav toggles unchanged

#### Profile (`src/routes/profile.tsx`)
- `<title>`: `Your Profile — Pokémon TCG` → **`Your profile · Cardstack`**
- empty bio: `No bio yet.` → **`No bio yet. Add the cards you chase.`**
- fav-set empty: `No favorite set yet. Pick one to show it off.` → **`No favorite set yet. Pick the one you'd show off first.`**
- fav-set button: `Choose favorite set` → **`Pick favorite set`**
- eyebrow, default name "Collector", stat labels (cards owned / sets touched / est. value / collecting since): unchanged

#### Collection-management microcopy
- `card-detail.tsx` CTA: `＋ Add to collection` → **`＋ Add to Vault`** (matches "Back to your Vault"; removes first-person shift; fullwidth ＋ preserved)
- `binder-form-dialog.tsx` create: `Create a new binder to organize your card collection.` → **`A binder to sort your cards however you like. Sets, types, the chase pile.`**
- `binder-form-dialog.tsx` edit: `Update this binder's name and description.` → **`Rename this binder or tweak its description.`**
- `binder-picker-dialog.tsx` quick-add: `＋ New binder…` (unchanged; glyph preserved)
- `bulk-add-menu.tsx` desc: `Pick a binder to add these cards to.` → **`Drop these cards into a binder.`**

#### About dialog (`src/components/shell/about-dialog.tsx`)
- title: `About` → **`About Cardstack`**
- intro: `A fan-made browser for the Pokémon Trading Card Game. With thanks to:` → **`Cardstack is a fan-made, open-source collection manager for the Pokémon TCG. Local-first, your data, no ads, no snooping. Built by collectors, with thanks to:`**
- Pokémon credit body: → **`Pokémon and all related names are trademarks of Nintendo, Creatures Inc., and GAME FREAK inc. Cardstack is an unofficial, non-commercial fan project. It is not affiliated with, endorsed, or sponsored by them.`**
- Card data & images body: → **`Every card you browse and collect is served by the Pokémon TCG API.`**
- Holo effects body: → **`The holo and foil shaders that make the chase cards glint are adapted from Pokémon Cards CSS by Simon Goellner (@simeydotme).`**
- footer body: `Source code: TurtIeSocks/pokemon-tcg-viewer` → **`Open source, top to bottom. No landlord, no lock-in.`**
- footer link label: → **`View source on GitHub`** (href unchanged — still the real repo)

### Phase 2 — net-new community UI (gated on Discord hub URL)
- **Landing community section:** eyebrow **`Find your people`** · headline **`Collectors who get the chase`** · body **`You track your cards here. The talking happens on Discord, where the community shows off a pull, hunts down the last card in a set, and swaps notes with people who alphabetize their binders too.`** · CTA **`Join the Stack`**
- **Social-proof block (no number / default):** **`The community is brand new, which means the first collectors in get to shape it. No ads. No snooping. No landlord. Just your cards, and people who own them like you do.`**
- **Social-proof block (real-count variant, render only when a true count exists):** **`{count} collectors in so far. People who would rather own their collection than rent it. Come trade notes, show a pull, and chase the set together.`**
- **In-app hub nudges** (≤1 "the Stack" wink per page):
  - first card added: **`Nice pull. Other collectors would want to see that one. → Show it off`**
  - empty vault: **`Not sure where to start? Ask the collectors. They have opinions about every set. → Meet the collectors`**
  - set completed: **`Whole set, done. That earns a victory lap. The community is on Discord and they live for this. → Take a bow`**
- **Shared "join the hub" CTA variants:** `Join the Stack` (hero only) / `Meet the collectors` / `Find your people`

## 5. Deliverable docs

### `docs/brand/voice-and-messaging-guide.md`
Name + TM rule; positioning + tagline; the browse→collect→belong spine (+ eyebrow gating); voice principles with do/don't; the AI-tell ban list; lexicon (approved/banned terms); mechanics rules (accent, separators, connectors, "the Stack" cap); 3-4 before/after voice swatches from the deck; the i18n-deferred note.

### `docs/brand/community-launch-playbook.md`
Platform pick (Discord primary, rationale; Reddit later for discovery/SEO); community identity ("collectors who own their stuff"); channel architecture (start-here · show-your-pulls · trades · set-completion-help · feedback/roadmap · off-topic); new-member journey (pinned welcome, intro prompt, first-week nudges, app→hub bridge); founding-member plan (recruit 20-50 by hand, seed conversations, do things that don't scale); rituals (weekly "what'd you pull", monthly set-completion challenge, roadmap AMA); on-site→hub bridge (maps each Phase 2 nudge to its link); health metrics (DAU/MAU, new-member post rate, % non-staff posts) + warning signs; Phase 2 gate.

## 6. Testing / verification
- Copy is mostly static strings; no unit tests required for the rewrites themselves.
- Guard: a cheap repo-wide check that no user-facing string contains an em-dash (grep `—` across `src/`, excluding code comments) — catches regressions and enforces the hard ban.
- Tests that assert on changed strings (page titles, empty-state text) must be updated to match. Identify and fix them in the implementation plan.
- Verify in the dev preview: landing hero, sidebar, billing, auth dialog, vault empty states, about dialog render the new copy and the SSR `<head>` (title/OG) is correct.

## 7. Open follow-ups (not this pass)
- Stand up the Discord hub → unblocks Phase 2.
- Repo/package rename (separate, parked).
- i18n (separate future project; deck is the extraction map).
