# Pricing PR 3a — Multi-Currency Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay the multi-currency foundation for the valuation feature — an ISO-4217 currency registry with minor-unit exponents, exponent-aware money formatting (so ¥350 stores/renders as 350, not 35000 or ¥3.50), a `Profile.displayCurrency` setting (mirroring `displayLanguage`), and an unlocked per-stack currency picker. No valuation math or P&L — that is PR 3b, which builds on this.

**Architecture:** A new `src/lib/currencies.ts` owns all currency metadata (supported list, labels, symbols, minor-unit exponents, locale default) exactly as `src/lib/languages.ts` owns language metadata. `money.ts` reads exponents from it so parse/format scale by the currency, not a hardcoded ×100. `Profile.displayCurrency` and the `Stack.currency` picker thread through the existing profile-settings and stack-form patterns — both already have a `currency` field in the store; this PR only exposes and correctly scales it.

**Tech Stack:** TypeScript, React 19, TanStack Form + Zod, Zustand, shadcn Select, Supabase (dormant in prod), Bun test.

**Spec:** `docs/superpowers/specs/2026-07-03-pricing-implementation-design.md` (§5 Currency; multi-currency assumptions).

## Global Constraints

- Money is stored in **integer minor units**; the scaling factor is the currency's ISO-4217 minor-unit **exponent** (USD/EUR = 2, JPY/KRW = 0), NOT a hardcoded 100. `null` = unknown (never `undefined`, never 0-as-unknown).
- Canonical internal rollup currency is USD (established; unchanged here). This PR is about *entry* and *display* currency, not conversion (FX conversion is PR 3b).
- `Profile.displayCurrency` is **additive** — no snapshot `schemaVersion` bump (exactly like `displayLanguage`, which is additive with a backfill).
- Currency metadata lives in ONE place (`src/lib/currencies.ts`), mirroring `src/lib/languages.ts`. Do not scatter symbol/exponent tables.
- `interface` for object shapes; `type` for unions/tuples. Tabs. Optional fields `null` not `undefined`.
- Deterministic formatting (no `Intl` locale dependence) so snapshot tests don't vary by host — keep `money.ts`'s existing "deterministic" contract, just make it exponent-aware.
- Tests must not hit the network. Lint: `bunx biome check --write --config-path=. <files>` (NOT `bun run lint`).
- Do NOT `git add -A` — add only the files each task names. Commit after every task.
- Do not run the full suite mid-plan except where a task changes a shared signature (`money.ts`); the final task regenerates `routeTree.gen.ts` (gitignored — boot `vite dev` briefly) then runs `tsc -b` + full `bun test` + biome.

## File Structure

- `src/lib/currencies.ts` — NEW. Currency registry: supported list, labels, symbols, minor-unit exponents, `exponentFor`/`symbolFor`, `isSupportedCurrency`/`toSupportedCurrency`, `defaultCurrencyForLocale`.
- `src/store/userland/money.ts` — MODIFIED. `inputToMinorUnits`/`minorUnitsToInput`/`formatPrice` become exponent-aware via `currencies.ts` (currency param, default "USD" — backward compatible).
- `src/store/userland/types.ts` — MODIFIED. Add `Profile.displayCurrency` + to `ProfilePatch`.
- `src/store/userland/idb-repo.ts`, `supabase-repo.ts`, `backup.ts` — MODIFIED. Persist `displayCurrency` (mirror `displayLanguage`).
- `supabase/migrations/<ts>_profile_display_currency.sql` — NEW. `display_currency` column (dormant in prod).
- `src/components/profile/profile-form-dialog.tsx` — MODIFIED. Display-currency Select (mirror the language Select).
- `src/components/collection/stack-form-schema.ts`, `stack-form-mapping.ts` — MODIFIED. `currency` form field + exponent-aware pricePaid mapping.
- `src/components/collection/stack-edit-form.tsx` — MODIFIED. Currency Select after Price paid.
- `src/store/userland/csv.ts` — MODIFIED. Pass the row/stack currency to the money boundary (exponent-correct round-trip).

---

### Task 1: Currency registry (`src/lib/currencies.ts`)

**Files:**
- Create: `src/lib/currencies.ts`
- Test: `src/lib/currencies.test.ts`

**Interfaces:**
- Produces:
  - `const SUPPORTED_CURRENCIES` (readonly tuple), `type SupportedCurrency`
  - `const CURRENCY_LABELS: Record<SupportedCurrency, string>`
  - `function exponentFor(currency: string): number` (2 default; 0 for zero-decimal)
  - `function symbolFor(currency: string): string | undefined`
  - `function isSupportedCurrency(c: string): c is SupportedCurrency`
  - `function toSupportedCurrency(c: string | null | undefined): SupportedCurrency`
  - `function defaultCurrencyForLocale(locale?: string): SupportedCurrency`

- [ ] **Step 1: Write the failing test**

Create `src/lib/currencies.test.ts`:

```ts
import { expect, test } from "bun:test";
import {
	defaultCurrencyForLocale,
	exponentFor,
	isSupportedCurrency,
	symbolFor,
	toSupportedCurrency,
} from "./currencies";

test("exponentFor: 2 by default, 0 for zero-decimal currencies", () => {
	expect(exponentFor("USD")).toBe(2);
	expect(exponentFor("EUR")).toBe(2);
	expect(exponentFor("JPY")).toBe(0);
	expect(exponentFor("KRW")).toBe(0);
	expect(exponentFor("XYZ")).toBe(2); // unknown → safe default
});

test("symbolFor returns known symbols, undefined otherwise", () => {
	expect(symbolFor("USD")).toBe("$");
	expect(symbolFor("JPY")).toBe("¥");
	expect(symbolFor("XYZ")).toBeUndefined();
});

test("isSupportedCurrency / toSupportedCurrency", () => {
	expect(isSupportedCurrency("USD")).toBe(true);
	expect(isSupportedCurrency("xyz")).toBe(false);
	expect(toSupportedCurrency("EUR")).toBe("EUR");
	expect(toSupportedCurrency("xyz")).toBe("USD");
	expect(toSupportedCurrency(null)).toBe("USD");
});

test("defaultCurrencyForLocale maps region → currency, falls back to USD", () => {
	expect(defaultCurrencyForLocale("en-GB")).toBe("GBP");
	expect(defaultCurrencyForLocale("ja-JP")).toBe("JPY");
	expect(defaultCurrencyForLocale("de-DE")).toBe("EUR");
	expect(defaultCurrencyForLocale("en-US")).toBe("USD");
	expect(defaultCurrencyForLocale("xx")).toBe("USD"); // no region → USD
	expect(defaultCurrencyForLocale("en-ZZ")).toBe("USD"); // unknown region → USD
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/currencies.test.ts`
Expected: FAIL — `Cannot find module './currencies'`

- [ ] **Step 3: Write the implementation**

Create `src/lib/currencies.ts`:

```ts
/**
 * Currency registry — the single source of truth for the display-currency
 * switcher and the per-stack currency picker, mirroring `languages.ts`.
 * Owns ISO-4217 metadata: which currencies the UI offers, their labels,
 * symbols, and minor-unit exponents (the scaling factor between stored integer
 * minor units and displayed major units — 2 for USD/EUR, 0 for JPY/KRW).
 */

export const SUPPORTED_CURRENCIES = [
	"USD",
	"EUR",
	"GBP",
	"JPY",
	"CAD",
	"AUD",
	"CHF",
	"CNY",
	"KRW",
	"HKD",
	"SGD",
	"MXN",
	"BRL",
	"INR",
	"SEK",
	"NZD",
	"PLN",
] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

/** Human-readable label for each supported currency (code + name). */
export const CURRENCY_LABELS: Record<SupportedCurrency, string> = {
	USD: "USD — US Dollar",
	EUR: "EUR — Euro",
	GBP: "GBP — British Pound",
	JPY: "JPY — Japanese Yen",
	CAD: "CAD — Canadian Dollar",
	AUD: "AUD — Australian Dollar",
	CHF: "CHF — Swiss Franc",
	CNY: "CNY — Chinese Yuan",
	KRW: "KRW — South Korean Won",
	HKD: "HKD — Hong Kong Dollar",
	SGD: "SGD — Singapore Dollar",
	MXN: "MXN — Mexican Peso",
	BRL: "BRL — Brazilian Real",
	INR: "INR — Indian Rupee",
	SEK: "SEK — Swedish Krona",
	NZD: "NZD — New Zealand Dollar",
	PLN: "PLN — Polish Złoty",
};

const SYMBOLS: Record<string, string> = {
	USD: "$",
	EUR: "€",
	GBP: "£",
	JPY: "¥",
	CAD: "$",
	AUD: "$",
	CHF: "CHF ",
	CNY: "¥",
	KRW: "₩",
	HKD: "$",
	SGD: "$",
	MXN: "$",
	BRL: "R$",
	INR: "₹",
	SEK: "kr ",
	NZD: "$",
	PLN: "zł ",
};

// ISO-4217 zero-decimal currencies (a superset of the supported list, so a
// future addition is already correct). Everything else is exponent 2.
const ZERO_DECIMAL: ReadonlySet<string> = new Set([
	"JPY",
	"KRW",
	"ISK",
	"CLP",
	"VND",
	"XOF",
	"XAF",
	"PYG",
	"UGX",
	"RWF",
]);

/** Minor-unit exponent (stored-integer → major-unit scale). Default 2. */
export function exponentFor(currency: string): number {
	return ZERO_DECIMAL.has(currency) ? 0 : 2;
}

/** Display symbol for a currency, or undefined to fall back to the bare code. */
export function symbolFor(currency: string): string | undefined {
	return SYMBOLS[currency];
}

export function isSupportedCurrency(c: string): c is SupportedCurrency {
	return (SUPPORTED_CURRENCIES as readonly string[]).includes(c);
}

/** Normalize an arbitrary code to a supported one; unknown → USD. */
export function toSupportedCurrency(
	c: string | null | undefined,
): SupportedCurrency {
	return c && isSupportedCurrency(c) ? c : "USD";
}

// Region → currency for the browser-locale default. Only regions whose currency
// is in SUPPORTED_CURRENCIES; anything else falls through to USD.
const REGION_CURRENCY: Record<string, SupportedCurrency> = {
	US: "USD",
	GB: "GBP",
	JP: "JPY",
	CA: "CAD",
	AU: "AUD",
	CH: "CHF",
	CN: "CNY",
	KR: "KRW",
	HK: "HKD",
	SG: "SGD",
	MX: "MXN",
	BR: "BRL",
	IN: "INR",
	SE: "SEK",
	NZ: "NZD",
	PL: "PLN",
	DE: "EUR",
	FR: "EUR",
	ES: "EUR",
	IT: "EUR",
	PT: "EUR",
	NL: "EUR",
	IE: "EUR",
	AT: "EUR",
	BE: "EUR",
	FI: "EUR",
};

/**
 * Best-effort default display currency from a BCP-47 locale ("en-GB" → GBP).
 * Falls back to USD when the locale has no region or an unmapped one. SSR-safe:
 * pass `locale`; otherwise reads `navigator.language` when available.
 */
export function defaultCurrencyForLocale(locale?: string): SupportedCurrency {
	const tag =
		locale ??
		(typeof navigator !== "undefined" ? navigator.language : undefined) ??
		"en-US";
	const region = tag.split("-")[1]?.toUpperCase();
	return (region && REGION_CURRENCY[region]) || "USD";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/lib/currencies.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Lint + commit**

```bash
bunx biome check --write --config-path=. src/lib/currencies.ts src/lib/currencies.test.ts
git add src/lib/currencies.ts src/lib/currencies.test.ts
git commit -m "feat(pricing): ISO-4217 currency registry (labels, symbols, exponents, locale default)"
```

---

### Task 2: Exponent-aware `money.ts`

**Files:**
- Modify: `src/store/userland/money.ts`
- Test: `src/store/userland/money.test.ts` (create if absent; else append)

**Interfaces:**
- Consumes: `exponentFor`, `symbolFor` from `src/lib/currencies.ts` (Task 1).
- Produces (signatures change — currency param added with a `"USD"` default so existing callers keep working):
  - `function inputToMinorUnits(value: string, currency?: string): number | null`
  - `function minorUnitsToInput(minor: number | null, currency?: string): string`
  - `function formatPrice(minor: number | null, currency: string): string` (unchanged signature; now exponent-aware)

- [ ] **Step 1: Write the failing tests**

Create/replace `src/store/userland/money.test.ts`:

```ts
import { expect, test } from "bun:test";
import {
	formatPrice,
	inputToMinorUnits,
	minorUnitsToInput,
} from "./money";

test("inputToMinorUnits scales by the currency exponent", () => {
	expect(inputToMinorUnits("3.50", "USD")).toBe(350);
	expect(inputToMinorUnits("19.99", "USD")).toBe(1999); // float-trap guard
	expect(inputToMinorUnits("350", "JPY")).toBe(350); // 0-decimal: no ×100
	expect(inputToMinorUnits("", "USD")).toBeNull();
	expect(inputToMinorUnits("abc", "JPY")).toBeNull();
});

test("inputToMinorUnits defaults to USD (2-decimal) for back-compat", () => {
	expect(inputToMinorUnits("3.50")).toBe(350);
});

test("minorUnitsToInput inverts by the currency exponent", () => {
	expect(minorUnitsToInput(350, "USD")).toBe("3.5");
	expect(minorUnitsToInput(350, "JPY")).toBe("350");
	expect(minorUnitsToInput(null, "USD")).toBe("");
	expect(minorUnitsToInput(350)).toBe("3.5"); // default USD
});

test("formatPrice renders the exponent-correct amount + symbol", () => {
	expect(formatPrice(350, "USD")).toBe("$3.50");
	expect(formatPrice(350, "JPY")).toBe("¥350"); // 0-decimal
	expect(formatPrice(50168, "EUR")).toBe("€501.68");
	expect(formatPrice(1234, "PLN")).toBe("zł 12.34");
	expect(formatPrice(1000, "XYZ")).toBe("10.00 XYZ"); // unknown symbol → bare code
	expect(formatPrice(null, "USD")).toBe("");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/store/userland/money.test.ts`
Expected: FAIL — JPY cases wrong (current code hardcodes ×100 / `.toFixed(2)`).

- [ ] **Step 3: Write the implementation**

Replace the body of `src/store/userland/money.ts` (keep the file's top comment intent, update the stale "exponent assumed 2 / currency is a reserved slot" note):

```ts
// src/store/userland/money.ts

import { exponentFor, symbolFor } from "@/lib/currencies";

/**
 * Money helpers for the minor-units↔major-units boundary. Stacks store
 * `pricePaid` in integer MINOR UNITS; humans type and read MAJOR UNITS. Every
 * form field, CSV cell, and price label converts through here so the scaling
 * factor — the currency's ISO-4217 minor-unit exponent — lives in one place.
 *
 * The exponent comes from `src/lib/currencies.ts` (USD/EUR = 2, JPY/KRW = 0),
 * so ¥350 round-trips as the integer 350, not 35000. The currency param
 * defaults to "USD" (exponent 2) for back-compat with USD-only call sites.
 */

/**
 * Parse a user-entered major-unit amount into integer minor units for `currency`.
 * "3.50" USD → 350; "350" JPY → 350. Empty/blank → null (unknown, ≠ 0).
 * Non-numeric → null. Rounds to guard binary-float drift (19.99 USD → 1999).
 */
export function inputToMinorUnits(
	value: string,
	currency = "USD",
): number | null {
	const trimmed = value.trim();
	if (trimmed === "") return null;
	const n = Number(trimmed);
	if (!Number.isFinite(n)) return null;
	return Math.round(n * 10 ** exponentFor(currency));
}

/**
 * Render integer minor units as a bare major-unit string for a controlled form
 * field or CSV cell, scaled by `currency`'s exponent. 350 USD → "3.5"; 350 JPY
 * → "350". null → "". No symbol, no forced trailing zeros.
 */
export function minorUnitsToInput(
	minor: number | null,
	currency = "USD",
): string {
	if (minor == null) return "";
	return String(minor / 10 ** exponentFor(currency));
}

/**
 * Format minor units + ISO-4217 code for display: 350,"USD" → "$3.50";
 * 350,"JPY" → "¥350". Unknown symbol → "10.00 XYZ". null → "". Deterministic
 * (no Intl/locale dependence) so snapshot tests don't vary by host locale.
 */
export function formatPrice(minor: number | null, currency: string): string {
	if (minor == null) return "";
	const exp = exponentFor(currency);
	const amount = (minor / 10 ** exp).toFixed(exp);
	const symbol = symbolFor(currency);
	return symbol ? `${symbol}${amount}` : `${amount} ${currency}`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/store/userland/money.test.ts`
Expected: PASS.

- [ ] **Step 5: Guard the shared-signature change**

`money.ts` is imported widely. Run the money-adjacent suites to confirm the defaulted param broke nothing:

Run: `bun test src/store/userland/csv.test.ts src/components/collection/`
Expected: PASS (these call the money boundary; the `"USD"` default preserves current behavior — CSV gets currency-aware in Task 5).

- [ ] **Step 6: Lint + commit**

```bash
bunx biome check --write --config-path=. src/store/userland/money.ts src/store/userland/money.test.ts
git add src/store/userland/money.ts src/store/userland/money.test.ts
git commit -m "feat(pricing): exponent-aware money formatting (JPY/KRW 0-decimal support)"
```

---

### Task 3: `Profile.displayCurrency` across the persistence layer

**Files:**
- Modify: `src/store/userland/types.ts` (`Profile` + `ProfilePatch`)
- Modify: `src/store/userland/idb-repo.ts` (profile save default)
- Modify: `src/store/userland/supabase-repo.ts` (profile save merge, 2 sites: ~342, ~353)
- Modify: `src/store/userland/supabase-row.ts` (`ProfileRow` type + `profileToRow` + `rowToProfile`)
- Modify: `src/store/userland/backup.ts` (backfill)
- Create: `supabase/migrations/20260703090000_profile_display_currency.sql`
- Test: extend `src/store/userland/backup.test.ts` + `src/store/userland/idb-repo.test.ts`

**Interfaces:**
- Consumes: nothing new (string field).
- Produces: `Profile.displayCurrency: string` (always present, default "USD"); `ProfilePatch` accepts `displayCurrency`.

- [ ] **Step 1: Write the failing tests**

Append to `src/store/userland/backup.test.ts` (mirror the existing `displayLanguage` backfill test near line 236):

```ts
test("upgrade backfills displayCurrency to USD when absent", () => {
	const raw = {
		schemaVersion: 6,
		exportedAt: 1,
		collection: [],
		binders: [],
		profile: {
			id: "me",
			displayName: "X",
			bio: null,
			avatarPreset: "a",
			favoriteSetId: null,
			displayLanguage: "en",
			createdAt: 1,
			updatedAt: 1,
			deletedAt: null,
		},
	};
	const up = upgrade(raw as never);
	expect(up.profile?.displayCurrency).toBe("USD");
});
```

(Use the same `upgrade` import + call convention the surrounding tests use — read the top of `backup.test.ts` and match it.)

Append to `src/store/userland/idb-repo.test.ts` (mirror the `displayLanguage` save/patch test near line 250):

```ts
test("saveProfile persists displayCurrency and defaults it to USD", async () => {
	const repo = makeIdbRepos(); // match the file's repo-construction helper
	await repo.profile.save({ displayName: "X", displayCurrency: "JPY" });
	expect((await repo.profile.get())?.displayCurrency).toBe("JPY");
	await repo.profile.save({ displayName: "Y" });
	expect((await repo.profile.get())?.displayCurrency).toBe("USD");
});
```

(Match the actual repo-construction + profile-API names used elsewhere in `idb-repo.test.ts` — read a nearby profile test and mirror it exactly; the names above are illustrative.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/store/userland/backup.test.ts src/store/userland/idb-repo.test.ts`
Expected: FAIL — `displayCurrency` not on `Profile` / not persisted.

- [ ] **Step 3: Implement across the layer**

3a. `src/store/userland/types.ts` — in `Profile`, after the `displayLanguage` line:

```ts
	displayCurrency: string; // ISO 4217; portfolio/display currency; always present (default "USD")
```

and in `ProfilePatch`'s `Pick`, add `"displayCurrency"`:

```ts
export type ProfilePatch = Partial<
	Pick<
		Profile,
		| "displayName"
		| "bio"
		| "avatarPreset"
		| "favoriteSetId"
		| "displayLanguage"
		| "displayCurrency"
	>
>;
```

3b. `src/store/userland/idb-repo.ts` — beside the `displayLanguage: patch.displayLanguage ?? "en"` line (~224), add:

```ts
							displayCurrency: patch.displayCurrency ?? "USD",
```

(match the surrounding object's exact indentation/context — it's in the profile save/merge).

3c. `src/store/userland/supabase-repo.ts` — the profile `save()` merge builds a `Profile` object at two branches. In the existing-profile branch (~342, beside `displayLanguage: patch.displayLanguage ?? existingProfile.displayLanguage`) add:

```ts
							displayCurrency:
								patch.displayCurrency ?? existingProfile.displayCurrency,
```

In the new-profile branch (~353, beside `displayLanguage: patch.displayLanguage ?? "en"`) add:

```ts
						displayCurrency: patch.displayCurrency ?? "USD",
```

3d. `src/store/userland/supabase-row.ts` — the DB row ↔ domain mappers. Three edits mirroring `display_language`:
- `ProfileRow` interface (after `display_language: string;` ~line 72):
  ```ts
  	display_currency: string; // ISO 4217 display/portfolio currency (default "USD")
  ```
- `profileToRow` (after `display_language: profile.displayLanguage,` ~line 202):
  ```ts
  		display_currency: profile.displayCurrency,
  ```
- `rowToProfile` (after the `displayLanguage:` backfill ~line 218-219):
  ```ts
  		displayCurrency:
  			typeof row.display_currency === "string" ? row.display_currency : "USD",
  ```

3e. `src/store/userland/backup.ts` — beside the `displayLanguage` backfill (~60-63):

```ts
		// Additive field (no schema bump): snapshots saved before displayCurrency
		// existed default to USD.
		displayCurrency:
			typeof raw.displayCurrency === "string" ? raw.displayCurrency : "USD",
```

3f. Create `supabase/migrations/20260703090000_profile_display_currency.sql` (mirror `20260629000000_profile_display_language.sql` exactly — same `alter table public.profiles add column ... not null default ...` shape, no `if not exists`):

```sql
-- PR3a — multi-currency: per-user display/portfolio currency.
-- Additive column on profiles; ISO 4217, defaults to USD so existing rows read
-- back as 'USD' (matches rowToProfile's backfill in supabase-row.ts).
alter table public.profiles
  add column display_currency text not null default 'USD';
```

- [ ] **Step 4: Run tests + the supabase/sync suite**

Run: `bun test src/store/userland/backup.test.ts src/store/userland/idb-repo.test.ts src/store/userland/supabase-repo.test.ts src/store/userland/sync/`
Expected: PASS. If the supabase/sync integration tests fail because the local DB lacks the column, apply it to the local stack the same way the `printing` column was applied:
`docker exec supabase_db_cloud-vault psql -U postgres -d postgres -c "alter table public.profiles add column if not exists display_currency text not null default 'USD';"`
then re-run. (Prod is 100% IndexedDB — this local apply is only for the sync tests; note it in the report.)

- [ ] **Step 5: Lint + commit**

```bash
bunx biome check --write --config-path=. src/store/userland/types.ts src/store/userland/idb-repo.ts src/store/userland/supabase-repo.ts src/store/userland/supabase-row.ts src/store/userland/backup.ts
git add src/store/userland/types.ts src/store/userland/idb-repo.ts src/store/userland/supabase-repo.ts src/store/userland/supabase-row.ts src/store/userland/backup.ts supabase/migrations/20260703090000_profile_display_currency.sql src/store/userland/backup.test.ts src/store/userland/idb-repo.test.ts
git commit -m "feat(pricing): Profile.displayCurrency across persistence layer"
```

---

### Task 4: Display-currency Select in the profile form

**Files:**
- Modify: `src/components/profile/profile-form-dialog.tsx`
- Test: extend the profile-form-dialog test if one exists; else add a focused one.

**Interfaces:**
- Consumes: `SUPPORTED_CURRENCIES`, `CURRENCY_LABELS`, `toSupportedCurrency`, `defaultCurrencyForLocale` (Task 1); `updateProfile` (already imported).
- Produces: the dialog reads/writes `Profile.displayCurrency`; a new-profile default seeds from the browser locale.

- [ ] **Step 1: Add the field to schema, defaults, and submit**

In `src/components/profile/profile-form-dialog.tsx`:
- import from `@/lib/currencies`: `CURRENCY_LABELS`, `SUPPORTED_CURRENCIES`, `defaultCurrencyForLocale`, `toSupportedCurrency`.
- `profileFormSchema`: add `displayCurrency: z.string()`.
- `defaultValues`: add
  ```ts
  displayCurrency: profile?.displayCurrency
  	? toSupportedCurrency(profile.displayCurrency)
  	: defaultCurrencyForLocale(),
  ```
- `onSubmit` `updateProfile({...})`: add `displayCurrency: value.displayCurrency,`.

- [ ] **Step 2: Add the Select control**

After the `displayLanguage` `form.Field` block, add a sibling (mirror it exactly):

```tsx
						{/* Portfolio display currency */}
						<form.Field
							name="displayCurrency"
							// biome-ignore lint/correctness/noChildrenProp: TanStack Form requires render-prop
							children={(field) => (
								<Field>
									<FieldLabel htmlFor={field.name}>Currency</FieldLabel>
									<Select
										value={field.state.value}
										onValueChange={(v) => field.handleChange(v)}
									>
										<SelectTrigger id={field.name}>
											<SelectValue placeholder="USD" />
										</SelectTrigger>
										<SelectContent>
											{SUPPORTED_CURRENCIES.map((c) => (
												<SelectItem key={c} value={c}>
													{CURRENCY_LABELS[c]}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</Field>
							)}
						/>
```

- [ ] **Step 3: Test**

If a `profile-form-dialog.test.tsx` exists, extend it to assert the Currency select renders + a chosen value flows to `updateProfile` (mock/spy `updateProfile` per the file's existing convention). If none exists, add a minimal test rendering the dialog (seed a fake userland repo per the repo's dialog-test pattern) that asserts the "Currency" label + a `USD`/`JPY` option is present. Keep it network-free.

Run: `bun test src/components/profile/`
Expected: PASS.

- [ ] **Step 4: Lint + commit**

```bash
bunx biome check --write --config-path=. src/components/profile/profile-form-dialog.tsx
git add src/components/profile/
git commit -m "feat(pricing): display-currency picker in the profile form"
```

---

### Task 5: Per-stack currency picker + exponent-aware stack/CSV mapping

**Files:**
- Modify: `src/components/collection/stack-form-schema.ts` (add `currency`)
- Modify: `src/components/collection/stack-form-mapping.ts` (`itemToForm`/`formToPatch`/`formFieldToPatch` — include currency + exponent-aware pricePaid)
- Modify: `src/components/collection/stack-edit-form.tsx` (currency Select after Price paid; default from profile)
- Modify: `src/store/userland/csv.ts` (pass currency to the money boundary)
- Test: extend `src/components/collection/stack-form-mapping.test.ts` (or the nearest existing mapping test) + `src/store/userland/csv.test.ts`

**Interfaces:**
- Consumes: `SUPPORTED_CURRENCIES`, `CURRENCY_LABELS`, `toSupportedCurrency` (Task 1); exponent-aware `inputToMinorUnits`/`minorUnitsToInput` (Task 2).
- Produces: the stack form exposes `currency`; `formToPatch` returns the FULL `EditableStackFields` (no longer omits `currency`); pricePaid parses/renders with the stack's currency exponent; CSV round-trips currency-correctly.

- [ ] **Step 1: Write the failing tests**

Extend the stack-form-mapping test (read the existing file for its import/helper style; illustrative):

```ts
test("itemToForm carries currency and renders pricePaid at its exponent", () => {
	const stack = makeStack({ pricePaid: 350, currency: "JPY" });
	const form = itemToForm(stack);
	expect(form.currency).toBe("JPY");
	expect(form.pricePaid).toBe("350"); // 0-decimal, not "3.5"
});

test("formToPatch includes currency and parses pricePaid at its exponent", () => {
	const patch = formToPatch({
		...emptyFormValues,
		pricePaid: "350",
		currency: "JPY",
		quantity: "1",
		acquiredAt: "2026-07-03",
	});
	expect(patch.currency).toBe("JPY");
	expect(patch.pricePaid).toBe(350); // not 35000
});
```

Extend `csv.test.ts` with a JPY round-trip: exporting a `{pricePaid: 350, currency: "JPY"}` stack yields `price_paid_unit` "350", and importing it back yields `pricePaid` 350 (not 35000). Match the file's existing export/import test helpers.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/components/collection/stack-form-mapping.test.ts src/store/userland/csv.test.ts`
Expected: FAIL — `currency` missing from form values; pricePaid scaled wrong for JPY.

- [ ] **Step 3: Implement**

3a. `stack-form-schema.ts` — add to `stackFormSchema` (after `pricePaid`):

```ts
	currency: z.string(),
```

3b. `stack-form-mapping.ts`:
- `itemToForm`: add `currency: i.currency ?? "USD",` and change the pricePaid line to `pricePaid: minorUnitsToInput(i.pricePaid, i.currency ?? "USD"),`.
- `formToPatch`: change the return type from `Omit<EditableStackFields, "currency">` to `EditableStackFields`; add `currency: values.currency || "USD",`; change pricePaid to `pricePaid: inputToMinorUnits(values.pricePaid, values.currency || "USD"),`. Delete the "Omits `currency`" comment.
- `formFieldToPatch`: add a `case "currency": return { currency: value || "USD" };`. For the `pricePaid` case, accept an optional `ctx.currency` and use it: `return { pricePaid: inputToMinorUnits(value, ctx?.currency ?? "USD") };` (add `currency?: string` to the `ctx` param type).

3c. `stack-edit-form.tsx`:
- import from `@/lib/currencies`: `CURRENCY_LABELS`, `SUPPORTED_CURRENCIES`, `toSupportedCurrency`.
- default form value for `currency`: seed from the profile's display currency. Read it via the userland store (mirror how the form reads other store data) — `const profileCurrency = useUserland((s) => s.profile?.displayCurrency) ?? "USD";` and set the form default `currency: itemToForm(...).currency` for edit, or `toSupportedCurrency(profileCurrency)` for a new stack. (Match the form's existing new-vs-edit default pattern; the default-values object around line 357 sets `pricePaid: ""` — add `currency: <seed>` there.)
- add a currency Select `form.Field` immediately after the Price-paid field (mirror the Language select block):

```tsx
				{/* Currency — ISO 4217 select for the price paid */}
				<form.Field
					name="currency"
					// biome-ignore lint/correctness/noChildrenProp: TanStack Form requires render-prop
					children={(field) => (
						<Field>
							<FieldLabel htmlFor={field.name}>Currency</FieldLabel>
							<Select
								value={field.state.value}
								onValueChange={(v) => field.handleChange(v)}
							>
								<SelectTrigger id={field.name}>
									<SelectValue placeholder="USD" />
								</SelectTrigger>
								<SelectContent>
									{SUPPORTED_CURRENCIES.map((c) => (
										<SelectItem key={c} value={c}>
											{CURRENCY_LABELS[c]}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</Field>
					)}
				/>
```

3d. `csv.ts`:
- export (~61): `price_paid_unit: minorUnitsToInput(s.pricePaid, s.currency),`.
- import (~281): `pricePaid: inputToMinorUnits(row.price_paid_unit ?? "", row.currency?.trim() || "USD"),` (the `currency` field is already read on the next line — reuse the same source).

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/components/collection/stack-form-mapping.test.ts src/store/userland/csv.test.ts src/components/collection/`
Expected: PASS.

- [ ] **Step 5: Lint + commit**

```bash
bunx biome check --write --config-path=. src/components/collection/stack-form-schema.ts src/components/collection/stack-form-mapping.ts src/components/collection/stack-edit-form.tsx src/store/userland/csv.ts
git add src/components/collection/stack-form-schema.ts src/components/collection/stack-form-mapping.ts src/components/collection/stack-edit-form.tsx src/store/userland/csv.ts src/components/collection/stack-form-mapping.test.ts src/store/userland/csv.test.ts
git commit -m "feat(pricing): per-stack currency picker + exponent-aware stack/CSV mapping"
```

---

### Task 6: Final verification gate

**Files:** none (verification only)

- [ ] **Step 1: Regenerate the route tree, then run all gates**

```bash
nohup bunx vite dev --port 6301 >/tmp/pr3a-routegen.log 2>&1 & VP=$!; sleep 8; kill $VP 2>/dev/null
```

Then run in parallel (background the slow ones):
- `bunx tsc -b`
- `bun test`
- `bunx biome check --config-path=. src/lib/currencies.ts src/store/userland/money.ts src/store/userland/types.ts src/store/userland/idb-repo.ts src/store/userland/supabase-repo.ts src/store/userland/supabase-row.ts src/store/userland/backup.ts src/store/userland/csv.ts src/components/profile/profile-form-dialog.tsx src/components/collection/`

Expected: tsc 0 errors; full suite green (baseline 1490 + the new tests); biome clean. After the run, `rm -f src/routeTree.gen.ts` (gitignored artifact).

- [ ] **Step 2: Fix anything red, re-run, commit fixes.** No known-red advance.

- [ ] **Step 3: Confirm no lockfile/manifest drift**

Run: `git status --short`
Expected: clean (no `bun.lock`/`package.json` change — no new deps).

## Self-Review Notes (plan author)

- **Spec coverage:** §5 Currency → money.ts exponents (T2) + currencies.ts (T1) + displayCurrency (T3-T4) + Stack.currency picker (T5). Deferred to PR 3b (correctly out of scope): FX conversion, valuation/market value, P&L, hide-value toggle, per-surface value rendering, `syncPrices` wiring.
- **Backward compatibility:** the money-fn currency param defaults to "USD" (exponent 2), so every existing USD call site is byte-for-byte unchanged; only JPY-class currencies scale differently. `displayCurrency` is additive (no snapshot bump), backfilled to "USD".
- **Prod safety:** the supabase migration + supabase-repo mapping are dormant (cloud disabled in prod → 100% IndexedDB, which stores the field natively). The local-apply command is only for the sync integration tests.
- **Type consistency:** `exponentFor`/`symbolFor`/`toSupportedCurrency`/`SupportedCurrency`/`SUPPORTED_CURRENCIES`/`CURRENCY_LABELS` names are used identically across T1-T5.
