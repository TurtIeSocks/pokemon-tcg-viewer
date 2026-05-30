# Broaden "By Pokémon" → Free-Text Card Search — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Switch the "By Pokémon" page's primary search axis from national Pokédex number to free-text card name, so Trainer and Energy cards become searchable.

**Architecture:** New `?q=` URL param feeds a new debounced `CardSearch` box and a new `getCardsByName` API helper that queries pokemontcg.io with `name:"*<escaped>*"`. Existing filter chips, pagination (`useCards`), and both view modes are reused unchanged. The Pokédex-number machinery (`getCardsByPokedexNumber`, `usePokedexParam`, `PokemonFilter`) is retained for the dev-only holo-debug page. Cross-links that meant "view all of this Pokémon" now name-search by species name.

**Tech Stack:** React 19, TypeScript, react-router, Zustand store, `bun test` + `@testing-library/react` (+ `bun:test`), Biome (lint/format). DOM provided to tests via `bunfig.toml` preload `src/test-setup.ts`.

**Spec:** `docs/superpowers/specs/2026-05-29-broaden-by-pokemon-search-design.md`

**Conventions to follow:**
- Test imports: `import { describe, expect, test } from "bun:test";` and `import { render, screen, fireEvent, waitFor } from "@testing-library/react";`.
- Hook/component tests render inside `<MemoryRouter initialEntries={[url]}>` via a small probe component (see `src/hooks/use-url-selection.test.tsx`).
- Run a single test file with: `bun test <path>`. Run the whole suite with: `bun test`.
- Lint/format: `bun run lint` (Biome). Typecheck: `bun run typecheck` (`tsc -b`).
- Prefer `interface` for object shapes (project + user convention).

---

## File Structure

**Create:**
- `src/utils/escape-lucene.ts` — pure helper: escape Lucene/pokemontcg query specials.
- `src/utils/escape-lucene.test.ts` — its unit tests.
- `src/components/card-search.tsx` — free-text debounced search box (`CardSearch`).
- `src/components/card-search.css` — its styles (mirrors `pokemon-filter.css`).
- `src/components/card-search.test.tsx` — its unit tests.
- `src/api.test.ts` — new; covers `getCardsByName` (first test file for `api.ts`).

**Modify:**
- `src/api.ts` — add `getCardsByName` (keep `getCardsByPokedexNumber`).
- `src/hooks/use-url-selection.ts` — add `useNameQueryParam` (keep `usePokedexParam`).
- `src/hooks/use-url-selection.test.tsx` — add `useNameQueryParam` suite.
- `src/pages/pokemon-page.tsx` — wire name search; update header/empty copy.
- `src/pages/card-page.tsx:118` — cross-link `?dex=` → `?q=`.
- `src/pages/sets-page.tsx:94-95` — cross-link `?dex=` → `?q=`.
- `src/pages/card-page.test.tsx` — update the cross-link test (seed pokémon list).
- `src/components/cross-link-overlay/cross-link-overlay.test.tsx` — fixture hrefs → `?q=`.
- `src/components/card-grid.test.tsx:37` — fixture overlay-link href → `?q=`.
- `src/root-layout.tsx:26` — nav label "By Pokémon" → "Search".
- `src/app.test.tsx:24` — nav-label assertion → "Search".

**Untouched (verify they still compile):** `src/pages/holo-debug-page.tsx`, `src/components/pokemon-filter.tsx`, `FilterChipRow`, `buildFilterClauses`, `useCards`, `PokemonTimeline`, `CardGrid`.

---

### Task 1: `escapeLucene` utility

The name query is `name:"*<X>*"`. `X` is user input placed inside a double-quoted Lucene clause. Unescaped `"` would close the clause (injection); `\` is the escape char; `*` and `?` act as wildcards even inside quotes on pokemontcg.io (verified: `name:"*char*"` wildcard-matches). Escape all four so user input is treated literally.

**Files:**
- Create: `src/utils/escape-lucene.ts`
- Test: `src/utils/escape-lucene.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/utils/escape-lucene.test.ts
import { describe, expect, test } from "bun:test";
import { escapeLucene } from "./escape-lucene";

describe("escapeLucene", () => {
  test("leaves plain text untouched", () => {
    expect(escapeLucene("pikachu")).toBe("pikachu");
  });

  test("leaves spaces, periods, and apostrophes literal", () => {
    expect(escapeLucene("Mr. Mime")).toBe("Mr. Mime");
    expect(escapeLucene("Farfetch'd")).toBe("Farfetch'd");
  });

  test("escapes double quotes (clause break-out)", () => {
    expect(escapeLucene('a"b')).toBe('a\\"b');
  });

  test("escapes backslash before anything else", () => {
    expect(escapeLucene("a\\b")).toBe("a\\\\b");
  });

  test("escapes wildcard characters so they are literal", () => {
    expect(escapeLucene("a*b")).toBe("a\\*b");
    expect(escapeLucene("who?")).toBe("who\\?");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/utils/escape-lucene.test.ts`
Expected: FAIL — `Cannot find module './escape-lucene'` (or `escapeLucene is not a function`).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/utils/escape-lucene.ts
/**
 * Escape characters that are significant in pokemontcg.io's Lucene query
 * syntax so a user's raw input can be embedded literally inside a quoted
 * clause like `name:"*<input>*"`. We escape backslash (the escape char
 * itself), double-quote (would close the clause — injection), and the
 * wildcards `*` / `?` (active even inside quotes on pokemontcg.io). The
 * single regex pass is left-to-right over the original string, so a literal
 * backslash becomes `\\` correctly without double-processing.
 */
export function escapeLucene(input: string): string {
  return input.replace(/[\\"*?]/g, (ch) => `\\${ch}`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/utils/escape-lucene.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/utils/escape-lucene.ts src/utils/escape-lucene.test.ts
git commit -m "feat(search): add escapeLucene query-sanitizer util"
```

---

### Task 2: `getCardsByName` API helper

**Files:**
- Modify: `src/api.ts` (add helper after `getCardsByPokedexNumber`, ~line 125; add import)
- Test: `src/api.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
// src/api.test.ts
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { getCardsByName } from "./api";

const realFetch = globalThis.fetch;
let lastUrl = "";

function mockFetchEmpty() {
  lastUrl = "";
  globalThis.fetch = mock(async (input: RequestInfo | URL) => {
    lastUrl = String(input);
    return new Response(JSON.stringify({ data: [], totalCount: 0 }), {
      status: 200,
    });
  }) as unknown as typeof fetch;
}

function queryParam(): string {
  return new URL(lastUrl).searchParams.get("q") ?? "";
}

describe("getCardsByName", () => {
  beforeEach(mockFetchEmpty);
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  test("builds a substring name clause", async () => {
    await getCardsByName("pikachu", 1, 20);
    expect(queryParam()).toBe('name:"*pikachu*"');
  });

  test("escapes specials in the query", async () => {
    await getCardsByName('a"b', 1, 20);
    expect(queryParam()).toBe('name:"*a\\"b*"');
  });

  test("appends filter clauses with AND", async () => {
    await getCardsByName("pikachu", 1, 20, { supertype: ["Trainer"] });
    expect(queryParam()).toBe('name:"*pikachu*" AND (supertype:Trainer)');
  });

  test("requests the page/pageSize it was given", async () => {
    await getCardsByName("pikachu", 3, 50);
    const u = new URL(lastUrl);
    expect(u.searchParams.get("page")).toBe("3");
    expect(u.searchParams.get("pageSize")).toBe("50");
  });

  test("maps API cards to HoloCardData", async () => {
    globalThis.fetch = mock(async () =>
      new Response(
        JSON.stringify({
          data: [
            {
              id: "swsh4-43",
              name: "Pikachu V",
              supertype: "Pokémon",
              number: "43",
              set: { id: "swsh4", name: "Vivid Voltage", series: "Sword & Shield" },
              images: { small: "s.png", large: "l.png" },
            },
          ],
          totalCount: 1,
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;
    const { cards, totalCount } = await getCardsByName("pikachu", 1, 20);
    expect(totalCount).toBe(1);
    expect(cards[0]).toMatchObject({ id: "swsh4-43", name: "Pikachu V", imageUrl: "l.png" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/api.test.ts`
Expected: FAIL — `getCardsByName` is not exported from `./api`.

- [ ] **Step 3: Write minimal implementation**

Add the import at the top of `src/api.ts` (merge into the existing import from `./utils/build-filter-clauses` block — add a new line):

```ts
import { escapeLucene } from "./utils/escape-lucene";
```

Add the helper immediately after `getCardsByPokedexNumber` (after line 125):

```ts
export function getCardsByName(
  name: string,
  page: number,
  pageSize: number,
  filters?: FilterClauses,
): Promise<{ cards: HoloCardData[]; totalCount: number }> {
  return getCardsByQuery(
    `name:"*${escapeLucene(name)}*"${buildFilterClauses(filters ?? {})}`,
    page,
    pageSize,
    "set.releaseDate,number",
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/api.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/api.ts src/api.test.ts
git commit -m "feat(search): add getCardsByName (name:\"*q*\") API helper"
```

---

### Task 3: `useNameQueryParam` URL hook

**Files:**
- Modify: `src/hooks/use-url-selection.ts` (add hook + `SetNameQuery` type)
- Test: `src/hooks/use-url-selection.test.tsx` (add a probe + suite)

- [ ] **Step 1: Write the failing test**

Add the import to the existing import block at the top of `src/hooks/use-url-selection.test.tsx`:

```ts
import {
  useFilterParam,
  useNameQueryParam,
  usePokedexParam,
  useSetIdParam,
  useViewModeParam,
} from "./use-url-selection";
```

Add this probe component and suite at the end of the file:

```tsx
function NameQueryProbe() {
  const [q, setQ] = useNameQueryParam();
  return (
    <>
      <span data-testid="value">{q || "empty"}</span>
      <button type="button" onClick={() => setQ("charizard")}>
        set
      </button>
      <button type="button" onClick={() => setQ("")}>
        clear
      </button>
    </>
  );
}

describe("useNameQueryParam", () => {
  test("reads existing q from URL", () => {
    renderInRouter(<NameQueryProbe />, "/pokemon?q=charizard");
    expect(screen.getByTestId("value").textContent).toBe("charizard");
  });

  test("returns empty string when q is absent", () => {
    renderInRouter(<NameQueryProbe />, "/pokemon");
    expect(screen.getByTestId("value").textContent).toBe("empty");
  });

  test("trims surrounding whitespace on read", () => {
    renderInRouter(<NameQueryProbe />, "/pokemon?q=%20%20pika%20%20");
    expect(screen.getByTestId("value").textContent).toBe("pika");
  });

  test("setQuery writes the param", () => {
    renderInRouter(<NameQueryProbe />, "/pokemon");
    fireEvent.click(screen.getByText("set"));
    expect(screen.getByTestId("value").textContent).toBe("charizard");
  });

  test("setQuery('') clears the param", () => {
    renderInRouter(<NameQueryProbe />, "/pokemon?q=charizard");
    fireEvent.click(screen.getByText("clear"));
    expect(screen.getByTestId("value").textContent).toBe("empty");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/hooks/use-url-selection.test.tsx`
Expected: FAIL — `useNameQueryParam` is not exported.

- [ ] **Step 3: Write minimal implementation**

Add to `src/hooks/use-url-selection.ts` (after `usePokedexParam`, before `useFilterParam`):

```ts
type SetNameQuery = (q: string, opts?: UpdateOptions) => void;

/**
 * URL-backed free-text search for the By-Name view. Reads/writes the `q`
 * search param. Returns "" for a missing param; trims surrounding
 * whitespace on read. Setting an empty/whitespace value removes the param.
 */
export function useNameQueryParam(): [string, SetNameQuery] {
  const [params, setParams] = useSearchParams();
  const q = (params.get("q") ?? "").trim();
  const setQuery: SetNameQuery = (next, opts) => {
    const trimmed = next.trim();
    const nextParams = new URLSearchParams(params);
    if (trimmed) nextParams.set("q", trimmed);
    else nextParams.delete("q");
    setParams(nextParams, opts?.replace ? { replace: true } : undefined);
  };
  return [q, setQuery];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/hooks/use-url-selection.test.tsx`
Expected: PASS (existing suites + 5 new tests).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/use-url-selection.ts src/hooks/use-url-selection.test.tsx
git commit -m "feat(search): add useNameQueryParam (?q=) URL hook"
```

---

### Task 4: `CardSearch` component

A controlled, debounced free-text input. Commits the trimmed value to `onChange` after `debounceMs` of inactivity; `Enter` forces an immediate commit; the clear button (`×`) and `Escape` reset to `""`. External `value` changes (back/forward nav, cross-link arrival) sync back into the box. No autocomplete dropdown — the results grid is the answer surface.

**Files:**
- Create: `src/components/card-search.tsx`
- Create: `src/components/card-search.css`
- Test: `src/components/card-search.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/card-search.test.tsx
import { describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CardSearch } from "./card-search";

describe("<CardSearch />", () => {
  test("renders the prop value as the input value", () => {
    render(<CardSearch value="charizard" onChange={() => {}} />);
    const input = screen.getByRole("searchbox") as HTMLInputElement;
    expect(input.value).toBe("charizard");
  });

  test("commits the trimmed text after the debounce", async () => {
    const onChange = mock(() => {});
    render(<CardSearch value="" onChange={onChange} debounceMs={10} />);
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "  boss  " },
    });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("boss"));
  });

  test("Enter commits immediately", () => {
    const onChange = mock(() => {});
    render(<CardSearch value="" onChange={onChange} debounceMs={100000} />);
    const input = screen.getByRole("searchbox");
    fireEvent.change(input, { target: { value: "erika" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("erika");
  });

  test("clear button resets text and commits empty", () => {
    const onChange = mock(() => {});
    render(<CardSearch value="erika" onChange={onChange} debounceMs={100000} />);
    fireEvent.click(screen.getByRole("button", { name: /clear/i }));
    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("");
    expect(onChange).toHaveBeenCalledWith("");
  });

  test("does not commit when the trimmed value is unchanged", () => {
    const onChange = mock(() => {});
    render(<CardSearch value="erika" onChange={onChange} debounceMs={100000} />);
    const input = screen.getByRole("searchbox");
    fireEvent.change(input, { target: { value: "erika" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/components/card-search.test.tsx`
Expected: FAIL — `Cannot find module './card-search'`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/card-search.tsx
import { useCallback, useEffect, useRef, useState } from "react";
import "./card-search.css";

interface CardSearchProps {
  value: string;
  onChange: (query: string) => void;
  /** Debounce window before an edit is committed to onChange. */
  debounceMs?: number;
}

export function CardSearch({
  value,
  onChange,
  debounceMs = 300,
}: CardSearchProps) {
  const [text, setText] = useState(value);

  // Keep the latest onChange without making commit() change identity.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // The last value we've pushed up / received down. Used to (a) dedupe
  // no-op commits and (b) detect genuinely external value changes so we
  // can mirror them back into the box without clobbering live typing.
  const lastCommittedRef = useRef(value);

  useEffect(() => {
    if (value !== lastCommittedRef.current) {
      setText(value);
      lastCommittedRef.current = value;
    }
  }, [value]);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };
  useEffect(() => clearTimer, []);

  const commit = useCallback((next: string) => {
    const trimmed = next.trim();
    if (trimmed === lastCommittedRef.current) return;
    lastCommittedRef.current = trimmed;
    onChangeRef.current(trimmed);
  }, []);

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    setText(next);
    clearTimer();
    timerRef.current = setTimeout(() => commit(next), debounceMs);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      clearTimer();
      commit(text);
    } else if (e.key === "Escape") {
      clear();
    }
  }

  function clear() {
    clearTimer();
    setText("");
    commit("");
  }

  const showClear = text.length > 0;

  return (
    <div className="card-search">
      <div className="card-search-input-wrap">
        <input
          type="search"
          className="card-search-input"
          placeholder="Search any card by name (e.g. Pikachu, Erika, Boss's Orders)"
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          aria-label="Search cards by name"
          role="searchbox"
        />
        {showClear && (
          <button
            type="button"
            className="card-search-clear"
            onClick={clear}
            aria-label="Clear search"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create the stylesheet**

Mirror the existing `src/components/pokemon-filter.css` look. Create `src/components/card-search.css`:

```css
.card-search {
  position: relative;
  max-width: 520px;
  margin: 0 auto 1rem;
}

.card-search-input-wrap {
  position: relative;
}

.card-search-input {
  width: 100%;
  padding: 0.7rem 2.4rem 0.7rem 1rem;
  font-size: 1rem;
  color: inherit;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 999px;
  outline: none;
}

.card-search-input::placeholder {
  color: rgba(255, 255, 255, 0.45);
}

.card-search-input:focus {
  border-color: rgba(255, 255, 255, 0.4);
  background: rgba(255, 255, 255, 0.1);
}

.card-search-clear {
  position: absolute;
  top: 50%;
  right: 0.6rem;
  transform: translateY(-50%);
  width: 1.6rem;
  height: 1.6rem;
  display: grid;
  place-items: center;
  font-size: 1.1rem;
  line-height: 1;
  color: rgba(255, 255, 255, 0.6);
  background: transparent;
  border: none;
  border-radius: 50%;
  cursor: pointer;
}

.card-search-clear:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.12);
}
```

> Note: the input uses `type="search"`; `@testing-library`'s `getByRole("searchbox")` matches `<input type="search">` (and our explicit `role="searchbox"` is harmless reinforcement).

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test src/components/card-search.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/card-search.tsx src/components/card-search.css src/components/card-search.test.tsx
git commit -m "feat(search): add debounced CardSearch free-text input"
```

---

### Task 5: Wire `PokemonPage` to name search

Replace the Pokédex-number axis with the name query. No dedicated page test exists today (the page is wiring over already-unit-tested parts: `useNameQueryParam`, `getCardsByName`, `CardSearch`, `useCards`, `FilterChipRow`); this task is verified by typecheck/lint/build in Task 8 and the preview workflow at the end.

**Files:**
- Modify: `src/pages/pokemon-page.tsx`

- [ ] **Step 1: Update imports**

In `src/pages/pokemon-page.tsx`:
- Change `import { getCardsByPokedexNumber } from "../api";` → `import { getCardsByName } from "../api";`
- Change `import { PokemonFilter } from "../components/pokemon-filter";` → `import { CardSearch } from "../components/card-search";`
- In the `use-url-selection` import block, replace `usePokedexParam` with `useNameQueryParam`:

```ts
import {
  useFilterParam,
  useNameQueryParam,
  useViewModeParam,
} from "../hooks/use-url-selection";
```

- [ ] **Step 2: Update state + key + fetcher**

Replace the body from the `usePokedexParam` line through the `useCards` call (currently lines 36–66) with:

```tsx
  const [query, setQuery] = useNameQueryParam();
  const [view, setView] = useViewModeParam();
  const [types] = useFilterParam("types");
  const [rarity] = useFilterParam("rarity");
  const [supertype] = useFilterParam("supertype");
  const [subtypes] = useFilterParam("subtypes");

  const filterSig = `${types.join(",")}|${rarity.join(",")}|${supertype.join(",")}|${subtypes.join(",")}`;
  const baseKey = query === "" ? null : query;
  const cacheKey = baseKey
    ? filterSig === "|||"
      ? baseKey
      : `${baseKey}|${filterSig}`
    : null;

  const fetcher: CardFetcher = useMemo(
    () => (_key, page, pageSize) => {
      if (query === "") {
        return Promise.resolve({ cards: [], totalCount: 0 });
      }
      return getCardsByName(query, page, pageSize, {
        types,
        rarity,
        supertype,
        subtypes,
      });
    },
    [query, types, rarity, supertype, subtypes],
  );

  const { cards, loading, loadMore, hasMore } = useCards(cacheKey, fetcher);
```

- [ ] **Step 3: Update header copy + the search box + view-toggle guard**

In the returned JSX:
- Change the label `<div className="set-name">Filter by Pokémon</div>` → `<div className="set-name">Search cards</div>`
- Change the `set-sub` block to use `query`:

```tsx
<div className="set-sub">
  {query === ""
    ? "Search any card by name — Pokémon, Trainer, or Energy"
    : `"${query}" · ${cards.length} cards loaded`}
</div>
```

- Change `<ViewModeToggle value={view} onChange={setView} disabled={pokedexNumber === null} />` → `disabled={query === ""}`.
- Replace `<PokemonFilter value={pokedexNumber} onChange={setPokedexNumber} />` → `<CardSearch value={query} onChange={setQuery} />`.

- [ ] **Step 4: Typecheck the page**

Run: `bun run typecheck`
Expected: PASS — no references to `pokedexNumber` / `getCardsByPokedexNumber` / `PokemonFilter` remain in `pokemon-page.tsx`, and all new symbols resolve.

- [ ] **Step 5: Commit**

```bash
git add src/pages/pokemon-page.tsx
git commit -m "feat(search): wire By-Name search into PokemonPage"
```

---

### Task 6: Migrate cross-links to name search

The two overlay cross-links that meant "view all cards of this Pokémon" now name-search by the resolved species name. Both sites already compute that name for the label.

**Files:**
- Modify: `src/pages/card-page.tsx:118`
- Modify: `src/pages/sets-page.tsx:93-96`
- Modify: `src/pages/card-page.test.tsx` (cross-link test)
- Modify: `src/components/cross-link-overlay/cross-link-overlay.test.tsx`
- Modify: `src/components/card-grid.test.tsx:37`

- [ ] **Step 1: Update the card-page cross-link test (write the new expectation first)**

In `src/pages/card-page.test.tsx`:
- Add to the existing imports near the top:

```ts
import { afterEach } from "bun:test";
import { useStore } from "../store";
```

(Merge `afterEach` into the existing `bun:test` import line rather than duplicating it.)

- Add a store reset so the seeded list does not leak to other tests. Place near the top of the `describe` body:

```ts
afterEach(() => {
  useStore.setState({ pokemonList: null });
});
```

- Replace the existing test `"renders cross-link to Pokémon view (per pokédex number)"` (lines ~154–160) with:

```tsx
test("renders cross-link to By-Name search for the Pokémon", async () => {
  // Seed the pokémon list so dex 25 resolves to a real species name.
  const list = Array.from({ length: 25 }, (_, i) => ({
    name: i === 24 ? "pikachu" : `mon-${i + 1}`,
    url: "",
  }));
  useStore.setState({ pokemonList: list });
  renderWithFixture(POKEMON_FIXTURE);
  await waitFor(() => {
    const link = screen.getByRole("link", { name: /View all Pikachu/i });
    expect(link.getAttribute("href")).toBe("/pokemon?q=Pikachu");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/pages/card-page.test.tsx`
Expected: FAIL — the link still points at `/pokemon?dex=25` (and label may read "View all #25" until the source is updated).

- [ ] **Step 3: Update the card-page source**

In `src/pages/card-page.tsx`, change line 118 from:

```ts
    crossLinks.push({ label: `View all ${name}`, to: `/pokemon?dex=${dex}` });
```

to:

```ts
    crossLinks.push({
      label: `View all ${name}`,
      to: `/pokemon?q=${encodeURIComponent(name)}`,
    });
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/pages/card-page.test.tsx`
Expected: PASS.

- [ ] **Step 5: Update the sets-page source**

In `src/pages/sets-page.tsx`, change the `renderOverlay` links map (lines 93–96) from:

```ts
    const links = dexNums.map((n) => ({
      label: `View all ${pokemonNameByDex(pokemonList, n) ?? `#${n}`}`,
      to: `/pokemon?dex=${n}`,
    }));
```

to:

```ts
    const links = dexNums.map((n) => {
      const name = pokemonNameByDex(pokemonList, n) ?? `#${n}`;
      return {
        label: `View all ${name}`,
        to: `/pokemon?q=${encodeURIComponent(name)}`,
      };
    });
```

- [ ] **Step 6: Update the fixture-only tests**

These tests pass literal `to` values into presentational components; update them to `?q=` so they stay representative.

In `src/components/cross-link-overlay/cross-link-overlay.test.tsx`:
- Line ~19 & ~23 (single-link test): change `to: "/pokemon?dex=25"` → `to: "/pokemon?q=pikachu"` and the href assertion `toBe("/pokemon?dex=25")` → `toBe("/pokemon?q=pikachu")`.
- Lines ~30–31 (multi-link test): change `to: "/pokemon?dex=25"` → `to: "/pokemon?q=pikachu"` and `to: "/pokemon?dex=644"` → `to: "/pokemon?q=zekrom"`.

In `src/components/card-grid.test.tsx`:
- Line 37: change `<Link to="/pokemon?dex=25" data-testid="overlay-link">` → `<Link to="/pokemon?q=pikachu" data-testid="overlay-link">` (the test only asserts navigation to the `/pokemon` route, which is query-agnostic — this keeps the fixture honest).

- [ ] **Step 7: Run the affected suites to verify they pass**

Run: `bun test src/components/cross-link-overlay/cross-link-overlay.test.tsx src/components/card-grid.test.tsx`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/pages/card-page.tsx src/pages/card-page.test.tsx src/pages/sets-page.tsx src/components/cross-link-overlay/cross-link-overlay.test.tsx src/components/card-grid.test.tsx
git commit -m "feat(search): point Pokémon cross-links at By-Name search"
```

---

### Task 7: Rename nav label

**Files:**
- Modify: `src/app.test.tsx:24`
- Modify: `src/root-layout.tsx:26`

- [ ] **Step 1: Update the nav assertion (write the new expectation first)**

In `src/app.test.tsx`, change line 24 from:

```ts
  expect(screen.getByText("By Pokémon")).toBeDefined();
```

to:

```ts
  expect(screen.getByText("Search")).toBeDefined();
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/app.test.tsx`
Expected: FAIL — "Search" is not in the nav yet ("By Pokémon" still rendered).

- [ ] **Step 3: Update the nav label**

In `src/root-layout.tsx`, change line 26 (the `NavLink` to `/pokemon`) text from `By Pokémon` to `Search`.

> Leave the route path `/pokemon` unchanged — only the visible label changes.

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/app.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/root-layout.tsx src/app.test.tsx
git commit -m "feat(search): rename By-Pokémon nav label to Search"
```

---

### Task 8: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run lint, typecheck, and the full test suite in parallel**

Run (single batch):
- `bun run lint`
- `bun run typecheck`
- `bun test`

Expected: all PASS. The suite includes the prior green tests plus the new `escape-lucene`, `api`, `useNameQueryParam`, and `CardSearch` tests, and the updated cross-link/nav tests. No references to removed page wiring (`getCardsByPokedexNumber` is still exported and still used by `holo-debug-page.tsx`, so it must remain).

- [ ] **Step 2: Production build**

Run: `bun run build`
Expected: PASS (`tsc -b && vite build`).

- [ ] **Step 3: Preview verification (browser)**

Start the dev server (preview_start) and verify the broadened behavior:
1. Navigate to `/pokemon` — empty state shows "Search any card by name — Pokémon, Trainer, or Energy"; nav label reads "Search".
2. Type `erika` — grid loads cards including the Trainer "Erika" (supertype Trainer) alongside Pokémon like "Erika's Clefable". URL shows `?q=erika`.
3. Type `boss` — "Boss's Orders" (Trainer) appears (previously impossible).
4. Apply the Supertype chip = Trainer — results narrow to Trainer cards only.
5. From a card focus view, click "View all <Name>" — lands on `/pokemon?q=<Name>` with results.

Capture a screenshot of a trainer-card result for the report.

---

## Self-Review

**Spec coverage:**
- Goal 1 (free text reaches all supertypes) → Tasks 2, 5; verified Task 8 preview.
- Goal 2 (substring match) → Task 1 (`*q*`), Task 2 test.
- Goal 3 (URL-backed `?q=`) → Task 3.
- Goal 4 (filters compose) → Task 5 fetcher passes filters to `getCardsByName`; Task 2 test asserts clause append.
- Goal 5 (cross-links name-search) → Task 6.
- Goal 6 (both view modes) → unchanged; Task 5 keeps grid/timeline branch.
- Goal 7 (holo-debug untouched) → `getCardsByPokedexNumber`/`usePokedexParam`/`PokemonFilter` retained; Task 8 typecheck/build covers it.
- Non-goal "don't remove dex machinery" → honored (retained, just unused by main page).

**Placeholder scan:** No TBD/TODO; every code step shows full code; every run step shows the command + expected outcome. The one "no dedicated test" decision (Task 5) is explicit and justified, with concrete verification routed to Tasks 5.4 / 8.

**Type/name consistency:**
- `escapeLucene(input: string): string` — defined Task 1, consumed Task 2. ✓
- `getCardsByName(name, page, pageSize, filters?)` — defined Task 2, called Task 5. ✓
- `useNameQueryParam(): [string, SetNameQuery]` — defined Task 3, consumed Task 5. ✓
- `CardSearch({ value, onChange, debounceMs? })` — defined Task 4, used Task 5. ✓
- `?q=` param name consistent across hook, page, cross-links, and tests. ✓
