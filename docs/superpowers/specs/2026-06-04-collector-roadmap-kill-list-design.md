# Ultimate Open-Source Pokémon TCG Collector — Roadmap & Kill List

**Date:** 2026-06-04
**Status:** Approved roadmap (each phase item spawns its own brainstorm → spec → plan cycle)
**Inputs:** `.superpowers/pokemon-tcg-research-report.md` (competitive research) + a read-only recon of the current codebase.

---

## Thesis / positioning

We are **not** building a price site (PriceCharting owns that), a marketplace (TCGplayer owns that), or a speculation dashboard. We are building the **trusted collector ledger that survives us**: local-first, exportable, variant-aware, provenance-rich, with optional hosted sync as the paid tier.

The research report identifies this as the single clearest unmet opening in the market. The cautionary benchmark is the official Pokémon TCG Card Dex (sunset Sept 2023, no data export) — proof that collectors now value **portability and independence over "official" branding**.

We already hold ~80% of the report's recommended MVP. This roadmap is about the remaining differentiators, ordered.

### Already shipped (recon-confirmed — the report calls these the hard part)
- Per-copy ledger with provenance (`CollectionItem`: `acquiredAt`, `pricePaid`, `variant`, `condition`, `grading`, `notes`, `isPrimary`, `label`) — `src/store/userland/types.ts:13`
- Manual entry + bulk add + faceted search — `src/routes/search.tsx`, `src/components/vault/bulk-add-menu.tsx`
- Set + binder progress (owned-by-set, hybrid smart-rule + manual binders) — `src/store/userland/selectors.ts`, `src/routes/vault/**`
- JSON backup/restore with `schemaVersion` — `src/store/userland/backup.ts`
- Read-only share links (hash-encoded, deflate-compressed snapshot) — `src/routes/vault/shared.tsx`, `src/store/userland/share.ts`
- Liquid Glass design system; 20,359-card corpus (English, pokemontcg.io)

### Real gaps vs. the field
English-only corpus · no scanner · prices display-only (no portfolio/P&L) · JSON-only (no CSV) · no `source`/`storageLocation` fields · single-user (no household/live multi-user) · no hosted-sync/self-host backend.

---

## Locked decisions

| Decision | Choice |
|---|---|
| Lead thrust | **Trust & portability** (report's defensible position; ~80% already built) |
| Sync / self-host model | **Supabase.** Local IndexedDB **or** self-host-your-own-Supabase = free/OSS forever. Hosted Supabase (we provide) w/ auth+sync = **monetization tier.** Mirrors report's "open-source core, paid convenience hosting." |
| Phase order | 0 Trust → **1 Social** → **2 Catalog** → 3 Scanner → 4 Valuation |
| Parallelism | Phase 1 (Social, Supabase-bound) and Phase 2 (Catalog, corpus-bound) are **parallelizable tracks** — disjoint subsystems |
| Import wedge | Competitor CSV importers are **headlined as a first-class growth goal**, not a backup feature |
| Repo | Already public. "Open-source it" = governance/docs polish, not a build |
| Licensing & sustainability | **AGPL-3.0 core** + **open-core via plugin seam**: billing/tenancy in a private `@tcgvault/cloud` package behind an open interface. No source-available/non-compete license. Public "our deal" promise + open funding (Sponsors). Rug-pull-proof by construction. See [Licensing & sustainability model](#licensing--sustainability-model). |

**Architectural keystone:** Supabase plugs into the existing repository port. CLAUDE.md: *"To add a hosted DB later, write a remote adapter + swap the factory."* `getRepos()` swaps the IDB adapter for a Supabase adapter based on auth state. No storage calls scattered into features.

---

## Phase 0 — Trust & Portability `LEAD`

Lock "your collection survives us." Cheap wins first; Supabase capstone last.

| # | Item | Size | Dep | Why |
|---|------|------|-----|-----|
| **0.1** | **CSV import/export + competitor importers** (Pokellector / TCG Collector / generic spreadsheet → us) with a column-mapping UI and per-format adapters | S–M | — | Report MVP #5 ("CSV **and** JSON"). The real prize is the **migration on-ramp**: Elite Fourum users live in spreadsheets; TCG Collector / Pokellector users are trapped. CSV-in = steal their users. Highest-leverage growth item in the roadmap. Extends `src/store/userland/backup.ts` + `src/components/vault/import-dialog.tsx`. |
| **0.2** | **Provenance fields**: `source`/seller + `storageLocation` on `CollectionItem` | S | — | Report MVP #1 lists both; recon confirms absent (`types.ts:13`). Dex's whole edge is provenance — cheap to match and exceed. Optional fields, `null` never `undefined`; bump `schemaVersion` → 2 with migration. |
| **0.3** | **Governance, license & funding**: relicense MIT→**AGPL-3.0** (`LICENSE` + `license` field in `package.json`), `LICENSING.md`, README + CONTRIBUTING + CODE_OF_CONDUCT, an **"Our deal" promises** section (free-forever / how we earn / what we'll never do), GitHub **Sponsors** + transparent "hosted funds development" line, public roadmap (this doc → issues/Projects), versioned schema doc, catalog-gap log + price-source status page | S | — | Trust engine **+ anti-rug-pull insurance**: set the boundary up front, in public, before anyone's locked in. 100%-owned copyright → relicense is clean. |
| **0.4** | **Supabase remote adapter** behind the repo port — Auth + Row-Level-Security + local-first sync | **L** | 0.2 | Capstone. Implement `RemoteCollectionRepo`/`RemoteBindersRepo`/`RemoteBackupRepo`; `getRepos()` swaps on auth. Postgres tables mirror `CollectionItem` + `Binder`. Self-host-your-own-Supabase = free tier; our hosted instance = paid tier. Unlocks Phase 1. |

**Hard sequence:** 0.2 finalizes the data model **before** 0.4 mirrors it into Postgres — otherwise Postgres migrates twice. 0.1 and 0.3 parallelize freely.

**Resolved (was a parked fork):** core relicenses MIT→**AGPL-3.0**; commercial protection lives in a private billing *plugin*, not a restrictive core license. AGPL is real OSS (keeps the label + community + trust) and deters closed corporate free-riding — but does *not* itself bar commercial hosting; that's intentional, since the moat is operating the service, not the bits. Full rationale + model in [Licensing & sustainability model](#licensing--sustainability-model). (Permissive licensing still fine for any standalone SDK / import libs.)

**Parked fork (decide during 0.4):** sync conflict-resolution strategy. Default proposal: last-write-wins per physical copy (copies are append-mostly), documented; revisit if the "sync conflict rate" metric is poor.

---

## Phase 1 — Social & Household `#1` (parallel track A)

Rides Supabase Auth/RLS/Realtime from 0.4. Report: household support is "almost nonexistent" across the entire field = a clean open gap.

| # | Item | Size | Dep | Why |
|---|------|------|-----|-----|
| **1.1** | **Real shared-collection household model** (shared *data*, not just shared billing) | M | 0.4 | Report's exact gap: rivals offer "subscription family sharing, **not** shared-collection data models." RLS encodes household membership. |
| **1.2** | **Live shared binders** (Realtime) — upgrade today's read-only hash snapshot | M | 0.4 | Keep the offline snapshot as the no-account path; add a subscribed live view for signed-in users. `vault/shared.tsx` + `share.ts` already model the snapshot. |
| **1.3** | **Wishlist + Trade-list as first-class types** (today: only generic Binders) | S–M | — (local-only OK early) | Report MVP #4: "first-class entities, not hacks on top of folders." Recon confirms no distinct types exist. |
| **1.4** | **Lightweight trade workflow** — propose/accept between trade-lists, auto-deduct owned on completion | M | 1.3, 0.4 | Report pain point: TCGplayer users beg for a wishlist that auto-deducts purchases. **NOT a marketplace** (report: "marketplace never as the core"). |

---

## Phase 2 — Catalog / Multilingual `#2` (parallel track B)

The field's #1 repeated complaint and our biggest "ultimate" differentiator. Largest data-engineering lift. Independent of Supabase — runs parallel to Phase 1.

| # | Item | Size | Dep | Why |
|---|------|------|-----|-----|
| **2.1** | **Corpus → TCGdex** (replace/augment pokemontcg.io, English-only today) | **L** | — | Report's recommended source (multilingual, strong GitHub traction). Rebuild the `/corpus` edge-blob pipeline (crawl → R2, per corpus-cache PR #4). |
| **2.2** | **Language model on cards + copies**; variant + name normalization across EN / JP / ZH | **L** | 2.1 | A Japanese promo ≠ its English counterpart. Report: "a genuine data-engineering problem, not just UI." |
| **2.3** | **Japanese + Chinese** sets, search, and dex views | M | 2.2 | The user-visible payoff; attacks the most-cited missing feature (Japanese promos, Chinese coverage). |
| **2.4** | **Variant fidelity pass** — reverse holo, promo, slab, sealed | M | 2.2 | Report pain: "some variants cannot be tracked." Tightens the model beyond TCGplayer printing keys. |

---

## Phase 3 — Scanner / OCR `#3`

Report frames scanning as an **accelerant, not a differentiator** (we already have fast manual entry). The differentiator is **confidence transparency**, not raw capture.

| # | Item | Size | Dep | Why |
|---|------|------|-----|-----|
| **3.1** | On-device OCR → corpus match (name + number + set symbol) | **L** | — | Report architecture: "on-device OCR first, server fallback." |
| **3.2** | **Confidence scores + top-N confirm** (never false certainty) | M | 3.1 | Report MVP #7 + first-year metric. *This* is the moat — rivals' scan reliability is "much less trustworthy than their landing pages imply." |
| **3.3** | Holo / foil disambiguation | **L** | 3.2, **Phase 2** | Report's hardest scan pain. **Why Catalog precedes Scanner:** you scan *into* a good variant model. |
| **3.4** | Batch / bulk scan flow | M | 3.2 | Throughput for large collections. |

---

## Phase 4 — Valuation & P&L `#4` (last)

Deliberately last — fits the "collector ledger, not speculation dashboard" philosophy (report's pricing-mistrust warning). Cheaper than its slot implies: we already display TCGplayer/CardMarket prices (`src/components/islands/card-prices.tsx`, `src/server/card-mappers.ts:87`).

| # | Item | Size | Dep | Why |
|---|------|------|-----|-----|
| **4.1** | Portfolio valuation rollup + cost-basis (`pricePaid`) vs market **P&L** | M | — | Price display already exists; this is the aggregation + delta. |
| **4.2** | Price-history snapshots + value-over-time chart | M | 0.4 (storage) | Report metric: price-source latency. Supabase-stored history. |
| **4.3** | **Toggle to hide value entirely** + condition-aware pricing + source/timestamp labels | S | — | Report: "do not force a speculative worldview." Respects completion/family collectors. |
| **4.4** | PriceCharting connector (graded / sealed coverage) | M | — | Report's licensed-pricing recommendation. Optional, clearly labeled by source. |

---

## Dependency graph (critical edges)

```
0.1 ─┐
0.3 ─┤  (parallel, no inter-dependency)
0.2 ─┴──▶ 0.4 Supabase ──▶ Phase 1 Social ──┐
                                             ├─ parallel tracks (disjoint subsystems)
          Phase 2 Catalog ───────────────────┘   ← independent of 0.4, starts anytime
               │
               ▼
          Phase 3 Scanner    (needs Phase 2 variant model)
               │
               ▼
          Phase 4 Valuation  (4.2 wants 0.4 storage; rest independent)
```

---

## Cross-cutting principles (apply to every phase)

- **No ads, ever**, in the core product (report).
- **Report's first-year outcome metrics** are continuous, not a task: import/export reliability, catalog-gap response time, variant correctness, scanner confidence transparency, D30 retention among active collectors.
- **`null` never `undefined`** for optional fields (IDB/JSON/SQL agreement) — survives the Supabase migration cleanly.
- **Never break the repository-port abstraction** — all storage goes through `CollectionRepo`/`BindersRepo`/`BackupRepo`.
- Pricing is always **optional and source/timestamp-labeled**; the product must be fully useful with value hidden.

---

## Licensing & sustainability model

**Decision:** open-core, **AGPL-3.0** core, commercial value protected by *architecture + operations*, not by a restrictive license. **Rug-pull-proof by construction** — the open core never contains the commercial code, so there is nothing to claw back later.

**Why this shape (founder context):** the goal is to keep writing the open-source code we love, keep the community's trust, *and* not burn out from zero income. A hosted convenience tier aligns those — community growth → self-hosters → some convert to hosted → the open work gets funded. Commercial interest and OSS values point the same way instead of fighting. The "sneaky rug-pull" pattern is *changing the deal after people commit* (Terraform→OpenTofu, Redis, Elastic); this model makes that impossible because the deal never included withholding the core.

### The split

- **Open core — AGPL-3.0** (`src/**`, corpus, IDB **+ Supabase adapters**, schema/migrations, CSV/JSON, all UI). AGPL over MIT deliberately: still 100% OSS + self-host friendly, but deters closed corporate free-riding. Self-host gets full multi-device sync for free.
- **Private commercial layer — `@tcgvault/cloud`** (separate private repo / private npm pkg): Stripe billing, multi-tenant control plane, quota/credit metering, paid-tier server jobs. *Not published* — trade secret, not source-available.

Line: **single-tenant self-host = open · multi-tenant SaaS operations = private.** The paywall is *operating the service*, which can't be pirated — so no non-compete license is needed.

### Plugin seam (mirrors `getRepos()`)

```
src/billing/
  billing-port.ts        # OPEN — BillingProvider interface + Entitlements types
  community-billing.ts   # OPEN — default: everything free, self-host, no Stripe
  get-billing.ts         # OPEN — factory; picks provider from config
@tcgvault/cloud          # PRIVATE — stripe-billing.ts, tenancy.ts, server/webhooks.ts
```

Community build → free/self-host. Our cloud build injects `@tcgvault/cloud` via build config (private npm pkg, preferred over git submodule). Others *may* write their own billing plugin and monetize — explicitly allowed; we keep only *our* implementation private. **Build the seam (~3 files when entitlements first matter, ≈0.4), not a plugin platform** — a third-party registry only if that demand becomes real.

### The promise (anti-rug-pull insurance) — draft for `LICENSING.md` / README

> **Our deal with you.** The Pokémon TCG Vault client, your collection data, export/import, and the self-hosted path are open source under AGPL-3.0 — and always will be. We make money by *operating* an optional hosted sync service, never by removing features from the open core or relicensing it out from under you. If we ever stop running the hosted service, your data and a fully working app remain yours, exportable, and self-hostable.

Stated up front, before anyone is locked in — the structural opposite of a late relicense.

### Escalation option (held, not taken)

If a real commercial threat ever appears (someone reselling the hosted core at scale), a license escalation (FSL/ELv2 on a *future* layer) stays available. Not adopted now: for a new niche product, **obscurity is the real risk, not theft** — over-restricting early strangles the adoption worth protecting. Protect options without spending trust today.

### Funding

GitHub **Sponsors** from day one, transparent "hosted tier funds development" framing. Donations supplementary; the hosted tier is the durable base (report: donation-only OSS trackers are fragile).

---

## Next step

This is a roadmap, not a single implementation plan. Per the decomposition principle, **each item gets its own brainstorm → spec → plan → implementation cycle.**

Recommended first cycle: **Phase 0.1 — CSV import/export + headlined competitor importers** (highest-leverage growth item, unblocked, ships immediately).
