# Multilingual Card Catalog — Phase 1a Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the card corpus from English-only pokemontcg.io to TCGdex as the source of truth, English-only — same visible behavior, new provenance, all stored corpus-ids migrated, pricing dark, image gaps backfilled from pokemontcg.io.

**Architecture:** Keep the corpus pipeline whole (build → R2 → worker → IDB → in-memory index → `hydrateCard` → render). Swap the data source to TCGdex, add a committed `set-crosswalk.json` + `id-crosswalk.ts` so old pokemontcg.io ids translate deterministically, repoint the live SSR fetch + worker passthrough, drop pricing behind a flag, and migrate existing userland corpus-ids once.

**Tech Stack:** TypeScript, Bun (runner + build script), TanStack Start, Zustand, `idb-keyval`, Cloudflare Worker + R2, TCGdex (`api.tcgdex.net` / self-hosted `tcgdex/server` Docker), Vitest-style Bun tests (happy-dom + fake-indexeddb preloaded via `bunfig.toml`).

**Companion spec:** `docs/superpowers/specs/2026-06-28-multilingual-catalog-design.md` (read Decisions D1–D7 + Appendix A before starting).

## Global Constraints

- **Source of truth = TCGdex.** EN catalog built from a self-hosted `tcgdex/server` Docker mirror in CI (crawl `http://localhost:3000/v2/en`); local dev may point at `https://api.tcgdex.net/v2/en`. Never do a ~20k-request public-API crawl.
- **Images: hotlink `assets.tcgdex.net` directly** (no worker image proxy in 1a). For cards TCGdex lacks an image, bake a **pokemontcg.io** fallback URL at build via the crosswalk. Cover **every** gap card incl. fringe.
- **Pricing is OFF.** TCGdex returns a `pricing` object; the mapper drops it. UI gated behind `PRICING_ENABLED = false` (kept as the PriceCharting seam, not deleted).
- **Optional fields are `null`, never `undefined`** (IDB/JSON/SQL agree).
- **Userland record ids are UUIDv7**; corpus ids are TCGdex `{setId}-{localId}`.
- **Money in minor units (cents)** — unchanged here.
- **No em-dashes in user-facing copy** (code/docs unaffected).
- **Two version axes, do not conflate:** snapshot `schemaVersion` 5 → 6; IDB `CURRENT_DATA_VERSION` 4 → 5.
- **Tests must not hit the network.** Pre-seed corpus runtime / inject fetch seams; never let a test reach pokemontcg.io or tcgdex.
- Lint/format: `bunx biome check --write <files>` (pass explicit paths). Typecheck: `bunx tsc -b`. Tests: `bun test <file>`.
- 1a is a **review/commit boundary, not a release** — it ships together with Phase 1b. Do not deploy 1a alone.

---

## File Structure

**Create:**
- `scripts/set-crosswalk.json` — committed, human-reviewed pokemontcg.io→TCGdex set-id map (divergent sets only; identity assumed otherwise). Seeded from spec Appendix A.
- `scripts/id-crosswalk.ts` — pure id-translation functions over the table.
- `scripts/id-crosswalk.test.ts`
- `src/lib/pricing-flag.ts` — `PRICING_ENABLED` constant (the seam).

**Modify:**
- `src/store/corpus/corpus-types.ts` — add `imageBase` to `CorpusCard`.
- `scripts/build-corpus.ts` — TCGdex source, new `trimCard`, gap log, crosswalk validation.
- `scripts/build-corpus.test.ts` — TCGdex-shape fixtures.
- `worker/src/index.ts` — `ORIGIN` → TCGdex; `/v2/*` passthrough.
- `src/server/card-data-fetch.ts` — `fetchAllSets` / `fetchCardById` to TCGdex shape.
- `src/server/card-mappers.ts` — TCGdex card → `FocusCardData`, drop pricing.
- `src/lib/api-base-client.ts` — default origin → TCGdex.
- `src/components/islands/card-prices.tsx`, `src/components/card/card-pricing-tab.tsx` — gate on `PRICING_ENABLED`.
- `src/store/userland/types.ts` — `UserDataSnapshot.schemaVersion: 5 | 6`.
- `src/store/userland/backup.ts` — `SUPPORTED_VERSIONS` += 6; `upgrade()` v5→v6 id remap.
- `src/store/userland/idb-repo.ts` — `CURRENT_DATA_VERSION` 4→5; `migrateUserlandData` v4→v5 remap.
- `src/store/userland/supabase-repo.ts` — `schemaVersion: 6` literal bump only (cloud row migration is out of scope, see spec).
- `src/components/dev/seed-data.ts` — restrict generated `language` to supported set.

---

## Task 1: ID crosswalk (set table + translation functions)

Foundational pure functions every later task consumes. Table-driven so there is no fragile runtime regex; the regex/fold cases from the probe are baked into the committed JSON.

**Files:**
- Create: `scripts/set-crosswalk.json`
- Create: `scripts/id-crosswalk.ts`
- Test: `scripts/id-crosswalk.test.ts`

**Interfaces:**
- Produces:
  - `ptcgSetToTcgdex(setId: string): string` — table lookup, identity default.
  - `tcgdexSetToPtcg(setId: string): string` — reverse lookup, identity default.
  - `tcgdexCardToPtcg(id: string): string` — split `{setId}-{localId}`, reverse-map setId, strip leading zeros off localId (pokemontcg.io never zero-pads).
  - `ptcgImageUrl(setId: string, number: string): { large: string; small: string }` — `https://images.pokemontcg.io/{setId}/{number}[_hires].png`.
- Note: the **hard** direction (ptcg→tcgdex exact card id) is NOT a pure string op (TCGdex pad width is set-specific); it is resolved against the loaded corpus in Task 7/8 via numeric localId match. This module only provides the easy `tcgdexCardToPtcg` (for image fallback) + the set table.

- [ ] **Step 1: Seed the crosswalk table**

Create `scripts/set-crosswalk.json` (pokemontcg.io key → TCGdex value; only divergent sets — every set not listed is identity):

```json
{
  "sv1": "sv01", "sv2": "sv02", "sv3": "sv03", "sv3pt5": "sv03.5",
  "sv4": "sv04", "sv4pt5": "sv04.5", "sv5": "sv05", "sv6": "sv06",
  "sv6pt5": "sv06.5", "sv7": "sv07", "sv8": "sv08", "sv8pt5": "sv08.5",
  "sv9": "sv09", "sv10": "sv10",
  "sm35": "sm3.5", "sm75": "sm7.5", "sm115": "sm11.5",
  "swsh35": "swsh3.5", "swsh45": "swsh4.5", "swsh45sv": "swsh4.5",
  "swsh10tg": "swsh10", "swsh9tg": "swsh9", "swsh11tg": "swsh11",
  "swsh12tg": "swsh12", "swsh12pt5": "swsh12.5", "swsh12pt5gg": "swsh12.5",
  "me1": "me01", "me2": "me02", "me2pt5": "me02.5", "me3": "me03", "me4": "me04",
  "rsv10pt5": "sv10.5w", "zsv10pt5": "sv10.5b",
  "base6": "lc", "hsp": "hgssp", "pgo": "swsh10.5", "bp": "bog",
  "fut20": "fut2020", "cel25c": "cel25",
  "tk1a": "tk-ex-latia", "tk1b": "tk-ex-latio", "tk2a": "tk-ex-p", "tk2b": "tk-ex-m",
  "mcd11": "2011bw", "mcd12": "2012bw", "mcd14": "2014xy", "mcd15": "2015xy",
  "mcd16": "2016xy", "mcd17": "2017sm", "mcd18": "2018sm", "mcd19": "2019sm",
  "mcd21": "2021swsh", "mcd22": "2022swsh"
}
```

(This is the human-reviewed seed; Task 3 validates it against the live TCGdex set list and logs any unseen divergent sets.)

- [ ] **Step 2: Write the failing test**

Create `scripts/id-crosswalk.test.ts`:

```ts
import { expect, test } from "bun:test";
import {
  ptcgSetToTcgdex, tcgdexSetToPtcg, tcgdexCardToPtcg, ptcgImageUrl,
} from "./id-crosswalk";

test("set translation: verbatim sets are identity", () => {
  expect(ptcgSetToTcgdex("swsh3")).toBe("swsh3");
  expect(ptcgSetToTcgdex("base1")).toBe("base1");
});

test("set translation: divergent sets use the table both ways", () => {
  expect(ptcgSetToTcgdex("sv1")).toBe("sv01");
  expect(ptcgSetToTcgdex("base6")).toBe("lc");
  expect(tcgdexSetToPtcg("sv01")).toBe("sv1");
  expect(tcgdexSetToPtcg("lc")).toBe("base6");
});

test("tcgdexCardToPtcg: reverse setId + strip leading zeros on number", () => {
  expect(tcgdexCardToPtcg("sv01-001")).toBe("sv1-1");
  expect(tcgdexCardToPtcg("swsh3-136")).toBe("swsh3-136"); // verbatim
  expect(tcgdexCardToPtcg("2019sm-12")).toBe("mcd19-12");
});

test("ptcgImageUrl builds hires + small CDN urls", () => {
  expect(ptcgImageUrl("base1", "4")).toEqual({
    large: "https://images.pokemontcg.io/base1/4_hires.png",
    small: "https://images.pokemontcg.io/base1/4.png",
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun test scripts/id-crosswalk.test.ts`
Expected: FAIL — `Cannot find module './id-crosswalk'`.

- [ ] **Step 4: Implement `id-crosswalk.ts`**

Create `scripts/id-crosswalk.ts`:

```ts
import table from "./set-crosswalk.json";

const PTCG_TO_TCGDEX: Record<string, string> = table;
const TCGDEX_TO_PTCG: Record<string, string> = Object.fromEntries(
  // First mapping wins on collisions (e.g. swsh4.5 has two ptcg sources);
  // the reverse is only used for image-fallback url construction, where any
  // valid pokemontcg.io set id for the artwork is acceptable.
  Object.entries(PTCG_TO_TCGDEX).map(([ptcg, tcgdex]) => [tcgdex, ptcg]),
);

export function ptcgSetToTcgdex(setId: string): string {
  return PTCG_TO_TCGDEX[setId] ?? setId;
}

export function tcgdexSetToPtcg(setId: string): string {
  return TCGDEX_TO_PTCG[setId] ?? setId;
}

/** TCGdex id -> pokemontcg.io id. Easy direction: reverse setId, strip zero-pad. */
export function tcgdexCardToPtcg(id: string): string {
  const dash = id.indexOf("-");
  const setId = id.slice(0, dash);
  const localId = id.slice(dash + 1);
  const ptcgSet = tcgdexSetToPtcg(setId);
  // Strip leading zeros only for purely-numeric localIds; promos like "SWSH001"
  // and gallery ids like "TG01" keep their form (pokemontcg.io matches them).
  const ptcgNum = /^\d+$/.test(localId) ? String(Number(localId)) : localId;
  return `${ptcgSet}-${ptcgNum}`;
}

export function ptcgImageUrl(
  setId: string,
  number: string,
): { large: string; small: string } {
  const root = `https://images.pokemontcg.io/${setId}/${number}`;
  return { large: `${root}_hires.png`, small: `${root}.png` };
}
```

Ensure `tsconfig`/Bun JSON import works (Bun imports JSON natively; add `"resolveJsonModule": true` to `tsconfig.json` if `tsc -b` complains).

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test scripts/id-crosswalk.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Lint + typecheck**

Run: `bunx biome check --write scripts/id-crosswalk.ts scripts/id-crosswalk.test.ts && bunx tsc -b`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add scripts/set-crosswalk.json scripts/id-crosswalk.ts scripts/id-crosswalk.test.ts
git commit -m "feat(corpus): pokemontcg.io<->TCGdex id crosswalk"
```

---

## Task 2: CorpusCard.imageBase + TCGdex trimCard mapping

Pure mapping from a TCGdex card object to `CorpusCard`, including the image-base strip and pokemontcg.io fallback. No network.

**Files:**
- Modify: `src/store/corpus/corpus-types.ts`
- Modify: `scripts/build-corpus.ts:41-58` (`trimCard` + the `ApiCard` shape)
- Test: `scripts/build-corpus.test.ts`

**Interfaces:**
- Consumes: `tcgdexCardToPtcg`, `ptcgImageUrl` (Task 1).
- Produces: `trimCard(card: TcgdexCard): CorpusCard` where `CorpusCard` gains `imageBase: string | null`.

- [ ] **Step 1: Add `imageBase` to the type**

In `src/store/corpus/corpus-types.ts`, inside `CorpusCard`, after `imageUrlSmall`:

```ts
  imageUrl: string;
  imageUrlSmall: string;
  /** Language-invariant TCGdex image tail "{serie}/{set}/{localId}"; null => no
   * localized image, use imageUrl (which is then a pokemontcg.io fallback). */
  imageBase: string | null;
```

- [ ] **Step 2: Write the failing test**

In `scripts/build-corpus.test.ts`, add TCGdex-shape fixtures + tests:

```ts
import { expect, test } from "bun:test";
import { trimCard, type TcgdexCard } from "./build-corpus";

const withImage: TcgdexCard = {
  id: "swsh3-136", localId: "136", name: "Furret", category: "Pokemon",
  image: "https://assets.tcgdex.net/en/swsh/swsh3/136",
  rarity: "Uncommon", set: { id: "swsh3" }, dexId: [162], types: ["Colorless"],
  stage: "Stage1",
  variants: { firstEdition: false, holo: false, normal: true, reverse: true, wPromo: false },
};

const noImage: TcgdexCard = {
  id: "sm3.5-1", localId: "1", name: "Articuno", category: "Pokemon",
  set: { id: "sm3.5" }, variants: { normal: true },
};

test("trimCard maps a TCGdex card with an image", () => {
  const c = trimCard(withImage);
  expect(c.id).toBe("swsh3-136");
  expect(c.name).toBe("Furret");
  expect(c.setId).toBe("swsh3");
  expect(c.number).toBe("136");
  expect(c.imageBase).toBe("swsh/swsh3/136");
  expect(c.imageUrl).toBe("https://assets.tcgdex.net/en/swsh/swsh3/136/high.webp");
  expect(c.imageUrlSmall).toBe("https://assets.tcgdex.net/en/swsh/swsh3/136/low.webp");
  expect(c.supertype).toBe("Pokémon");
  expect(c.variants).toEqual(["normal", "reverse"]);
  expect(c.nationalPokedexNumbers).toEqual([162]);
});

test("trimCard falls back to pokemontcg.io image when TCGdex has none", () => {
  const c = trimCard(noImage);
  expect(c.imageBase).toBeNull();
  // sm3.5 -> ptcg sm35 (reverse table), localId 1
  expect(c.imageUrl).toBe("https://images.pokemontcg.io/sm35/1_hires.png");
  expect(c.imageUrlSmall).toBe("https://images.pokemontcg.io/sm35/1.png");
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `bun test scripts/build-corpus.test.ts`
Expected: FAIL — `trimCard` signature/`TcgdexCard` not exported / assertions mismatch.

- [ ] **Step 4: Rewrite the `ApiCard` shape + `trimCard`**

In `scripts/build-corpus.ts`, replace the pokemontcg.io `ApiCard` interface and `trimCard` (lines ~11-58). Add:

```ts
import { ptcgImageUrl, tcgdexCardToPtcg } from "./id-crosswalk";

const ASSET_PREFIX = "https://assets.tcgdex.net/en/";

export interface TcgdexCard {
  id: string;
  localId: string;
  name: string;
  category: "Pokemon" | "Trainer" | "Energy";
  image?: string;            // host+lang+path, no extension; absent => no image
  rarity?: string;
  set: { id: string };
  dexId?: number[];
  types?: string[];
  stage?: string;            // Pokemon: Basic | Stage1 | Stage2 | ...
  trainerType?: string;      // Trainer subtype
  energyType?: string;       // Energy subtype
  suffix?: string;           // EX | V | VMAX | VSTAR | ... when present
  variants?: Partial<Record<"firstEdition" | "holo" | "normal" | "reverse" | "wPromo", boolean>>;
}

const CATEGORY_TO_SUPERTYPE: Record<TcgdexCard["category"], string> = {
  Pokemon: "Pokémon",
  Trainer: "Trainer",
  Energy: "Energy",
};

function subtypesOf(card: TcgdexCard): string[] | undefined {
  const out: string[] = [];
  if (card.stage) out.push(card.stage);
  if (card.trainerType) out.push(card.trainerType);
  if (card.energyType) out.push(card.energyType);
  if (card.suffix) out.push(card.suffix);
  return out.length ? out : undefined;
}

function variantsOf(card: TcgdexCard): string[] | undefined {
  if (!card.variants) return undefined;
  const keys = (["normal", "holo", "reverse", "firstEdition", "wPromo"] as const)
    .filter((k) => card.variants?.[k]);
  return keys.length ? keys : undefined;
}

export function trimCard(card: TcgdexCard): CorpusCard {
  const out: CorpusCard = {
    id: card.id,
    name: card.name,
    supertype: CATEGORY_TO_SUPERTYPE[card.category],
    setId: card.set.id,
    number: card.localId,
    imageBase: null,
    imageUrl: "",
    imageUrlSmall: "",
  };
  if (card.image) {
    out.imageBase = card.image.startsWith(ASSET_PREFIX)
      ? card.image.slice(ASSET_PREFIX.length) // "swsh/swsh3/136"
      : card.image;
    out.imageUrl = `${card.image}/high.webp`;
    out.imageUrlSmall = `${card.image}/low.webp`;
  } else {
    // No TCGdex image: bake a pokemontcg.io fallback from the translated id.
    const ptcgId = tcgdexCardToPtcg(card.id);
    const dash = ptcgId.indexOf("-");
    const { large, small } = ptcgImageUrl(ptcgId.slice(0, dash), ptcgId.slice(dash + 1));
    out.imageUrl = large;
    out.imageUrlSmall = small;
  }
  if (card.rarity) out.rarity = card.rarity;
  const subtypes = subtypesOf(card);
  if (subtypes) out.subtypes = subtypes;
  if (card.types) out.types = card.types;
  if (card.dexId) out.nationalPokedexNumbers = card.dexId;
  const variants = variantsOf(card);
  if (variants) out.variants = variants;
  return out;
}
```

(Leave `detailCard`/`detailVersion` for Task 3; they still reference the old `ApiCard` — Task 3 retypes them to `TcgdexCard`.)

- [ ] **Step 5: Run to verify pass**

Run: `bun test scripts/build-corpus.test.ts -t trimCard`
Expected: PASS (2 tests). Other tests in the file may still fail until Task 3 — that's expected; run the focused filter.

- [ ] **Step 6: Lint**

Run: `bunx biome check --write scripts/build-corpus.ts src/store/corpus/corpus-types.ts scripts/build-corpus.test.ts`

- [ ] **Step 7: Commit**

```bash
git add src/store/corpus/corpus-types.ts scripts/build-corpus.ts scripts/build-corpus.test.ts
git commit -m "feat(corpus): TCGdex trimCard + imageBase with pokemontcg.io image fallback"
```

---

## Task 3: build-corpus crawl from TCGdex + gap log + crosswalk validation

Rewrite the crawl/orchestration to read the self-hosted TCGdex mirror, retype detail extraction, emit the catalog-gap log, and validate the set crosswalk.

**Files:**
- Modify: `scripts/build-corpus.ts` (crawl loop, `detailCard`, entrypoint, artifacts)
- Test: `scripts/build-corpus.test.ts`

**Interfaces:**
- Consumes: `trimCard` (Task 2), `ptcgSetToTcgdex` (Task 1).
- Produces: artifacts `corpus.json.gz`, `corpus-detail.json.gz`, `corpus-detail.meta.json` (unchanged names), plus `corpus-gap.json` `{ images: Array<{ id: string; reason: "tcgdex-missing" | "no-fallback" }> }`.

- [ ] **Step 1: Write failing tests for `detailCard` (TCGdex shape) and gap collection**

Add to `scripts/build-corpus.test.ts`:

```ts
import { detailCard, collectGaps } from "./build-corpus";

test("detailCard keeps battle/flavor, drops image/prices", () => {
  const d = detailCard({
    id: "swsh3-136", localId: "136", name: "Furret", category: "Pokemon",
    set: { id: "swsh3" }, hp: "110",
    abilities: [{ name: "Feelin' Fine", effect: "…", type: "Ability" }],
    attacks: [{ name: "Find a Friend", cost: ["Colorless"], damage: "", effect: "…" }],
    illustrator: "Mitsuhiro Arita",
  } as never);
  expect(d.id).toBe("swsh3-136");
  expect(d.hp).toBe("110");
  expect(d.artist).toBe("Mitsuhiro Arita");
  expect(d.attacks?.[0].name).toBe("Find a Friend");
});

test("collectGaps records cards whose TCGdex image is absent", () => {
  const gaps = collectGaps([
    { id: "swsh3-136", localId: "136", name: "F", category: "Pokemon",
      set: { id: "swsh3" }, image: "https://assets.tcgdex.net/en/swsh/swsh3/136" },
    { id: "sm3.5-1", localId: "1", name: "A", category: "Pokemon", set: { id: "sm3.5" } },
  ]);
  expect(gaps.images).toEqual([{ id: "sm3.5-1", reason: "tcgdex-missing" }]);
});
```

- [ ] **Step 2: Run to verify fail**

Run: `bun test scripts/build-corpus.test.ts -t "detailCard|collectGaps"`
Expected: FAIL — `detailCard` type mismatch / `collectGaps` not exported.

- [ ] **Step 3: Retype `detailCard`, add `collectGaps`, rewrite the crawl**

In `scripts/build-corpus.ts`:

(a) Map TCGdex attacks/abilities into the existing `DetailCard` shape (TCGdex uses `effect` for `text`, `illustrator` for `artist`, `evolveFrom` for `evolvesFrom`):

```ts
export type DetailRecord = { id: string } & DetailCard;

export function detailCard(card: TcgdexCard & {
  hp?: string; evolveFrom?: string;
  abilities?: { name: string; effect: string; type: string }[];
  attacks?: { name: string; cost?: string[]; damage?: string; effect?: string }[];
  effect?: string; weaknesses?: { type: string; value: string }[];
  resistances?: { type: string; value: string }[]; retreat?: number;
  description?: string; illustrator?: string;
}): DetailRecord {
  const out: DetailRecord = { id: card.id };
  if (card.hp) out.hp = card.hp;
  if (card.evolveFrom) out.evolvesFrom = card.evolveFrom;
  if (card.abilities)
    out.abilities = card.abilities.map((a) => ({ name: a.name, text: a.effect, type: a.type }));
  if (card.attacks)
    out.attacks = card.attacks.map((a) => ({ name: a.name, cost: a.cost, damage: a.damage, text: a.effect }));
  if (card.weaknesses) out.weaknesses = card.weaknesses;
  if (card.resistances) out.resistances = card.resistances;
  if (typeof card.retreat === "number") out.retreatCost = Array(card.retreat).fill("Colorless");
  if (card.description) out.flavorText = card.description;
  if (card.illustrator) out.artist = card.illustrator;
  return JSON.parse(JSON.stringify(out));
}
```

(b) Add gap collection:

```ts
export interface GapLog { images: Array<{ id: string; reason: "tcgdex-missing" | "no-fallback" }> }

export function collectGaps(cards: TcgdexCard[]): GapLog {
  const images: GapLog["images"] = [];
  for (const c of cards) if (!c.image) images.push({ id: c.id, reason: "tcgdex-missing" });
  return { images };
}
```

(c) Replace the crawl. Read from the TCGdex mirror base (env `TCGDEX_BASE`, default `https://api.tcgdex.net/v2/en`): fetch `/sets`, then each `/sets/{id}` (full cards), flatten. Keep the existing retry/backoff helper, repointed; keep the ≥95% guard against the summed `cardCount.total`. Validate the crosswalk: for every set id seen, assert `ptcgSetToTcgdex` round-trips or the set is identity; `console.warn` unseen divergent sets.

```ts
const TCGDEX_BASE = process.env.TCGDEX_BASE ?? "https://api.tcgdex.net/v2/en";

export async function buildCorpus(): Promise<TcgdexCard[]> {
  const sets = (await fetchJson(`${TCGDEX_BASE}/sets`)) as { id: string; cardCount: { total: number } }[];
  const expected = sets.reduce((n, s) => n + s.cardCount.total, 0);
  const cards: TcgdexCard[] = [];
  for (const s of sets) {
    const full = (await fetchJson(`${TCGDEX_BASE}/sets/${s.id}`)) as { cards: TcgdexCard[] };
    for (const c of full.cards) cards.push({ ...c, set: { id: s.id } });
    await new Promise((r) => setTimeout(r, 100));
  }
  if (cards.length < expected * 0.95)
    throw new Error(`crawl incomplete: ${cards.length} of ~${expected}`);
  return cards;
}
```

(`fetchJson` = a small retry wrapper adapted from the existing `fetchPage` backoff; only 401/403 are non-retryable.)

(d) Entrypoint: drop `POKEMONTCG_API_KEY`; write the three existing artifacts plus `corpus-gap.json`:

```ts
const gaps = collectGaps(raw);
await Bun.write("corpus-gap.json", JSON.stringify(gaps));
console.log(`Gap log: ${gaps.images.length} cards without a TCGdex image`);
```

- [ ] **Step 4: Run to verify pass**

Run: `bun test scripts/build-corpus.test.ts`
Expected: PASS (all build-corpus tests, including Task 2's).

- [ ] **Step 5: Update CI corpus workflow (no test, config)**

In `.github/workflows/build-corpus.yml`, add a `tcgdex/server` service container and set `TCGDEX_BASE=http://localhost:3000/v2/en`; drop the `POKEMONTCG_API_KEY` env from the crawl step (the R2 upload step is unchanged). Add `corpus-gap.json` to the artifacts uploaded for inspection (not served).

- [ ] **Step 6: Smoke-build locally against the public API**

Run: `TCGDEX_BASE=https://api.tcgdex.net/v2/en bun run scripts/build-corpus.ts /tmp/corpus.json.gz`
Expected: writes the three blobs + `corpus-gap.json`; logged card count ≈ 23k; gap count in the low thousands. Confirm `corpus.json.gz` ≤ ~0.6 MiB.

- [ ] **Step 7: Lint + commit**

```bash
bunx biome check --write scripts/build-corpus.ts scripts/build-corpus.test.ts
git add scripts/build-corpus.ts scripts/build-corpus.test.ts .github/workflows/build-corpus.yml
git commit -m "feat(corpus): crawl TCGdex mirror, emit catalog-gap log"
```

---

## Task 4: Worker passthrough → TCGdex

**Files:**
- Modify: `worker/src/index.ts:8,39-43`

**Interfaces:**
- Produces: `/v2/*` requests proxied to `api.tcgdex.net`. `/corpus*` routes + R2 keys unchanged.

- [ ] **Step 1: Repoint `ORIGIN`**

In `worker/src/index.ts` line 8:

```ts
const ORIGIN = "https://api.tcgdex.net";
```

- [ ] **Step 2: Drop the pokemontcg.io API key header**

`fetchOrigin` (lines 39-43) no longer needs `X-Api-Key` (TCGdex needs no key):

```ts
function fetchOrigin(url: URL, env: Env): Promise<Response> {
  return fetch(ORIGIN + url.pathname + url.search);
}
```

Remove `POKEMONTCG_API_KEY` from `Env` if unused elsewhere in the worker (it is only used by `fetchOrigin`).

- [ ] **Step 3: Verify worker still typechecks**

Run: `bunx tsc -b`
Expected: clean (or fix any now-unused `Env` field).

- [ ] **Step 4: Commit**

```bash
git add worker/src/index.ts
git commit -m "feat(worker): proxy /v2 to TCGdex, drop pokemontcg.io key"
```

---

## Task 5: Live sets fetch + setsById to TCGdex shape

The live SSR path builds `setsById`, which `hydrateCard` joins on. Corpus cards now carry TCGdex set ids, so the set map MUST use TCGdex set ids.

**Files:**
- Modify: `src/server/card-data-fetch.ts` (`fetchAllSets`)
- Modify: `src/lib/api-base-client.ts` (`apiBase` default)
- Test: `src/server/card-data-fetch.test.ts` (create if absent)

**Interfaces:**
- Produces: `fetchAllSets(): Promise<PokemonSet[]>` where `PokemonSet.id` is a TCGdex set id; `series` derived from `set.serie.name`.

- [ ] **Step 1: Write the failing test (injected fetch)**

Create/extend `src/server/card-data-fetch.test.ts`:

```ts
import { expect, test } from "bun:test";
import { mapTcgdexSet, type TcgdexSetDetail } from "./card-data-fetch";

test("mapTcgdexSet maps to PokemonSet with TCGdex id + serie name", () => {
  const s: TcgdexSetDetail = {
    id: "swsh3", name: "Darkness Ablaze", releaseDate: "2020-08-14",
    cardCount: { total: 201, official: 189 }, serie: { id: "swsh", name: "Sword & Shield" },
  };
  expect(mapTcgdexSet(s)).toEqual({
    id: "swsh3", name: "Darkness Ablaze", series: "Sword & Shield",
    releaseDate: "2020-08-14", printedTotal: 189, total: 201,
  });
});
```

(Use a pure `mapTcgdexSet` so the test never hits the network — `fetchAllSets` is the thin wrapper that calls it over the fetched list.)

- [ ] **Step 2: Run to verify fail**

Run: `bun test src/server/card-data-fetch.test.ts`
Expected: FAIL — `mapTcgdexSet` not exported.

- [ ] **Step 3: Implement the mapping + repoint the fetch**

In `src/server/card-data-fetch.ts`:

```ts
export interface TcgdexSetDetail {
  id: string; name: string; releaseDate?: string;
  cardCount: { total: number; official: number };
  serie: { id: string; name: string };
}

export function mapTcgdexSet(s: TcgdexSetDetail): PokemonSet {
  return {
    id: s.id, name: s.name, series: s.serie.name,
    releaseDate: s.releaseDate ?? "", printedTotal: s.cardCount.official, total: s.cardCount.total,
  };
}
```

Rewrite `fetchAllSets` to `GET ${apiBase()}/v2/en/sets`, then for each set `GET /v2/en/sets/{id}` (detail carries `releaseDate`+`serie`) and `mapTcgdexSet`. (Batch with a small concurrency limit; the list is ~209 sets — acceptable at SSR cache build, and the worker edge-caches `/v2/*`.) Match the existing `PokemonSet` field names the rest of the app expects.

- [ ] **Step 4: Repoint the client api base**

In `src/lib/api-base-client.ts`, change the default origin from pokemontcg.io to the worker/TCGdex base used by the app (keep the existing env override).

- [ ] **Step 5: Run to verify pass + typecheck**

Run: `bun test src/server/card-data-fetch.test.ts && bunx tsc -b`
Expected: PASS + clean.

- [ ] **Step 6: Lint + commit**

```bash
bunx biome check --write src/server/card-data-fetch.ts src/lib/api-base-client.ts src/server/card-data-fetch.test.ts
git add src/server/card-data-fetch.ts src/lib/api-base-client.ts src/server/card-data-fetch.test.ts
git commit -m "feat(server): fetch sets from TCGdex, key setsById by TCGdex id"
```

---

## Task 6: Live card fetch + mappers to TCGdex; pricing dark

**Files:**
- Create: `src/lib/pricing-flag.ts`
- Modify: `src/server/card-data-fetch.ts` (`fetchCardById`)
- Modify: `src/server/card-mappers.ts` (`FocusCardData` mapping)
- Modify: `src/components/islands/card-prices.tsx`, `src/components/card/card-pricing-tab.tsx`
- Test: `src/server/card-mappers.test.ts` (create if absent)

**Interfaces:**
- Consumes: TCGdex card detail shape.
- Produces: `mapTcgdexFocusCard(card): FocusCardData` with NO `tcgplayer`/`cardmarket`; `PRICING_ENABLED: boolean`.

- [ ] **Step 1: Pricing flag**

Create `src/lib/pricing-flag.ts`:

```ts
/** Pricing is off until the PriceCharting connector lands (spec D3). Seam, not deletion. */
export const PRICING_ENABLED = false;
```

- [ ] **Step 2: Write failing mapper test**

Create `src/server/card-mappers.test.ts`:

```ts
import { expect, test } from "bun:test";
import { mapTcgdexFocusCard } from "./card-mappers";

test("mapTcgdexFocusCard maps core fields and drops pricing", () => {
  const f = mapTcgdexFocusCard({
    id: "swsh3-136", localId: "136", name: "Furret", category: "Pokemon",
    image: "https://assets.tcgdex.net/en/swsh/swsh3/136", set: { id: "swsh3", name: "Darkness Ablaze" },
    illustrator: "Mitsuhiro Arita", rarity: "Uncommon",
    pricing: { cardmarket: { avg: 0.5 }, tcgplayer: { market: 0.4 } },
  } as never);
  expect(f.id).toBe("swsh3-136");
  expect(f.name).toBe("Furret");
  expect(f.artist).toBe("Mitsuhiro Arita");
  expect(f.imageUrl).toBe("https://assets.tcgdex.net/en/swsh/swsh3/136/high.webp");
  expect("tcgplayer" in f).toBe(false);
  expect("cardmarket" in f).toBe(false);
});
```

- [ ] **Step 3: Run to verify fail**

Run: `bun test src/server/card-mappers.test.ts`
Expected: FAIL — `mapTcgdexFocusCard` not exported.

- [ ] **Step 4: Implement the focus mapper + repoint fetch**

In `src/server/card-mappers.ts`, add `mapTcgdexFocusCard` building `FocusCardData` from the TCGdex shape (reuse `detailCard`-style field renames: `effect`→text, `illustrator`→artist, `evolveFrom`→evolvesFrom, `description`→flavorText). Remove `tcgplayer`/`cardmarket` from `FocusCardData` (and any now-dead price plumbing). In `card-data-fetch.ts`, `fetchCardById` now `GET ${apiBase()}/v2/en/cards/{id}` and returns the card object directly (no `{data}` unwrap) → `mapTcgdexFocusCard`.

- [ ] **Step 5: Gate the price UI**

In `src/components/islands/card-prices.tsx` and `src/components/card/card-pricing-tab.tsx`, at the top of the component:

```tsx
import { PRICING_ENABLED } from "@/lib/pricing-flag";
// …
if (!PRICING_ENABLED) return null;
```

(Tab variant: also omit the tab trigger when `!PRICING_ENABLED` so no empty tab shows.)

- [ ] **Step 6: Run tests + typecheck**

Run: `bun test src/server/card-mappers.test.ts && bunx tsc -b`
Expected: PASS + clean (fix any references to the removed price fields).

- [ ] **Step 7: Lint + commit**

```bash
bunx biome check --write src/server/card-mappers.ts src/server/card-data-fetch.ts src/lib/pricing-flag.ts src/components/islands/card-prices.tsx src/components/card/card-pricing-tab.tsx src/server/card-mappers.test.ts
git add -A -- src/server/card-mappers.ts src/server/card-data-fetch.ts src/lib/pricing-flag.ts src/components/islands/card-prices.tsx src/components/card/card-pricing-tab.tsx src/server/card-mappers.test.ts
git commit -m "feat(card): TCGdex focus mapper, pricing dark behind flag"
```

---

## Task 7: Snapshot migration (schemaVersion 5 → 6)

Remap all corpus-id references when importing a pre-v6 backup. The exact ptcg→tcgdex card id is resolved against the loaded corpus (set table + numeric localId match), so it is correct regardless of TCGdex pad width.

**Files:**
- Modify: `src/store/userland/types.ts:140` (`schemaVersion: 5 | 6`)
- Modify: `src/store/userland/backup.ts` (`SUPPORTED_VERSIONS`, `upgrade`)
- Modify: `src/store/userland/supabase-repo.ts` (literal `schemaVersion: 6`)
- Create: `src/store/userland/id-remap.ts` (corpus-backed resolver)
- Test: `src/store/userland/backup.test.ts`, `src/store/userland/id-remap.test.ts`

**Interfaces:**
- Consumes: `ptcgSetToTcgdex` (Task 1); a corpus index `Map<string, CorpusCard>` or a `(setId, num) => tcgdexId | null` lookup.
- Produces: `remapPtcgCardId(ptcgId, lookup)`, `remapPtcgSetId(ptcgId)`; `upgrade()` returns `schemaVersion: 6`.

- [ ] **Step 1: Write failing resolver test**

Create `src/store/userland/id-remap.test.ts`:

```ts
import { expect, test } from "bun:test";
import { remapPtcgCardId, remapPtcgSetId } from "./id-remap";

// lookup mimics the corpus: tcgdex "{setId}:{numericLocalId}" -> tcgdex card id
const lookup = (setId: string, num: number) =>
  ({ "sv01:1": "sv01-001", "swsh3:136": "swsh3-136" } as Record<string, string>)[`${setId}:${num}`] ?? null;

test("remapPtcgCardId: set table + numeric match into corpus", () => {
  expect(remapPtcgCardId("sv1-1", lookup)).toBe("sv01-001");
  expect(remapPtcgCardId("swsh3-136", lookup)).toBe("swsh3-136");
});

test("remapPtcgCardId: unmappable returns the original id", () => {
  expect(remapPtcgCardId("zzz-999", lookup)).toBe("zzz-999");
});

test("remapPtcgSetId translates set ids", () => {
  expect(remapPtcgSetId("sv1")).toBe("sv01");
  expect(remapPtcgSetId("swsh3")).toBe("swsh3");
});
```

- [ ] **Step 2: Run to verify fail**

Run: `bun test src/store/userland/id-remap.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement the resolver**

Create `src/store/userland/id-remap.ts`:

```ts
import { ptcgSetToTcgdex } from "../../../scripts/id-crosswalk";

export type CardLookup = (tcgdexSetId: string, numericLocalId: number) => string | null;

export function remapPtcgSetId(ptcgSetId: string): string {
  return ptcgSetToTcgdex(ptcgSetId);
}

/** ptcg card id -> tcgdex card id, resolved against the corpus by numeric localId. */
export function remapPtcgCardId(ptcgId: string, lookup: CardLookup): string {
  const dash = ptcgId.indexOf("-");
  if (dash < 0) return ptcgId;
  const tcgdexSet = ptcgSetToTcgdex(ptcgId.slice(0, dash));
  const localId = ptcgId.slice(dash + 1);
  if (!/^\d+$/.test(localId)) {
    // promo/gallery localId: TCGdex keeps the same string under the folded set
    const direct = lookup(tcgdexSet, NaN);
    return direct ?? `${tcgdexSet}-${localId}`;
  }
  return lookup(tcgdexSet, Number(localId)) ?? ptcgId;
}
```

(Import path: `id-crosswalk` lives under `scripts/`; if the bundler rejects a cross-root import, move `id-crosswalk.ts` + `set-crosswalk.json` to `src/lib/corpus/` in this step and update Task 1's references — note this in the commit.)

- [ ] **Step 4: Run resolver test to pass**

Run: `bun test src/store/userland/id-remap.test.ts`
Expected: PASS.

- [ ] **Step 5: Write failing backup-upgrade test**

In `src/store/userland/backup.test.ts`, add:

```ts
test("v5 -> v6 remaps all corpus-id references", () => {
  const lookup = (s: string, n: number) => (s === "sv01" && n === 1 ? "sv01-001" : null);
  const v5 = {
    schemaVersion: 5, exportedAt: 0,
    collection: [{ /* …minimal Stack… */ cardId: "sv1-1" } as never],
    binders: [{ /* …minimal Binder… */ includeCardIds: ["sv1-1"], excludeCardIds: [],
      rules: [{ id: "r", query: { setId: "sv1" } }] } as never],
    profile: { /* … */ favoriteSetId: "sv1" } as never,
  };
  const v6 = upgrade(v5, lookup);
  expect(v6.schemaVersion).toBe(6);
  expect(v6.collection[0].cardId).toBe("sv01-001");
  expect(v6.binders[0].includeCardIds).toEqual(["sv01-001"]);
  expect(v6.binders[0].rules[0].query.setId).toBe("sv01");
  expect(v6.profile?.favoriteSetId).toBe("sv01");
});

test("version support: v6 valid, v7 rejected", () => {
  expect(SUPPORTED_VERSIONS.has(6)).toBe(true);
  expect(SUPPORTED_VERSIONS.has(7)).toBe(false);
});
```

- [ ] **Step 6: Run to verify fail**

Run: `bun test src/store/userland/backup.test.ts -t "v5 -> v6|version support"`
Expected: FAIL.

- [ ] **Step 7: Implement the v5→v6 upgrade**

In `src/store/userland/types.ts`, change `schemaVersion: 5;` to `schemaVersion: 5 | 6;` on `UserDataSnapshot`. In `backup.ts`: add `6` to `SUPPORTED_VERSIONS`; thread an optional `CardLookup` into `upgrade()` (callers in `loadUserland`/import build it from the corpus index). Add the v5→v6 branch:

```ts
if (snap.schemaVersion === 5) {
  for (const s of snap.collection) s.cardId = remapPtcgCardId(s.cardId, lookup);
  for (const b of snap.binders) {
    b.includeCardIds = b.includeCardIds.map((id) => remapPtcgCardId(id, lookup));
    b.excludeCardIds = b.excludeCardIds.map((id) => remapPtcgCardId(id, lookup));
    for (const r of b.rules) if (r.query.setId) r.query.setId = remapPtcgSetId(r.query.setId);
  }
  if (snap.profile?.favoriteSetId) snap.profile.favoriteSetId = remapPtcgSetId(snap.profile.favoriteSetId);
  snap.schemaVersion = 6;
}
```

In `supabase-repo.ts`, bump the hardcoded `schemaVersion: 5` literal to `6` (cloud row data migration is out of scope per spec — no synced users).

- [ ] **Step 8: Run to verify pass**

Run: `bun test src/store/userland/backup.test.ts`
Expected: PASS.

- [ ] **Step 9: Lint + commit**

```bash
bunx biome check --write src/store/userland/id-remap.ts src/store/userland/backup.ts src/store/userland/types.ts src/store/userland/supabase-repo.ts src/store/userland/id-remap.test.ts src/store/userland/backup.test.ts
git add -A -- src/store/userland/id-remap.ts src/store/userland/backup.ts src/store/userland/types.ts src/store/userland/supabase-repo.ts src/store/userland/id-remap.test.ts src/store/userland/backup.test.ts
git commit -m "feat(userland): snapshot v5->v6 corpus-id migration"
```

---

## Task 8: Live IDB migration (CURRENT_DATA_VERSION 4 → 5) + seed-data langs

**Files:**
- Modify: `src/store/userland/idb-repo.ts` (`CURRENT_DATA_VERSION`, `migrateUserlandData`)
- Modify: `src/components/dev/seed-data.ts` (restrict `language`)
- Test: `src/store/userland/idb-repo.test.ts` (or the existing migration test file)

**Interfaces:**
- Consumes: `remapPtcgCardId`, `remapPtcgSetId` (Task 7); the loaded corpus index for the lookup.
- Produces: a one-time v4→v5 marker-gated migration of live IDB rows.

- [ ] **Step 1: Write failing migration test**

In the migration test file, seed fake-indexeddb with v4 rows holding pokemontcg.io ids + corpus index, run `migrateUserlandData`, assert ids are remapped and the marker advances to 5, and that a second run is a no-op:

```ts
test("migrateUserlandData v4->v5 remaps live corpus ids once", async () => {
  // seed: meta version 4, one stack cardId "sv1-1", corpus has sv01-001
  await seedV4({ stacks: [{ cardId: "sv1-1" }], corpus: ["sv01-001", "swsh3-136"] });
  await migrateUserlandData();
  expect(await readStackCardId()).toBe("sv01-001");
  expect(await readMarker()).toBe(5);
  await migrateUserlandData(); // idempotent
  expect(await readStackCardId()).toBe("sv01-001");
});
```

- [ ] **Step 2: Run to verify fail**

Run: `bun test src/store/userland/idb-repo.test.ts -t "v4->v5"`
Expected: FAIL.

- [ ] **Step 3: Implement the migration**

In `idb-repo.ts`: bump `CURRENT_DATA_VERSION` 4 → 5. In `migrateUserlandData`, add a v4→v5 block that builds the corpus lookup (`(setId, num) => index card whose setId matches and `Number(localId) === num``) and remaps `Stack.cardId`, `Binder.includeCardIds`/`excludeCardIds`, `BinderRule.query.setId`, `Profile.favoriteSetId` — mirroring Task 7's field list. Marker-gated (only runs when stored marker < 5); never inside `normalizeStack`.

- [ ] **Step 4: Restrict seed-data languages**

In `src/components/dev/seed-data.ts`, change the `LANGUAGES` weighted list to the supported set only (`en, fr, de, es, it, pt`) — drop `ja`/`zh` until Phase 2.

- [ ] **Step 5: Run to verify pass**

Run: `bun test src/store/userland/idb-repo.test.ts`
Expected: PASS.

- [ ] **Step 6: Full userland + corpus suite (phase boundary)**

Run: `bun test src/store/userland src/store/corpus scripts`
Expected: all green. Fix any test that pinned a pokemontcg.io id/source.

- [ ] **Step 7: Lint + commit**

```bash
bunx biome check --write src/store/userland/idb-repo.ts src/components/dev/seed-data.ts
git add -A -- src/store/userland/idb-repo.ts src/components/dev/seed-data.ts src/store/userland/idb-repo.test.ts
git commit -m "feat(userland): live IDB v4->v5 corpus-id migration; seed langs gated"
```

---

## Task 9: Integration verification (no code, gate)

**Files:** none (verification only).

- [ ] **Step 1: Typecheck + full suite**

Run: `bunx tsc -b && bun test`
Expected: clean + green.

- [ ] **Step 2: Boot the app, verify English render from TCGdex**

Run the dev server (`bun run dev`, port 6201) and through the Claude Preview tools: load `/search`, open a card, confirm images render (TCGdex webp), set names/series populate (`setsById` join), and a vintage gap-set card (e.g. Shining Legends) shows the pokemontcg.io fallback image rather than a blank.

- [ ] **Step 3: Verify pricing is dark + migration ran**

Confirm no price UI renders. Seed dev data, confirm collection cards resolve (ids are TCGdex-shaped post-migration), and a binder with a rule still matches.

- [ ] **Step 4: Final commit (if any verification fixes)**

```bash
git add -A
git commit -m "fix(corpus): phase-1a verification fixes"
```

---

## Self-Review (completed by author)

- **Spec coverage:** Phase 1a items all mapped — source swap (T3), `imageBase`+trimCard+fallback (T2), crosswalk (T1), worker repoint (T4), live sets/`setsById` (T5), live card + pricing dark (T6), snapshot v6 (T7), live IDB v4→v5 + seed langs (T8), verification (T9). Phase 1b (overlays, displayLanguage, hydrateCard i18n param, cardImage, i18n store, selector gate, holo-card onError) is intentionally a **separate follow-on plan** authored after 1a lands.
- **Placeholder scan:** no TBD/TODO; every code step carries real code. The two spec open-questions are resolved in Global Constraints (hotlink-now; Docker-mirror build).
- **Type consistency:** `trimCard`/`TcgdexCard` (T2) reused by T3; `CardLookup`/`remapPtcgCardId` (T7) reused by T8; `mapTcgdexSet`→`PokemonSet` (T5) feeds `hydrateCard`'s set join; `PRICING_ENABLED` single source (T6).
- **Known approximation flagged:** TCGdex→ptcg subtype/rarity vocab differs from pokemontcg.io (T2 `subtypesOf`); filters keep working but vocabulary shifts. Acceptable for 1a; revisit if a filter regresses.
