# Refactor Goals — Vite SPA → TanStack Start (SSR)

Captured from the brainstorm (2026-05-31). Open items flagged ⬜ — resolved in the Phase 2 checkpoint.

## Driving goals (checklist)

- ✅ **Architecture / framework change** — Vite SPA + React Router 7 *data mode* → **TanStack Start** (SSR + Nitro). Stays React, stays one app tree.
- ✅ **SEO / shareability — PRIMARY.** Series, sets, and individual cards must be crawlable with their own `<title>` + OG previews. This is the #1 reason for the move.
- ✅ **Structure / maintainability — secondary bonus.** Nested layouts + file routing + colocated server loaders, welcomed but not the driver.
- ➖ Performance — not a stated pain; SSR first-paint is a side benefit, not a target metric.

## Probes / decisions already settled

| Topic | Decision |
|---|---|
| Crawl depth | Series + sets + **individual cards** all get real URLs + OG. |
| Card render | On-demand (**SSR + cache**), *not* prerender-all-20k. "Render once, cache till TTL." |
| ISR mechanism | No heavyweight ISR needed — **`Cache-Control: s-maxage + stale-while-revalidate`** on SSR routes, cached by CF edge + nginx. Card identity is static; live prices are a client island so never stale in cache. |
| Series render | **Prerender** at build (~15, monthly). |
| Sets render | **SSR + long SWR** (like cards). |
| Hosting (v1) | **Self-host Node** (`.output`) on home server, behind existing **Cloudflare + nginx** (2-tier SWR cache). |
| Data layer (v1) | **Keep CF Worker + R2** as-is; app fetches `/corpus` + `/v2/` over network. Optionally absorb Worker into Start server + move corpus to disk/MinIO *later*. |
| Secrets | API key → server env (`/etc/tcg/env`), never shipped to client. |
| CI/CD | **GitHub Actions self-hosted runner** (dials out, NAT-friendly) → build → rsync `.output` → `systemctl restart`; nginx serves stale through the ~1s restart. |

## Constraints

- **Team:** solo dev. Hobby/personal project.
- **Timeline:** none hard.
- **Breaking changes:** allowed (no external API consumers; URLs change anyway).
- **Keep working:** holo effect, virtual grid, instant corpus search, collection, PWA/offline.
- **Stack kept:** React 19 + Compiler, Zustand, Virtuoso, Tailwind v4, Biome, Bun.

## ✅ RESOLVED — Phase 2 checkpoint

1. **Slug scheme:** **Pretty slugs** — `/sword-shield/brilliant-stars/charizard-vstar-018`. Build a `slug↔id` map from the corpus at build time. Need a rename/collision policy (append disambiguator on collision; keep old slugs as redirects on rename).
2. **Global search + by-pokédex → dedicated entity routes:** `/search?q=…` (name search) and `/pokemon/{name}` (cross-set view, e.g. "all Charizard"). The by-Pokémon page becomes its own crawlable SEO entity. All cross-links retarget to `/pokemon/{name}`.
3. **Per-set facets:** **Yes** — filter options computed from the selected set's actual cards, server-side in the set loader. Replaces today's app-wide filter lists.
4. **Strategy:** **Big-bang on a branch.** Rewrite routing + data layer wholesale, reuse components as islands, cut over in one merge.
