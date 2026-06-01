# TanStack Start Migration — Plan 02: Server Data Seam

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pure, server-side primitives the new routes will depend on — slug↔id resolution, server-side card-data fetchers (key-safe), DTO mappers, and the Cache-Control SWR header helper — all unit-tested, with **no route wiring** (that is Plan 03).

**Architecture:** Add a `src/lib/slug.ts` (pure) and a `src/server/` module group. Logic that can be unit-tested (slugify, slug index, DTO mappers, header strings) lives in pure functions; the thin `createServerFn` network boundary wraps them. Existing tested utils (`escape-lucene`, `build-filter-clauses`) are reused for query construction. Nothing here imports route files; nothing renders.

**Tech Stack:** TanStack Start `createServerFn`, Bun test, TypeScript. Reuses `src/utils/escape-lucene.ts`, `src/utils/build-filter-clauses.ts`, `src/store/corpus/corpus-types.ts`.

---

## Assumptions (delegate-mode decisions — review these)

These were decided on your behalf in delegate mode. Each is reversible later.

1. **Data source for v1 = the existing CF Worker.** `server/card-data.ts` reads `process.env.API_BASE` (the Worker URL; the Worker injects the pokemontcg.io key). So **no API key lives in the Start app yet** — the Worker still owns it. "Absorb the Worker" (key in `/etc/tcg/env`, call origin directly) becomes a one-line change inside these server fns later. Matches `goals.md` (keep Worker v1).
2. **Fetches are `createServerFn`, not plain isomorphic loaders.** Even though v1 has no client-side secret, wrapping in `createServerFn` means: SSR + client-nav both fetch server-side (consistent), our own `Cache-Control` headers are settable on the responses, and the future key-absorb is contained. The network call is server-only; the testable logic (mappers, query builders) is extracted to pure functions.
3. **Slugs are derived at runtime from corpus + sets, NOT emitted by build-corpus.** `lib/slug.ts` is pure and takes `(sets, cards)` as input. DRY: the corpus already holds every card; the sets list holds series/set names. No new build artifact, no `scripts/build-corpus.ts` change. (Where the server *gets* those arrays to build the index is Plan 03's concern.)
4. **Collision policy:** slugs are made unique by appending the entity's stable id suffix on collision (deterministic, order-independent). Rename policy (old-slug redirects) is deferred to Plan 03 routing, where redirects live.
5. **Card detail still needs the API.** The corpus is the compact browse shape (no attacks/prices/hp). `getCardById` (focus view) fetches the full card from the API base. Browse *lists* could later come from the corpus server-side, but Plan 02 sources all fetchers from the API base for a clean, uniform port. The "corpus-as-server-list-source" optimization stays an open item for Plan 03.

---

## File structure

- `src/lib/slug.ts` — pure: `slugify`, `buildSlugIndex(sets, cards)`, `resolveSeries/Set/Card`, `seriesPath/setPath/cardPath`. Sibling test.
- `src/server/card-mappers.ts` — pure DTO mappers moved verbatim from `api.ts` (`apiCardToProps`, `apiCardToFocusProps`) + their input/output types. Sibling test.
- `src/server/card-data.ts` — `createServerFn` fetchers (`getSetsFn`, `getCardsBySetFn`, `getCardsByNameFn`, `getCardByIdFn`, filter-list fns) calling `process.env.API_BASE`, using the mappers + reused query utils. No test (network boundary; logic is tested via the pure modules).
- `src/server/cache-headers.ts` — pure `cacheControl(kind)` returning the `goals.md` header matrix. Sibling test.

---

### Task 1: `slugify` — pure string normalizer

**Files:**
- Create: `src/lib/slug.ts`
- Test: `src/lib/slug.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, test } from "bun:test";
import { slugify } from "./slug";

describe("slugify", () => {
	test("lowercases and hyphenates spaces", () => {
		expect(slugify("Sword & Shield")).toBe("sword-shield");
	});
	test("strips diacritics and punctuation", () => {
		expect(slugify("Pokémon GO!")).toBe("pokemon-go");
	});
	test("collapses repeated separators and trims", () => {
		expect(slugify("  Team   Rocket's  Return  ")).toBe("team-rockets-return");
	});
	test("keeps internal digits", () => {
		expect(slugify("Charizard VSTAR 018")).toBe("charizard-vstar-018");
	});
	test("returns empty string for all-punctuation input", () => {
		expect(slugify("—&—")).toBe("");
	});
});
```

- [ ] **Step 2: Run, verify FAIL**

Run: `bun test src/lib/slug.test.ts`
Expected: FAIL — `slugify` not exported.

- [ ] **Step 3: Implement `slugify`**

```ts
/** Normalize a display string to a URL-safe slug: lowercase, ASCII, hyphenated. */
export function slugify(input: string): string {
	return input
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "") // strip diacritics
		.toLowerCase()
		.replace(/['']/g, "") // drop apostrophes so "rocket's" -> "rockets"
		.replace(/[^a-z0-9]+/g, "-") // any run of non-alphanumerics -> single hyphen
		.replace(/^-+|-+$/g, ""); // trim leading/trailing hyphens
}
```

- [ ] **Step 4: Run, verify PASS**

Run: `bun test src/lib/slug.test.ts`
Expected: 5 pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/slug.ts src/lib/slug.test.ts
git commit -m "feat(slug): pure slugify normalizer"
```

---

### Task 2: Slug index — collision-safe bidirectional resolution

**Files:**
- Modify: `src/lib/slug.ts`
- Modify: `src/lib/slug.test.ts`

**Types this task introduces** (define at top of `slug.ts`):
```ts
import type { CorpusCard } from "../store/corpus/corpus-types";

/** Minimal set shape needed for slugging (subset of api.ts PokemonSet). */
export interface SluggableSet {
	id: string;
	name: string;
	series: string;
}

export interface SlugIndex {
	/** series slug -> canonical series name */
	seriesBySlug: Map<string, string>;
	/** set slug (within series) -> set id */
	setIdBySlug: Map<string, string>;
	/** card slug (within set) -> card id */
	cardIdBySlug: Map<string, string>;
	/** reverse: set id -> { seriesSlug, setSlug } */
	setSlugById: Map<string, { seriesSlug: string; setSlug: string }>;
	/** reverse: card id -> card slug */
	cardSlugById: Map<string, string>;
}
```

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, test } from "bun:test";
import {
	buildSlugIndex,
	cardPath,
	resolveCard,
	resolveSet,
	type SluggableSet,
	slugify,
} from "./slug";
import type { CorpusCard } from "../store/corpus/corpus-types";

const sets: SluggableSet[] = [
	{ id: "swsh9", name: "Brilliant Stars", series: "Sword & Shield" },
	{ id: "base1", name: "Base", series: "Base" },
];
// CorpusCard requires id, name, imageUrl, imageUrlSmall, supertype, setId, number.
const card = (over: Partial<CorpusCard> & Pick<CorpusCard, "id" | "name" | "number" | "setId">): CorpusCard => ({
	imageUrl: "l.png", imageUrlSmall: "s.png", supertype: "Pokémon", ...over,
});
const cards: CorpusCard[] = [
	card({ id: "swsh9-154", name: "Charizard VSTAR", number: "154", setId: "swsh9" }),
	card({ id: "swsh9-018", name: "Charizard VSTAR", number: "018", setId: "swsh9" }),
	card({ id: "base1-4", name: "Charizard", number: "4", setId: "base1" }),
];

describe("buildSlugIndex", () => {
	const idx = buildSlugIndex(sets, cards);

	test("resolves series + set slug to set id", () => {
		expect(resolveSet(idx, "sword-shield", "brilliant-stars")).toBe("swsh9");
	});

	test("resolves a card slug to card id within its set", () => {
		expect(resolveSet(idx, "base", "base")).toBe("base1");
		expect(resolveCard(idx, "base", "base", "charizard-4")).toBe("base1-4");
	});

	test("disambiguates colliding card slugs by appending the number", () => {
		// Both Charizard VSTAR cards slugify to the same base; number keeps them unique.
		const a = resolveCard(idx, "sword-shield", "brilliant-stars", "charizard-vstar-154");
		const b = resolveCard(idx, "sword-shield", "brilliant-stars", "charizard-vstar-018");
		expect(a).toBe("swsh9-154");
		expect(b).toBe("swsh9-018");
	});

	test("round-trips: cardPath(resolve) is stable", () => {
		const path = cardPath(idx, "swsh9-154");
		expect(path).toBe("/sword-shield/brilliant-stars/charizard-vstar-154");
		expect(
			resolveCard(idx, "sword-shield", "brilliant-stars", "charizard-vstar-154"),
		).toBe("swsh9-154");
	});

	test("returns undefined for unknown slugs", () => {
		expect(resolveSet(idx, "nope", "nope")).toBeUndefined();
		expect(resolveCard(idx, "sword-shield", "brilliant-stars", "missingno")).toBeUndefined();
	});
});
```

- [ ] **Step 2: Run, verify FAIL**

Run: `bun test src/lib/slug.test.ts`
Expected: FAIL — `buildSlugIndex`/`resolveSet`/`resolveCard`/`cardPath` not exported.

- [ ] **Step 3: Implement the index + resolvers**

Append to `src/lib/slug.ts`:
```ts
/** Append the number to a card slug so two same-named cards stay distinct. */
function cardSlugFor(card: CorpusCard): string {
	const base = slugify(card.name);
	const num = slugify(card.number);
	return num ? `${base}-${num}` : base;
}

/**
 * Build a bidirectional slug index from the sets list and the card corpus.
 * Series slug = slugify(series). Set slug = slugify(set name), made unique
 * within its series by appending the set id on collision. Card slug =
 * name + number, made unique within its set by appending the card id on
 * collision. Deterministic: independent of input order (sorted by id).
 */
export function buildSlugIndex(
	sets: SluggableSet[],
	cards: CorpusCard[],
): SlugIndex {
	const idx: SlugIndex = {
		seriesBySlug: new Map(),
		setIdBySlug: new Map(),
		cardIdBySlug: new Map(),
		setSlugById: new Map(),
		cardSlugById: new Map(),
	};

	// Series + sets (sorted by id for deterministic collision suffixes).
	const setsSorted = [...sets].sort((a, b) => a.id.localeCompare(b.id));
	for (const set of setsSorted) {
		const seriesSlug = slugify(set.series);
		idx.seriesBySlug.set(seriesSlug, set.series);

		let setSlug = slugify(set.name);
		const key = (s: string) => `${seriesSlug}/${s}`;
		if (idx.setIdBySlug.has(key(setSlug))) setSlug = `${setSlug}-${set.id}`;
		idx.setIdBySlug.set(key(setSlug), set.id);
		idx.setSlugById.set(set.id, { seriesSlug, setSlug });
	}

	// Cards (sorted by id for deterministic collision suffixes).
	const cardsSorted = [...cards].sort((a, b) => a.id.localeCompare(b.id));
	for (const card of cardsSorted) {
		const loc = idx.setSlugById.get(card.setId);
		if (!loc) continue; // card whose set isn't in the sets list — skip
		let cardSlug = cardSlugFor(card);
		const key = (s: string) => `${loc.seriesSlug}/${loc.setSlug}/${s}`;
		if (idx.cardIdBySlug.has(key(cardSlug))) cardSlug = `${cardSlug}-${card.id}`;
		idx.cardIdBySlug.set(key(cardSlug), card.id);
		idx.cardSlugById.set(card.id, cardSlug);
	}

	return idx;
}

export function resolveSet(
	idx: SlugIndex,
	seriesSlug: string,
	setSlug: string,
): string | undefined {
	return idx.setIdBySlug.get(`${seriesSlug}/${setSlug}`);
}

export function resolveCard(
	idx: SlugIndex,
	seriesSlug: string,
	setSlug: string,
	cardSlug: string,
): string | undefined {
	return idx.cardIdBySlug.get(`${seriesSlug}/${setSlug}/${cardSlug}`);
}

export function resolveSeries(
	idx: SlugIndex,
	seriesSlug: string,
): string | undefined {
	return idx.seriesBySlug.get(seriesSlug);
}

export function setPath(idx: SlugIndex, setId: string): string | undefined {
	const loc = idx.setSlugById.get(setId);
	return loc ? `/${loc.seriesSlug}/${loc.setSlug}` : undefined;
}

export function cardPath(idx: SlugIndex, cardId: string): string | undefined {
	const cardSlug = idx.cardSlugById.get(cardId);
	if (!cardSlug) return undefined;
	// cardId is "<setId>-<number>"; derive the set from the reverse set map.
	const setId = cardId.slice(0, cardId.lastIndexOf("-"));
	const base = setPath(idx, setId);
	return base ? `${base}/${cardSlug}` : undefined;
}
```

- [ ] **Step 4: Run, verify PASS**

Run: `bun test src/lib/slug.test.ts`
Expected: all pass (5 from Task 1 + 5 here).

- [ ] **Step 5: Commit**

```bash
git add src/lib/slug.ts src/lib/slug.test.ts
git commit -m "feat(slug): collision-safe bidirectional slug index + resolvers"
```

---

### Task 3: Card DTO mappers + server fetchers

**Files:**
- Create: `src/server/card-mappers.ts`
- Test: `src/server/card-mappers.test.ts`
- Create: `src/server/card-data.ts`

- [ ] **Step 1: Move the DTO mappers into a pure module.** Copy `apiCardToProps` + `PokemonApiCard` and `apiCardToFocusProps` + `PokemonApiFocusCard` + `FocusCardData` + `PokemonSet` + `PokemonListEntry` **verbatim** from `src/api.ts` (lines ~28-61 and ~175-292) into `src/server/card-mappers.ts`. Export all of them. Import `HoloCardData` from `../components/holo-card`. Do not change the mapping logic.

- [ ] **Step 2: Write mapper tests**

```ts
import { describe, expect, test } from "bun:test";
import { apiCardToProps, apiCardToFocusProps } from "./card-mappers";

describe("apiCardToProps", () => {
	test("maps prices keys to variants", () => {
		const out = apiCardToProps({
			id: "swsh9-154", name: "Charizard VSTAR", supertype: "Pokémon",
			number: "154", set: { id: "swsh9", name: "Brilliant Stars", series: "Sword & Shield" },
			images: { small: "s.png", large: "l.png" },
			tcgplayer: { prices: { holofoil: {}, reverseHolofoil: {} } },
		});
		expect(out.variants).toEqual(["holofoil", "reverseHolofoil"]);
		expect(out.imageUrl).toBe("l.png");
		expect(out.setSeries).toBe("Sword & Shield");
	});
	test("variants is undefined when no prices", () => {
		const out = apiCardToProps({
			id: "base1-4", name: "Charizard", supertype: "Pokémon", number: "4",
			set: { id: "base1", name: "Base", series: "Base" },
			images: { small: "s", large: "l" },
		});
		expect(out.variants).toBeUndefined();
	});
});

describe("apiCardToFocusProps", () => {
	test("carries attacks and tcgplayer through", () => {
		const out = apiCardToFocusProps({
			id: "swsh9-154", name: "Charizard VSTAR", supertype: "Pokémon", number: "154",
			set: { id: "swsh9", name: "Brilliant Stars", series: "Sword & Shield", images: { logo: "logo.png" } },
			images: { small: "s", large: "l" },
			attacks: [{ name: "Star Blaze", damage: "320" }],
		});
		expect(out.setLogo).toBe("logo.png");
		expect(out.attacks?.[0]?.name).toBe("Star Blaze");
	});
});
```

- [ ] **Step 3: Run mapper tests, verify PASS** (the mappers are copied working code)

Run: `bun test src/server/card-mappers.test.ts`
Expected: all pass. If a type error surfaces (e.g. a missing optional on the test input), align the test input to the `PokemonApiCard`/`PokemonApiFocusCard` types — do NOT loosen the types.

- [ ] **Step 4: Create the server fetchers** `src/server/card-data.ts`

```ts
import { createServerFn } from "@tanstack/react-start";
import {
	type FilterClauses,
	buildFilterClauses,
} from "../utils/build-filter-clauses";
import { escapeLucene } from "../utils/escape-lucene";
import type { HoloCardData } from "../components/holo-card";
import {
	type FocusCardData,
	type PokemonApiCard,
	type PokemonApiFocusCard,
	type PokemonSet,
	apiCardToFocusProps,
	apiCardToProps,
} from "./card-mappers";

// v1: the CF Worker (injects the pokemontcg.io key). Absorb later by pointing
// at the origin and adding the key here. Server-only — never in the client bundle.
function apiBase(): string {
	return (process.env.API_BASE ?? "https://api.pokemontcg.io").replace(/\/$/, "");
}

interface CardPage {
	cards: HoloCardData[];
	totalCount: number;
}

async function fetchCards(
	query: string,
	page: number,
	pageSize: number,
	orderBy: string,
): Promise<CardPage> {
	const url = `${apiBase()}/v2/cards?select=id,name,number,images,rarity,subtypes,supertype,set,nationalPokedexNumbers,tcgplayer&orderBy=${orderBy}&q=${encodeURIComponent(query)}&page=${page}&pageSize=${pageSize}`;
	const resp = await fetch(url);
	if (!resp.ok) throw new Error(`Unable to fetch cards: ${resp.status}`);
	const json = (await resp.json()) as { data: PokemonApiCard[]; totalCount: number };
	return { cards: json.data.map(apiCardToProps), totalCount: json.totalCount };
}

export const getSetsFn = createServerFn({ method: "GET" }).handler(
	async (): Promise<PokemonSet[]> => {
		const resp = await fetch(
			`${apiBase()}/v2/sets?orderBy=releaseDate&select=id,name,series,releaseDate,total,images&pageSize=250`,
		);
		if (!resp.ok) throw new Error("Unable to fetch sets");
		const json = (await resp.json()) as { data: PokemonSet[] };
		return json.data;
	},
);

export interface SetCardsInput {
	setId: string;
	page: number;
	pageSize: number;
	filters?: FilterClauses;
	name?: string;
}

export const getCardsBySetFn = createServerFn({ method: "GET" })
	.inputValidator((input: SetCardsInput) => input)
	.handler(async ({ data }): Promise<CardPage> => {
		const nameClause = data.name ? ` name:"*${escapeLucene(data.name)}*"` : "";
		return fetchCards(
			`set.id:${data.setId}${nameClause}${buildFilterClauses(data.filters ?? {})}`,
			data.page,
			data.pageSize,
			"number",
		);
	});

export const getCardByIdFn = createServerFn({ method: "GET" })
	.inputValidator((id: string) => id)
	.handler(async ({ data: id }): Promise<FocusCardData> => {
		const resp = await fetch(`${apiBase()}/v2/cards/${id}`);
		if (!resp.ok) {
			if (resp.status === 404) throw new Response("Card not found", { status: 404 });
			throw new Error(`Failed to fetch card ${id}: ${resp.status}`);
		}
		const json = (await resp.json()) as { data: PokemonApiFocusCard };
		return apiCardToFocusProps(json.data);
	});
```

- [ ] **Step 5: Typecheck (server fns must compile against the real Start types)**

Run: `bun run typecheck`
Expected: exit 0. If `createServerFn`'s `.validator/.handler` chain type-errors, fix the call shape to match the installed `@tanstack/react-start` types (do not `as any`). If blocked on the API shape, report BLOCKED with the exact error.

- [ ] **Step 6: Commit**

```bash
git add src/server/card-mappers.ts src/server/card-mappers.test.ts src/server/card-data.ts
git commit -m "feat(server): card DTO mappers + key-safe server fetchers"
```

---

### Task 4: Cache-Control SWR header helper

**Files:**
- Create: `src/server/cache-headers.ts`
- Test: `src/server/cache-headers.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, test } from "bun:test";
import { cacheControl } from "./cache-headers";

describe("cacheControl", () => {
	test("prerendered series/home: long s-maxage + SWR", () => {
		expect(cacheControl("static")).toBe(
			"public, max-age=300, s-maxage=2592000, stale-while-revalidate=86400",
		);
	});
	test("SSR set/card: 1h fresh, 7d stale window", () => {
		expect(cacheControl("ssr")).toBe(
			"public, s-maxage=3600, stale-while-revalidate=604800",
		);
	});
	test("per-user: never cache", () => {
		expect(cacheControl("private")).toBe("private, no-store");
	});
	test("immutable assets", () => {
		expect(cacheControl("immutable")).toBe(
			"public, max-age=31536000, immutable",
		);
	});
});
```

- [ ] **Step 2: Run, verify FAIL**

Run: `bun test src/server/cache-headers.test.ts`
Expected: FAIL — `cacheControl` not exported.

- [ ] **Step 3: Implement**

```ts
export type CacheKind = "static" | "ssr" | "private" | "immutable";

/**
 * Cache-Control values for the 2-tier (Cloudflare edge + nginx) SWR cache.
 * Mirrors the matrix in refactor-workspace/goals.md. Apply via
 * setResponseHeaders in a route's server handler/loader.
 */
export function cacheControl(kind: CacheKind): string {
	switch (kind) {
		case "static":
			return "public, max-age=300, s-maxage=2592000, stale-while-revalidate=86400";
		case "ssr":
			return "public, s-maxage=3600, stale-while-revalidate=604800";
		case "private":
			return "private, no-store";
		case "immutable":
			return "public, max-age=31536000, immutable";
	}
}
```

- [ ] **Step 4: Run, verify PASS**

Run: `bun test src/server/cache-headers.test.ts`
Expected: 4 pass.

- [ ] **Step 5: Commit**

```bash
git add src/server/cache-headers.ts src/server/cache-headers.test.ts
git commit -m "feat(server): Cache-Control SWR header helper"
```

---

### Task 5: Verification gate

**Files:** none (verification only)

- [ ] **Step 1: Run the full gate in parallel** (3 Bash calls, one message)

- `bun run typecheck` → exit 0
- `bun run lint` (or `biome check --config-path=. src` if nested-config error) → clean
- `bun test` → all pass (the ~270 prior + the new slug/mapper/header suites)

Expected: all green. Quote any failure exactly. Pre-existing legacy errors (untouched files) → note, don't fix.

- [ ] **Step 2: Confirm no route wiring leaked in**

Run: `git grep -l "createFileRoute" src/server src/lib`
Expected: no output (these modules must not import route APIs — they're pure/server primitives).

---

## Self-review

- **Spec coverage:** Plan 02 = `map.md` "Server seam" rows (`lib/slug.ts`, `server/card-data.ts`, `server/cache-headers.ts`) + the DTO-mapper port. The `scripts/build-corpus.ts` slug-map emit from `map.md` is **intentionally dropped** per Assumption 3 (derive at runtime instead) — noted so it's not a silent gap.
- **Placeholders:** none — every step has real code + command + expected output.
- **Type consistency:** `SlugIndex`/`SluggableSet` defined Task 2, used by resolvers same task. `PokemonSet`/`FocusCardData`/`PokemonApiCard` moved to `card-mappers.ts` Task 3, imported by `card-data.ts` same task. `CacheKind` defined + used Task 4. `cacheControl` kinds match `goals.md`.
- **Reuse:** query building reuses tested `escape-lucene` + `build-filter-clauses` rather than duplicating `api.ts`.
- **Boundary:** Task 5 Step 2 asserts the seam stays pure (no route imports).

## Carried forward

- `api.ts` still exists with its own copies of the mappers/fetchers (client SPA path). It is **not** deleted here — Plan 04 removes it once routes/islands stop importing it. Until then both exist; that's expected during a big-bang-on-branch migration.
- Open for Plan 03: corpus-as-server-list-source (Assumption 5), slug-rename redirects (Assumption 4), and where the server obtains `(sets, cards)` to call `buildSlugIndex`.
