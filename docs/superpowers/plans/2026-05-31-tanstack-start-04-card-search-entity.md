# TanStack Start Migration — Plan 04: Card Detail + Search + Pokémon Entity

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the three remaining crawlable leaf pages — individual card pages (`/{series}/{set}/{card}`) with OpenGraph previews, a name-search page (`/search?q=`), and a per-Pokémon cross-set page (`/pokemon/{name}`) — all server-rendered. Wire the set grid's cards to link to their new card pages.

**Architecture:** Card-slug resolution is **scoped to the set in the URL** — no server-side 20k corpus. `card-resolve.ts` fetches the set's cards (via the raw `fetchCards` helper, memoized per set) and builds a per-set slug map with `slugify`. The `$card` route resolves slug→id against that map, then fetches full focus data via `getCardByIdFn`. Search + Pokémon pages SSR their first page via raw fetch helpers. Name→dex resolution uses the PokéAPI species list.

**Tech Stack:** TanStack Start `createFileRoute` loaders + `head()` OG meta + `notFound`; Plan 02 `slugify`/`getCardByIdFn`/`card-mappers`; Plan 03 `getNavTreeFn`/`findSet` + the raw `fetchCards`/`apiBase` helpers in `card-data.ts`.

---

## Ground-truth notes (verified against the repo — DO NOT skip)

- **`src/api/pokemon.ts` does NOT exist.** The pokémon list is fetched inline in `src/store/api-cache-slice.ts:99` as `fetch("https://pokeapi.co/api/v2/pokemon?limit=1025")` → `{ results: PokemonListEntry[] }`. So Plan 04 adds a NEW raw `fetchPokemonList()` to `card-data.ts` (direct pokeapi fetch) — it does NOT import a pokemon module.
- **`CardPage` is currently a non-exported `interface` in `card-data.ts:39`.** Task 2 must `export` it.
- **`fetchCards(query, page, pageSize, orderBy)` is already exported** from `card-data.ts` and already requests `types` in its select. Loaders/resolvers call `fetchCards` DIRECTLY (raw async) — NOT `getCardsBySetFn`/`getCardsByNameFn` via `{ data }`, because a server fn calling another server fn from a loader hits the RPC-stub error seen in Plan 03. The `createServerFn` wrappers exist for any future client-side calls; server-side code uses the raw helpers.
- **`PokemonListEntry`** is exported from `src/api.ts:72` (legacy, Plan 05 deletes it). To avoid depending on the legacy module, Task 1 adds `PokemonListEntry` to `src/server/card-mappers.ts` (a 2-field interface: `{ name: string; url: string }`) and imports it from there.
- **`@tanstack/react-start/server` is import-blocked in route files** (Plan 03). No `setResponseHeaders` in any route. Edge owns cache policy (Plan 06).
- The set page (`src/routes/$series/$set/index.tsx`) currently renders cards as plain `<li>` via `fetchCards` directly. Task 5 edits it — read its CURRENT content first.

---

## Assumptions (delegate-mode decisions — review)

1. **Card resolution is per-set, not global.** The URL names the set, so resolve within that set's ~200–400 cards (fetched + memoized). No server corpus. The client corpus stays a Plan 05 island.
2. **`$card` SSR renders a static focus view** — plain `<img>`, name, set, rarity, types, attacks, flavor. Pointer holo + live prices = Plan 05 islands (prices never in OG/cache). OG image = card large image URL.
3. **Search + Pokémon SSR via raw fetch**, not the corpus. Plan 05's island upgrades search to instant. By-Pokédex lives on `/pokemon/{name}`, not `/search`.
4. **`/pokemon/{name}`** resolves name→dex via the species list, then by-dex fetch. Slug = species name as PokéAPI spells it (`charizard`, `mr-mime`). Unknown → `notFound()`.
5. **Set-grid card links** retrofit Plan 03's set page (the carried-forward item).

---

## File structure

- `src/server/card-mappers.ts` — **modify**: add/confirm `PokemonListEntry` export.
- `src/server/card-data.ts` — **modify**: `export` `CardPage`; add raw `fetchCardsByName`/`fetchCardsByPokedex`/`fetchPokemonList` + their `createServerFn` wrappers `getCardsByNameFn`/`getCardsByPokedexFn`/`getPokemonListFn`.
- `src/server/pokemon-dex.ts` — pure `dexByName`/`nameByDex`. Sibling test.
- `src/server/card-resolve.ts` — `buildSetCardSlugs` (pure) + memoized `resolveCardInSet`/`cardSlugForId` (use raw `fetchCards`). Sibling test for the pure part.
- `src/routes/$series/$set/$card.tsx` — card detail SSR + OG.
- `src/routes/$series/$set/index.tsx` — **modify**: link cards.
- `src/routes/search.tsx` — name-search SSR.
- `src/routes/pokemon/$name.tsx` — per-Pokémon SSR.
- `src/components/card/card-detail.tsx` — static focus view (props-driven).

---

### Task 1: name↔dex helpers + `PokemonListEntry` in the seam

**Files:**
- Modify: `src/server/card-mappers.ts` (ensure `PokemonListEntry` exported)
- Create: `src/server/pokemon-dex.ts`
- Test: `src/server/pokemon-dex.test.ts`

- [ ] **Step 1: Ensure `PokemonListEntry` is exported from `card-mappers.ts`.** Open `src/server/card-mappers.ts`. If it already exports `PokemonListEntry`, skip. Otherwise add:
```ts
export interface PokemonListEntry {
	name: string;
	url: string;
}
```

- [ ] **Step 2: Write failing tests** `src/server/pokemon-dex.test.ts`

```ts
import { describe, expect, test } from "bun:test";
import type { PokemonListEntry } from "./card-mappers";
import { dexByName, nameByDex } from "./pokemon-dex";

const list: PokemonListEntry[] = [
	{ name: "bulbasaur", url: "https://pokeapi.co/api/v2/pokemon/1/" },
	{ name: "charizard", url: "https://pokeapi.co/api/v2/pokemon/6/" },
	{ name: "mr-mime", url: "https://pokeapi.co/api/v2/pokemon/122/" },
];

describe("dexByName", () => {
	test("maps a species name to its dex number", () => {
		expect(dexByName(list, "charizard")).toBe(6);
		expect(dexByName(list, "mr-mime")).toBe(122);
	});
	test("is case-insensitive", () => {
		expect(dexByName(list, "Charizard")).toBe(6);
	});
	test("returns null for unknown name", () => {
		expect(dexByName(list, "missingno")).toBeNull();
	});
});

describe("nameByDex", () => {
	test("maps a dex number back to the species name", () => {
		expect(nameByDex(list, 6)).toBe("charizard");
	});
	test("returns null for unknown dex", () => {
		expect(nameByDex(list, 9999)).toBeNull();
	});
});
```

- [ ] **Step 3: Run, verify FAIL** — `bun test src/server/pokemon-dex.test.ts`

- [ ] **Step 4: Implement `src/server/pokemon-dex.ts`**

```ts
import type { PokemonListEntry } from "./card-mappers";

/** Extract the trailing numeric id from a PokéAPI URL (".../6/"). */
function dexFromUrl(url: string): number | null {
	const m = url.match(/\/(\d+)\/?$/);
	return m ? Number(m[1]) : null;
}

/** National dex number for a species name (case-insensitive), or null. */
export function dexByName(list: PokemonListEntry[], name: string): number | null {
	const lower = name.toLowerCase();
	const entry = list.find((p) => p.name.toLowerCase() === lower);
	return entry ? dexFromUrl(entry.url) : null;
}

/** Species name for a national dex number, or null. */
export function nameByDex(list: PokemonListEntry[], dex: number): string | null {
	const entry = list.find((p) => dexFromUrl(p.url) === dex);
	return entry ? entry.name : null;
}
```

- [ ] **Step 5: Run, verify PASS** — `bun test src/server/pokemon-dex.test.ts` (5 pass)

- [ ] **Step 6: Commit**

```bash
git add src/server/card-mappers.ts src/server/pokemon-dex.ts src/server/pokemon-dex.test.ts
git commit -m "feat(server): name<->dex helpers + PokemonListEntry in seam"
```

---

### Task 2: Server fetchers — name, pokédex, pokémon list

**Files:**
- Modify: `src/server/card-data.ts`

- [ ] **Step 1: Export `CardPage`.** In `card-data.ts`, change `interface CardPage {` to `export interface CardPage {`.

- [ ] **Step 2: Add raw helpers + server-fn wrappers.** Append to `card-data.ts`. Add the `PokemonListEntry` import to the existing `card-mappers` import block.

```ts
// add to the import from "./card-mappers":
//   PokemonListEntry

const POKEMON_LIST_LIMIT = 1025;

export function fetchCardsByName(
	name: string,
	page: number,
	pageSize: number,
): Promise<CardPage> {
	return fetchCards(
		`name:"*${escapeLucene(name)}*"`,
		page,
		pageSize,
		"set.releaseDate,number",
	);
}

export function fetchCardsByPokedex(
	dex: number,
	page: number,
	pageSize: number,
): Promise<CardPage> {
	return fetchCards(
		`nationalPokedexNumbers:${dex}`,
		page,
		pageSize,
		"set.releaseDate,number",
	);
}

/** Raw species-list fetch (PokéAPI). Not a server fn — safe to call in loaders. */
export async function fetchPokemonList(): Promise<PokemonListEntry[]> {
	const resp = await fetch(
		`https://pokeapi.co/api/v2/pokemon?limit=${POKEMON_LIST_LIMIT}`,
	);
	if (!resp.ok) throw new Error("Unable to fetch Pokémon list");
	const json = (await resp.json()) as { results: PokemonListEntry[] };
	return json.results;
}

let pokemonListCache: PokemonListEntry[] | null = null;
export async function getPokemonListCached(): Promise<PokemonListEntry[]> {
	if (!pokemonListCache) pokemonListCache = await fetchPokemonList();
	return pokemonListCache;
}

// createServerFn wrappers (for any future client-side calls; loaders use the raw fns above).
export const getCardsByNameFn = createServerFn({ method: "GET" })
	.inputValidator((i: { name: string; page: number; pageSize: number }) => i)
	.handler(({ data }) => fetchCardsByName(data.name, data.page, data.pageSize));

export const getCardsByPokedexFn = createServerFn({ method: "GET" })
	.inputValidator((i: { dex: number; page: number; pageSize: number }) => i)
	.handler(({ data }) => fetchCardsByPokedex(data.dex, data.page, data.pageSize));

export const getPokemonListFn = createServerFn({ method: "GET" }).handler(() =>
	getPokemonListCached(),
);
```

- [ ] **Step 3: Typecheck** — `bun run typecheck` → exit 0. Fix import/type issues against the real module (don't `as any`).

- [ ] **Step 4: Commit**

```bash
git add src/server/card-data.ts
git commit -m "feat(server): name/pokedex/pokemon-list fetchers (raw + server fns)"
```

---

### Task 3: Per-set card resolution

**Files:**
- Create: `src/server/card-resolve.ts`
- Test: `src/server/card-resolve.test.ts`

- [ ] **Step 1: Write failing tests** (pure `buildSetCardSlugs`)

```ts
import { describe, expect, test } from "bun:test";
import type { HoloCardData } from "../components/holo-card";
import { buildSetCardSlugs } from "./card-resolve";

const c = (over: Partial<HoloCardData> & Pick<HoloCardData, "id" | "name" | "cardNumber">): HoloCardData => ({
	imageUrl: "l", imageUrlSmall: "s", supertype: "Pokémon",
	setId: "swsh9", setName: "Brilliant Stars", setSeries: "Sword & Shield", ...over,
});

describe("buildSetCardSlugs", () => {
	const cards = [
		c({ id: "swsh9-154", name: "Charizard VSTAR", cardNumber: "154" }),
		c({ id: "swsh9-018", name: "Charizard VSTAR", cardNumber: "018" }),
		c({ id: "swsh9-001", name: "Pikachu", cardNumber: "1" }),
	];
	const map = buildSetCardSlugs(cards);

	test("slug -> id; number disambiguates same-named cards", () => {
		expect(map.idBySlug.get("charizard-vstar-154")).toBe("swsh9-154");
		expect(map.idBySlug.get("charizard-vstar-018")).toBe("swsh9-018");
		expect(map.idBySlug.get("pikachu-1")).toBe("swsh9-001");
	});
	test("id -> slug round-trips", () => {
		expect(map.slugById.get("swsh9-154")).toBe("charizard-vstar-154");
	});
});
```

- [ ] **Step 2: Run, verify FAIL** — `bun test src/server/card-resolve.test.ts`

- [ ] **Step 3: Implement `src/server/card-resolve.ts`** (uses raw `fetchCards`, not the RPC wrapper)

```ts
import type { HoloCardData } from "../components/holo-card";
import { slugify } from "../lib/slug";
import { fetchCards } from "./card-data";

export interface SetCardSlugs {
	idBySlug: Map<string, string>;
	slugById: Map<string, string>;
}

/** Build a card-slug map for one set's cards (name + number, collision-safe). */
export function buildSetCardSlugs(cards: HoloCardData[]): SetCardSlugs {
	const idBySlug = new Map<string, string>();
	const slugById = new Map<string, string>();
	for (const card of [...cards].sort((a, b) => a.id.localeCompare(b.id))) {
		const base = slugify(card.name);
		const num = slugify(card.cardNumber);
		let slug = num ? `${base}-${num}` : base;
		if (idBySlug.has(slug)) slug = `${slug}-${card.id}`;
		idBySlug.set(slug, card.id);
		slugById.set(card.id, slug);
	}
	return { idBySlug, slugById };
}

// Fetch + slug a whole set, memoized per set id for the process lifetime.
const setCache = new Map<string, Promise<{ cards: HoloCardData[]; slugs: SetCardSlugs }>>();

async function loadSet(setId: string) {
	const all: HoloCardData[] = [];
	let page = 1;
	let total = Number.POSITIVE_INFINITY;
	while (all.length < total && page <= 10) {
		const res = await fetchCards(`set.id:${setId}`, page, 250, "number");
		all.push(...res.cards);
		total = res.totalCount;
		if (res.cards.length === 0) break;
		page++;
	}
	return { cards: all, slugs: buildSetCardSlugs(all) };
}

function getSet(setId: string) {
	let p = setCache.get(setId);
	if (!p) {
		p = loadSet(setId);
		setCache.set(setId, p);
	}
	return p;
}

/** Resolve a card slug within a set to its card id (or undefined). */
export async function resolveCardInSet(setId: string, cardSlug: string): Promise<string | undefined> {
	return (await getSet(setId)).slugs.idBySlug.get(cardSlug);
}

/** Canonical card slug for a card id within its set (or undefined). */
export async function cardSlugForId(setId: string, cardId: string): Promise<string | undefined> {
	return (await getSet(setId)).slugs.slugById.get(cardId);
}
```

- [ ] **Step 4: Run, verify PASS** — `bun test src/server/card-resolve.test.ts` (2 pass)

- [ ] **Step 5: Commit**

```bash
git add src/server/card-resolve.ts src/server/card-resolve.test.ts
git commit -m "feat(server): per-set card-slug resolution (raw fetch, no corpus)"
```

---

### Task 4: Card detail page (SSR + OG)

**Files:**
- Create: `src/components/card/card-detail.tsx`
- Create: `src/routes/$series/$set/$card.tsx`

- [ ] **Step 1: Static detail view** `src/components/card/card-detail.tsx`

```tsx
import type { FocusCardData } from "../../server/card-mappers";

/**
 * SSR-safe focus view: image + metadata. Pointer-reactive HoloCard + live
 * TCGplayer prices are Plan 05 islands (prices must never be cached/OG'd).
 */
export function CardDetail({ card }: { card: FocusCardData }) {
	return (
		<article className="mx-auto grid max-w-4xl gap-6 p-4 md:grid-cols-[auto_1fr]">
			<img src={card.imageUrl} alt={card.name} width={320} className="w-full max-w-[320px] rounded-xl" />
			<div className="min-w-0 space-y-3">
				<h1 className="text-2xl font-bold">{card.name}</h1>
				<p className="text-sm text-muted-foreground">
					{card.setName} · {card.setSeries} · #{card.cardNumber}
					{card.rarity ? ` · ${card.rarity}` : ""}
				</p>
				{card.types && card.types.length > 0 && (
					<p className="text-sm">Type: {card.types.join(", ")}</p>
				)}
				{card.attacks && card.attacks.length > 0 && (
					<div className="space-y-2">
						<h2 className="font-semibold">Attacks</h2>
						{card.attacks.map((a) => (
							<div key={a.name} className="text-sm">
								<span className="font-medium">{a.name}</span>
								{a.damage ? ` — ${a.damage}` : ""}
								{a.text ? <p className="text-muted-foreground">{a.text}</p> : null}
							</div>
						))}
					</div>
				)}
				{card.flavorText && <p className="text-sm italic text-muted-foreground">{card.flavorText}</p>}
			</div>
		</article>
	);
}
```

- [ ] **Step 2: Card route** `src/routes/$series/$set/$card.tsx`

```tsx
import { createFileRoute, notFound } from "@tanstack/react-router";
import { CardDetail } from "../../../components/card/card-detail";
import { getCardByIdFn } from "../../../server/card-data";
import { resolveCardInSet } from "../../../server/card-resolve";
import { findSet, getNavTreeFn } from "../../../server/nav-tree";

export const Route = createFileRoute("/$series/$set/$card")({
	loader: async ({ params }) => {
		const tree = await getNavTreeFn();
		const set = findSet(tree, params.series, params.set);
		if (!set) throw notFound();
		const cardId = await resolveCardInSet(set.id, params.card);
		if (!cardId) throw notFound();
		const card = await getCardByIdFn({ data: cardId });
		return { card };
	},
	head: ({ loaderData }) => {
		const card = loaderData?.card;
		if (!card) return { meta: [{ title: "Card — Pokémon TCG" }] };
		const title = `${card.name} · ${card.setName} — Pokémon TCG`;
		const desc = `${card.name} (${card.rarity ?? "card"}) from ${card.setName}, #${card.cardNumber}.`;
		return {
			meta: [
				{ title },
				{ name: "description", content: desc },
				{ property: "og:title", content: title },
				{ property: "og:description", content: desc },
				{ property: "og:image", content: card.imageUrl },
				{ property: "og:type", content: "article" },
				{ name: "twitter:card", content: "summary_large_image" },
				{ name: "twitter:image", content: card.imageUrl },
			],
		};
	},
	component: CardPage,
});

function CardPage() {
	const { card } = Route.useLoaderData();
	return (
		<div className="h-full overflow-y-auto">
			<CardDetail card={card} />
		</div>
	);
}
```

Note: `getCardByIdFn` is a server fn called from a loader — this specific pattern worked in Plan 03's `card-data` (the validator takes a string id). If it throws the RPC-stub error at runtime, switch to a raw `fetchCardById` helper (extract the fetch body from `getCardByIdFn` into a raw async fn in `card-data.ts`, mirroring `fetchAllSets`/`getSetsFn`) and call that. Report if you had to do this.

- [ ] **Step 3: Build + SSR-verify.** Build, run server, derive a real card URL from the set page, fetch it, check OG + title.

```bash
bun run build && node .output/server/index.mjs & SERVER_PID=$!
sleep 3
curl -s http://localhost:3000/sword-shield/brilliant-stars > /tmp/p4set.html
CARD_URL=$(grep -oE '/sword-shield/brilliant-stars/[a-z0-9-]+' /tmp/p4set.html | head -1)
echo "CARD_URL=$CARD_URL"
curl -s -o /tmp/p4card.html -w "HTTP=%{http_code}\n" "http://localhost:3000${CARD_URL}"
kill $SERVER_PID
echo "og:image count: $(grep -c 'og:image' /tmp/p4card.html)"
grep -oE '<title>[^<]+' /tmp/p4card.html | head -1
```
Expected: if Task 5 not yet done, the set page has no card links — then test a hand-built URL: pick a card name from the set page, slugify (lowercase, hyphenate) + append its number. Report the actual URL tested, HTTP code, og:image presence, title. (Order tip: it's fine to do Task 5 before this verify, then come back — note which order you used.)

- [ ] **Step 4: Commit**

```bash
git add "src/components/card/card-detail.tsx" "src/routes/\$series/\$set/\$card.tsx"
git commit -m "feat(routes): card detail page — SSR focus view + OpenGraph"
```

---

### Task 5: Link set-grid cards to card pages

**Files:**
- Modify: `src/routes/$series/$set/index.tsx`

- [ ] **Step 1: Read the current file** to anchor the edit (`src/routes/$series/$set/index.tsx`). It uses `fetchCards` directly in the loader and renders `<li>` with `<img>` + name.

- [ ] **Step 2: Add slugs in the loader + render `Link`s.** Add import `import { buildSetCardSlugs } from "../../../server/card-resolve";` and `import { Link } from "@tanstack/react-router";`. After building `all` in the loader:
```ts
		const slugs = buildSetCardSlugs(all);
		const cards = all.map((c) => ({ ...c, slug: slugs.slugById.get(c.id) ?? c.id }));
		return { set, cards, facets: deriveFacets(all) };
```
In `SetPage`, add `const params = Route.useParams();` and replace each card `<li>` body with a `Link`:
```tsx
				{cards.map((card) => (
					<li key={card.id}>
						<Link
							to="/$series/$set/$card"
							params={{ series: params.series, set: params.set, card: card.slug }}
							className="flex flex-col items-center gap-1"
						>
							<img src={card.imageUrlSmall} alt={card.name} loading="lazy" className="w-full rounded" />
							<span className="text-center text-xs">{card.name}</span>
						</Link>
					</li>
				))}
```

- [ ] **Step 3: Build + SSR-verify links present**

```bash
bun run build && node .output/server/index.mjs & SERVER_PID=$!
sleep 3
curl -s http://localhost:3000/sword-shield/brilliant-stars > /tmp/p4set2.html
kill $SERVER_PID
echo "unique card links: $(grep -oE '/sword-shield/brilliant-stars/[a-z0-9-]+' /tmp/p4set2.html | sort -u | wc -l)"
grep -oE '/sword-shield/brilliant-stars/[a-z0-9-]+' /tmp/p4set2.html | sort -u | head -3
```
Expected: many unique links (≈ set size). Report count + 3 samples. Then re-run Task 4's verify against a real link to confirm click-through resolves 200 (determinism check: same `buildSetCardSlugs` builds the link and resolves it).

- [ ] **Step 4: Commit**

```bash
git add "src/routes/\$series/\$set/index.tsx"
git commit -m "feat(routes): link set-grid cards to their detail pages"
```

---

### Task 6: Search page (`/search?q=`)

**Files:**
- Create: `src/routes/search.tsx`

- [ ] **Step 1: Implement** (uses raw `fetchCardsByName`)

```tsx
import { createFileRoute, Link } from "@tanstack/react-router";
import { fetchCardsByName } from "../server/card-data";

export const Route = createFileRoute("/search")({
	validateSearch: (search: Record<string, unknown>): { q: string } => ({
		q: typeof search.q === "string" ? search.q : "",
	}),
	loaderDeps: ({ search }) => ({ q: search.q }),
	loader: async ({ deps }) => {
		const q = deps.q.trim();
		if (!q) return { q, cards: [], total: 0 };
		const res = await fetchCardsByName(q, 1, 40);
		return { q, cards: res.cards, total: res.totalCount };
	},
	head: ({ loaderData }) => ({
		meta: [
			{ title: loaderData?.q ? `"${loaderData.q}" — Pokémon TCG search` : "Search — Pokémon TCG" },
			{ name: "description", content: `Search results for ${loaderData?.q ?? ""}.` },
		],
	}),
	component: SearchPage,
});

function SearchPage() {
	const { q, cards, total } = Route.useLoaderData();
	return (
		<div className="mx-auto w-full max-w-7xl overflow-y-auto px-4 py-5">
			<h1 className="mb-3 text-xl font-bold">
				{q ? `Results for "${q}"` : "Search"}
				{q ? <span className="ml-2 text-sm text-muted-foreground">{total} cards</span> : null}
			</h1>
			<ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
				{cards.map((card) => (
					<li key={card.id} className="flex flex-col items-center gap-1">
						<img src={card.imageUrlSmall} alt={card.name} loading="lazy" className="w-full rounded" />
						<span className="text-center text-xs">{card.name}</span>
						<span className="text-center text-[10px] text-muted-foreground">{card.setName}</span>
					</li>
				))}
			</ul>
		</div>
	);
}
```
Note (Assumption 3): results link to card pages in Plan 05 (cross-set resolution is client-side via the corpus island). Here they render name+image (crawlable).

- [ ] **Step 2: Build + SSR-verify**

```bash
bun run build && node .output/server/index.mjs & SERVER_PID=$!
sleep 3
curl -s -o /tmp/p4search.html -w "HTTP=%{http_code}\n" "http://localhost:3000/search?q=charizard"
kill $SERVER_PID
echo "result imgs: $(grep -c 'loading=\"lazy\"' /tmp/p4search.html)"
grep -oE '<title>[^<]+' /tmp/p4search.html | head -1
```
Expected: HTTP 200; multiple images; title contains `charizard`. Report counts.

- [ ] **Step 3: Commit**

```bash
git add src/routes/search.tsx
git commit -m "feat(routes): name-search page (SSR first page)"
```

---

### Task 7: Pokémon entity page (`/pokemon/$name`)

**Files:**
- Create: `src/routes/pokemon/$name.tsx`

- [ ] **Step 1: Implement** (raw `getPokemonListCached` + `fetchCardsByPokedex`)

```tsx
import { createFileRoute, notFound } from "@tanstack/react-router";
import { fetchCardsByPokedex, getPokemonListCached } from "../../server/card-data";
import { dexByName } from "../../server/pokemon-dex";

function titleCase(slug: string): string {
	return slug.split("-").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(" ");
}

export const Route = createFileRoute("/pokemon/$name")({
	loader: async ({ params }) => {
		const list = await getPokemonListCached();
		const dex = dexByName(list, params.name);
		if (dex === null) throw notFound();
		const res = await fetchCardsByPokedex(dex, 1, 60);
		return { display: titleCase(params.name), cards: res.cards, total: res.totalCount };
	},
	head: ({ loaderData }) => {
		const d = loaderData?.display ?? "Pokémon";
		return {
			meta: [
				{ title: `${d} — every Pokémon TCG card` },
				{ name: "description", content: `Browse all ${loaderData?.total ?? ""} ${d} cards across every set.` },
				{ property: "og:title", content: `${d} — Pokémon TCG cards` },
			],
		};
	},
	component: PokemonPage,
});

function PokemonPage() {
	const { display, cards, total } = Route.useLoaderData();
	return (
		<div className="mx-auto w-full max-w-7xl overflow-y-auto px-4 py-5">
			<h1 className="mb-3 text-xl font-bold">
				{display} <span className="ml-2 text-sm text-muted-foreground">{total} cards</span>
			</h1>
			<ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
				{cards.map((card) => (
					<li key={card.id} className="flex flex-col items-center gap-1">
						<img src={card.imageUrlSmall} alt={card.name} loading="lazy" className="w-full rounded" />
						<span className="text-center text-[10px] text-muted-foreground">{card.setName}</span>
					</li>
				))}
			</ul>
		</div>
	);
}
```

- [ ] **Step 2: Build + SSR-verify**

```bash
bun run build && node .output/server/index.mjs & SERVER_PID=$!
sleep 3
curl -s -o /tmp/p4poke.html -w "HTTP=%{http_code}\n" "http://localhost:3000/pokemon/charizard"
curl -s -o /dev/null -w "unknown=%{http_code}\n" "http://localhost:3000/pokemon/notapokemon"
kill $SERVER_PID
echo "imgs: $(grep -c 'loading=\"lazy\"' /tmp/p4poke.html)"
grep -oE '<title>[^<]+' /tmp/p4poke.html | head -1
```
Expected: `/pokemon/charizard` 200 + many images + "Charizard …" title; `/pokemon/notapokemon` 404. Report both.

- [ ] **Step 3: Commit**

```bash
git add "src/routes/pokemon/\$name.tsx"
git commit -m "feat(routes): per-Pokemon cross-set entity page (SSR + OG)"
```

---

### Task 8: Verification gate

- [ ] **Step 1: Full gate (parallel — 3 calls one message):** `bun run typecheck` (0), `biome check --config-path=. src` (clean), `bun test` (all pass: prior 296 + pokemon-dex 5 + card-resolve 2 = 303).
- [ ] **Step 2: Route sanity:** `bun run build` exits 0; `.output` has prerendered series HTML but NO `*/[set]/*` card HTML.
- [ ] **Step 3: Commit lint autofixes if any** (`git add -u src/` is the allowed exception here, only if biome rewrote files): `git commit -m "style: biome formatting for plan 04 files"`.

---

## Self-review

- **Spec coverage:** `map.md` `$card` (SSR+OG+resolution ✓), `search` (SSR ✓), `pokemon/$name` (new entity ✓), set-grid links (carried-forward ✓). Dialog parity + instant search + result→card links = Plan 05.
- **Ground-truth corrections vs. first draft:** no phantom `src/api/pokemon.ts` (raw `fetchPokemonList` added instead); `CardPage` exported; loaders use raw `fetchCards`/`fetchCardsBy*` not RPC wrappers; `PokemonListEntry` sourced from `card-mappers` not legacy `api.ts`.
- **Placeholders:** none. Static views = scope boundary (Plan 05 interactivity), not placeholders.
- **Type consistency:** `dexByName`/`nameByDex` (T1) → `/pokemon` (T7). `fetchCardsByName/ByPokedex`/`getPokemonListCached` (T2) → T6/T7. `buildSetCardSlugs`/`resolveCardInSet` (T3) → `$card` (T4) + set page (T5), same fn = deterministic slugs. `CardPage` exported (T2) consumed by raw fetchers. `FocusCardData` (card-mappers) → `CardDetail`.
- **No-corpus invariant:** Assumption 1 + raw-`fetchCards` resolution. T8.2 confirms cards aren't prerendered.

## Carried forward (→ Plan 05 islands)

- Holo + live prices on the card page; dialog↔page parity on client nav.
- Instant corpus search replacing `/search` SSR; search/pokémon result → card-page links (client cross-set resolution).
- Cross-link overlays (`View all {name}` → `/pokemon/{name}`).
