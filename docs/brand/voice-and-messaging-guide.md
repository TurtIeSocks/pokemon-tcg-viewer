# Cardstack Voice & Messaging Guide

The source of truth for how Cardstack sounds. If a string ships to a user, it follows this guide. When in doubt, read a line out loud. If it sounds like a collector talking to another collector, it is right. If it sounds like a SaaS landing page, rewrite it.

## What Cardstack is

A local-first, open-source collection manager for the Pokémon TCG, and the on-ramp to a collector community. You browse the whole catalog for free, track every card you own (your data, on your device), and find the people who get the chase.

- **Name:** Cardstack. Always one word, capital C, lowercase rest. Never "CardStack", never "Card Stack".
- **Trademark rule:** the brand name stays Pokémon-free. "Pokémon TCG" appears only as a descriptor of what the app is for, never as part of the product name. Keep the accent: Pokémon.

## Positioning

**Tagline:** No ads. No snooping. No landlord. Just your cards.

Three things every corporate app does to you (ads, snooping, renting your own stuff back), then the payoff. Use the full four-beat line as the hero headline. Do not paste it verbatim into every surface (see "The tagline" under Mechanics).

**The spine: Browse, Collect, Belong.** Every surface ladders to one of these three steps:
1. **Browse** the whole catalog, free and instant, no account.
2. **Collect:** track every copy you own, local-first, your data.
3. **Belong:** find the collectors who get it (the Discord hub).

**Eyebrow gating rule:** the landing eyebrow only says `Belong` when a real community CTA ships on the same page. Until the community section is live, the eyebrow reads `Browse · Collect · Own it`. Never promise a step the page does not deliver.

## Voice

**Warm insider with a principled undercurrent.** A collector talking to a collector, who also happens to care that you own your data.

- **Warm insider:** second person "you", plus "we get it" solidarity. Self-aware and a little funny about the obsession (the chase, the pull, the fourth Charizard, alphabetizing binders). Celebrate the habit, never pathologize it.
- **Principled undercurrent:** open-source, local-first, your data, no corporate landlord, no ads, no snooping. Warmth on top, integrity underneath. The integrity is what makes the warmth credible.

### Do
- Write short. Periods over commas, commas over clauses.
- Talk like a person: "Pulling your cards…", "Nice pull.", "the chase begins."
- Be specific and confident. Say what the thing is.
- Let the principled bit show through naturally ("your data", "no snooping"), not as a lecture.

### Don't
- No corporate buzzwords or AI tells (see ban list).
- No hype-bro energy, no exclamation spam, no fake scarcity, no fabricated numbers or testimonials.
- No jargon wall. Collector slang is welcome but stays newcomer-legible.
- Never imply in-app social (following, feeds, public profiles, discovery) exists. It does not yet. Community lives on Discord; say so plainly.

## Hard bans (these read as AI-written, which kills a "we're real" brand)

- **No em-dashes.** Never use the "—" character in user-facing copy or in these docs. Use periods, commas, colons, or restructure. (Code comments are exempt.) A lone dash as a "no value" placeholder is fine. Dashes inside sentences are not.
- **Buzzwords:** seamless, elevate, streamline, optimize, unlock, supercharge, effortless, leverage, robust, empower, "look no further", "take it to the next level", "in today's fast-paced world", "whether you're X or Y".

## Lexicon

**Approved:**
- **Vault:** the product name for the collection area. The user's collection lives in their Vault.
- **Binder:** a curated list (smart rules plus manual picks).
- **Stack:** a quantity of identical physical copies (the data model term).
- **the chase, the pull, grails:** collector-native, use freely but lightly.
- **"the Stack":** the community nickname (members of the Stack; "Join the Stack"). A rare wink, not a refrain. Never on shipped Phase 1 surfaces, and at most one prominent hit per community surface.

**Banned / retired:**
- "Holo Playground", "browse & admire the holo", "viewer", "browser-for-cards" framing. The product is a collection manager and community, not a holo viewer.
- Corporate-speak for the user's own data ("unlock your collection", "premium features").

## Mechanics (the small rules that keep copy consistent)

- **Accent:** always "Pokémon" with the é.
- **Title separators:** `Cardstack: <descriptor>` when the brand leads (home, OG title). `<Page> · Cardstack` (middot) when the page leads (Vault, Profile, Billing, Auth). Never use a pipe.
- **Connectors:** use `&` in short title-case labels ("Billing & plan", "Series & Sets", "Card data & images"). Spell out "and" in sentence and feature copy ("CSV import and export, always on").
- **The tagline:** the full four-beat line is the hero headline only. Elsewhere, use a fragment ("No landlord. Just your cards.") or restructure, so it lands as a signature, not a slogan on loop. Thematic echoes ("no ads, no snooping" in the About) are fine. Full verbatim repetition is not.
- **Glyphs:** preserve existing button glyphs (the fullwidth `＋` on add buttons).

## Voice swatches (before to after, from the rebrand)

- Hero: `Pokémon TCG / Holo Playground` becomes **No ads. No snooping. / No landlord. Just your cards.**
- Empty vault: `No cards yet, browse a set to start your collection.` becomes **No cards yet. Find your first one and the chase begins.**
- Loading: `Loading your collection…` becomes **Pulling your cards…**
- Billing: `Plus adds hosted multi-device sync.` becomes **Plus pays for the sync servers, not for access to your own cards.**
- Sign-in: `Sync your Vault across devices.` becomes **Sign-in is just for sync. Browse and collect work fine without it.**
- About: `A fan-made browser for the Pokémon Trading Card Game.` becomes **Cardstack is a fan-made, open-source collection manager for the Pokémon TCG. Local-first, your data, no ads, no snooping.**

## A note on i18n

Cardstack is English-only for now, and the voice is deliberately English-idiomatic ("the fourth Charizard", "the chase"). These do not survive literal translation. If the app ever ships another language, treat it as transcreation (rewrite the intent per locale), not string-for-string translation, and give it its own project. The full old-to-new copy deck in `docs/superpowers/specs/2026-06-26-cardstack-rebrand-copy-design.md` is the map of every translatable string.
