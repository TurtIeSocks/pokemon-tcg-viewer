# variants_detailed — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a collector record the exact physical printing of a card they own (e.g. "1st Edition · Shadowless · Holo"), sourced from TCGdex `variants_detailed`, stored as a portable structured identity on the stack.

**Architecture:** `variants_detailed` rides the live card detail (`FocusCardData.variantsDetailed`), never the corpus. A new nullable `Stack.printing` holds the structured identity; the existing `Stack.variant` keeps the human label snapshot. A printing picker appears in the stack edit form only when the card has detailed variants; otherwise today's coarse control is unchanged.

**Tech Stack:** TypeScript, React 19, TanStack Form (render-prop `children`), Zod, Zustand, idb-keyval, bun:test + @testing-library/react (happy-dom, **no jest-dom** — assert via `getByText`/`container` queries).

## Global Constraints

- Optional persisted fields are **`null`, never `undefined`** (IDB/JSON/SQL agree).
- Userland record ids are UUIDv7; money is cents; every entity carries `updatedAt` + `deletedAt`.
- `normalizeStack` MUST stay **idempotent** (runs on every read; only fills absent).
- No em-dashes in user-facing copy (the label separator is the middot `·`, fine).
- TCGdex field names differ from the app's (see `card-mappers.ts`); translate at the mapper.
- Tests must not hit the network.
- Lint via `bunx biome check --config-path=. <files>`; typecheck `bunx tsc -b`.

---

### Task 1: `CardVariant` type + `variantLabel` formatter

**Files:**
- Create: `src/lib/card-variants.ts`
- Test: `src/lib/card-variants.test.ts`

**Interfaces:**
- Produces:
  - `interface CardVariant { variantId: string; type: string; subtype: string | null; size: string | null; stamp: string[] | null }`
  - `type CardPrinting = CardVariant`
  - `function variantLabel(v: CardVariant): string`

- [ ] **Step 1: Write the failing test** — `src/lib/card-variants.test.ts`

```ts
import { expect, test } from "bun:test";
import { type CardVariant, variantLabel } from "./card-variants";

const v = (p: Partial<CardVariant>): CardVariant => ({
	variantId: "x",
	type: "holo",
	subtype: null,
	size: null,
	stamp: null,
	...p,
});

test("variantLabel composes stamp · subtype · type", () => {
	expect(variantLabel(v({ subtype: "shadowless", stamp: ["1st-edition"] }))).toBe(
		"1st Edition · Shadowless · Holo",
	);
});

test("variantLabel of a bare printing is just the humanized type", () => {
	expect(variantLabel(v({ type: "normal" }))).toBe("Normal");
});

test("variantLabel appends non-standard size, hides standard", () => {
	expect(variantLabel(v({ size: "standard" }))).toBe("Holo");
	expect(variantLabel(v({ subtype: "unlimited", size: "jumbo" }))).toBe(
		"Unlimited · Holo · Jumbo",
	);
});

test("variantLabel humanizes multi-token subtypes", () => {
	expect(variantLabel(v({ subtype: "1999-2000-copyright" }))).toBe(
		"1999 2000 Copyright · Holo",
	);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/card-variants.test.ts`
Expected: FAIL — `Cannot find module './card-variants'`.

- [ ] **Step 3: Write minimal implementation** — `src/lib/card-variants.ts`

```ts
/**
 * One physical printing of a card, mirrored from TCGdex `variants_detailed`.
 * `variantId` is a TCGdex-internal back-reference only (NOT a price key); the
 * authoritative, portable identity is `type` / `subtype` / `stamp` / `size`.
 */
export interface CardVariant {
	variantId: string;
	type: string;
	subtype: string | null;
	size: string | null;
	stamp: string[] | null;
}

/** The structured printing identity stored on a stack (same shape as CardVariant). */
export type CardPrinting = CardVariant;

/** Humanize a kebab token: "1st-edition" -> "1st Edition", "shadowless" -> "Shadowless". */
function humanize(token: string): string {
	return token
		.split("-")
		.map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
		.join(" ");
}

/**
 * Human label for a printing: stamp(s) · subtype · type, plus a non-"standard"
 * size. e.g. { type: holo, subtype: shadowless, stamp: [1st-edition] } ->
 * "1st Edition · Shadowless · Holo".
 */
export function variantLabel(v: CardVariant): string {
	const parts: string[] = [];
	if (v.stamp?.length) parts.push(...v.stamp.map(humanize));
	if (v.subtype) parts.push(humanize(v.subtype));
	parts.push(humanize(v.type));
	if (v.size && v.size !== "standard") parts.push(humanize(v.size));
	return parts.join(" · ");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/lib/card-variants.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Lint + commit**

```bash
bunx biome check --config-path=. --write src/lib/card-variants.ts src/lib/card-variants.test.ts
git add src/lib/card-variants.ts src/lib/card-variants.test.ts
git commit -m "feat(variants): CardVariant type + variantLabel formatter"
```

---

### Task 2: Map `variants_detailed` onto `FocusCardData`

**Files:**
- Modify: `src/server/card-mappers.ts` (`TcgdexFocusCard`, `FocusCardData`, `mapTcgdexFocusCard`)
- Test: `src/server/card-mappers.test.ts` (add cases)

**Interfaces:**
- Consumes: `CardVariant` from `../lib/card-variants` (Task 1).
- Produces: `FocusCardData.variantsDetailed?: CardVariant[]`.

- [ ] **Step 1: Write the failing test** — add to `src/server/card-mappers.test.ts`

```ts
import { variantLabel } from "../lib/card-variants";

test("mapTcgdexFocusCard maps variants_detailed, null-filling absent optionals", () => {
	const out = mapTcgdexFocusCard({
		id: "base1-4",
		localId: "4",
		name: "Charizard",
		category: "Pokemon",
		image: "https://assets.tcgdex.net/en/base/base1/4",
		set: { id: "base1", name: "Base" },
		variants_detailed: [
			{ type: "holo", subtype: "unlimited", size: "standard", variantId: "a" },
			{
				type: "holo",
				subtype: "shadowless",
				size: "standard",
				stamp: ["1st-edition"],
				variantId: "b",
			},
		],
	} as TcgdexFocusCard);

	expect(out.variantsDetailed).toEqual([
		{ variantId: "a", type: "holo", subtype: "unlimited", size: "standard", stamp: null },
		{ variantId: "b", type: "holo", subtype: "shadowless", size: "standard", stamp: ["1st-edition"] },
	]);
	expect(variantLabel(out.variantsDetailed![1])).toBe("1st Edition · Shadowless · Holo");
});

test("mapTcgdexFocusCard leaves variantsDetailed undefined when absent", () => {
	const out = mapTcgdexFocusCard({
		id: "sm1-1",
		localId: "1",
		name: "Rowlet",
		category: "Pokemon",
		set: { id: "sm1", name: "Sun & Moon" },
	} as TcgdexFocusCard);
	expect(out.variantsDetailed).toBeUndefined();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test src/server/card-mappers.test.ts`
Expected: FAIL — `out.variantsDetailed` is `undefined` in the first test (property not mapped yet).

- [ ] **Step 3: Implement**

In `src/server/card-mappers.ts`:

Add the import at the top:

```ts
import type { CardVariant } from "../lib/card-variants";
```

Add to `interface FocusCardData` (after `nationalPokedexNumbers`):

```ts
	/** Exact physical printings from TCGdex variants_detailed; undefined when absent. */
	variantsDetailed?: CardVariant[];
```

Add to `interface TcgdexFocusCard` (after `dexId`):

```ts
	// Rich per-printing list: { type, subtype?, size?, stamp?, variantId }.
	variants_detailed?: Array<{
		type: string;
		subtype?: string;
		size?: string;
		stamp?: string[];
		variantId: string;
	}>;
```

In `mapTcgdexFocusCard`'s returned object (add a property, e.g. right after `nationalPokedexNumbers: card.dexId,`):

```ts
		variantsDetailed: card.variants_detailed?.map((v) => ({
			variantId: v.variantId,
			type: v.type,
			subtype: v.subtype ?? null,
			size: v.size ?? null,
			stamp: v.stamp ?? null,
		})),
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun test src/server/card-mappers.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint + commit**

```bash
bunx biome check --config-path=. --write src/server/card-mappers.ts src/server/card-mappers.test.ts
git add src/server/card-mappers.ts src/server/card-mappers.test.ts
git commit -m "feat(variants): map TCGdex variants_detailed onto FocusCardData"
```

---

### Task 3: Add `Stack.printing` + repo null-fill

**Files:**
- Modify: `src/store/userland/types.ts` (`Stack`, `EditableStackFields`)
- Modify: `src/store/userland/idb-repo.ts` (`fillStack`, `normalizeStack`)
- Test: `src/store/userland/idb-repo.test.ts` (add cases; if absent, create it)

**Interfaces:**
- Consumes: `CardPrinting` from `../../lib/card-variants` (Task 1).
- Produces: `Stack.printing: CardPrinting | null`; `printing` in `EditableStackFields`.

- [ ] **Step 1: Write the failing test** — add to `src/store/userland/idb-repo.test.ts`

```ts
import { expect, test } from "bun:test";
import { normalizeStack } from "./idb-repo";
import type { Stack } from "./types";

const bare = (extra: Partial<Stack> = {}): Stack =>
	({
		id: "s1",
		cardId: "base1-4",
		quantity: 1,
		acquiredAt: 1,
		createdAt: 1,
		updatedAt: 1,
		deletedAt: null,
		label: null,
		pricePaid: null,
		currency: "USD",
		language: "en",
		variant: null,
		notes: null,
		condition: null,
		grading: null,
		source: null,
		storageLocation: null,
		isPrimary: false,
		...extra,
	}) as Stack;

test("normalizeStack null-fills a legacy stack missing printing", () => {
	const legacy = bare();
	// @ts-expect-error simulate a pre-printing row
	legacy.printing = undefined;
	expect(normalizeStack(legacy).printing).toBeNull();
});

test("normalizeStack preserves a present printing and is idempotent", () => {
	const printing = {
		variantId: "b",
		type: "holo",
		subtype: "shadowless",
		size: "standard",
		stamp: ["1st-edition"],
	};
	const once = normalizeStack(bare({ printing }));
	expect(once.printing).toEqual(printing);
	expect(normalizeStack(once)).toEqual(once); // idempotent
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test src/store/userland/idb-repo.test.ts`
Expected: FAIL — `normalizeStack(...).printing` is `undefined` (field not filled; also a TS error that `Stack` has no `printing`).

- [ ] **Step 3: Implement**

In `src/store/userland/types.ts`:

Add the import at the top:

```ts
import type { CardPrinting } from "../../lib/card-variants";
```

Add to `interface Stack` (after the `variant` line):

```ts
	printing: CardPrinting | null; // exact TCGdex printing; null = coarse/legacy/unknown
```

Add `"printing"` to the `EditableStackFields` `Pick<Stack, ...>` union (after `| "variant"`).

In `src/store/userland/idb-repo.ts`:

In `fillStack`, after the `variant: input.variant ?? null,` line:

```ts
		printing: input.printing ?? null,
```

In `normalizeStack`, after the `variant: raw.variant ?? null,` line:

```ts
		printing: raw.printing ?? null,
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun test src/store/userland/idb-repo.test.ts`
Expected: PASS.

- [ ] **Step 5: Full userland suite + lint + commit**

Run: `bun test src/store/userland/`
Expected: PASS (no regressions).

```bash
bunx biome check --config-path=. --write src/store/userland/types.ts src/store/userland/idb-repo.ts src/store/userland/idb-repo.test.ts
git add src/store/userland/types.ts src/store/userland/idb-repo.ts src/store/userland/idb-repo.test.ts
git commit -m "feat(variants): add nullable Stack.printing, backfilled idempotently"
```

---

### Task 4: Form schema + mapping resolve printing

**Files:**
- Modify: `src/components/collection/stack-form-schema.ts` (`stackFormSchema`)
- Modify: `src/components/collection/stack-form-mapping.ts` (`itemToForm`, `formToPatch`)
- Test: `src/components/collection/stack-form-mapping.test.ts` (add cases; if absent, create it)

**Interfaces:**
- Consumes: `CardVariant` + `variantLabel` from `../../lib/card-variants`; `formToPatch` gains an optional `variantsDetailed?: CardVariant[]` second arg.
- Produces: `StackFormValues` gains `variantId: string`. `formToPatch(values, variantsDetailed?)` resolves `values.variantId` → `{ printing, variant }`.

- [ ] **Step 1: Write the failing test** — add to `src/components/collection/stack-form-mapping.test.ts`

```ts
import { expect, test } from "bun:test";
import type { CardVariant } from "../../lib/card-variants";
import { formToPatch, itemToForm } from "./stack-form-mapping";
import type { Stack } from "../../store/userland/types";

const VARIANTS: CardVariant[] = [
	{ variantId: "a", type: "holo", subtype: "unlimited", size: "standard", stamp: null },
	{ variantId: "b", type: "holo", subtype: "shadowless", size: "standard", stamp: ["1st-edition"] },
];

const baseValues = {
	label: "", quantity: "1", acquiredAt: "2026-01-01", pricePaid: "", language: "en",
	variant: "", variantId: "", notes: "", source: "", storageLocation: "",
	state: "raw" as const, condition: "" as const, gradingCompany: "" as const, grade: "", gradingCert: "",
};

test("formToPatch resolves variantId to printing + label", () => {
	const p = formToPatch({ ...baseValues, variantId: "b" }, VARIANTS);
	expect(p.printing).toEqual(VARIANTS[1]);
	expect(p.variant).toBe("1st Edition · Shadowless · Holo");
});

test("formToPatch with empty variantId clears printing, keeps coarse variant", () => {
	const p = formToPatch({ ...baseValues, variant: "holo" });
	expect(p.printing).toBeNull();
	expect(p.variant).toBe("holo");
});

test("itemToForm seeds variantId from the stack's printing", () => {
	const item = { variant: "1st Edition · Shadowless · Holo", printing: VARIANTS[1] } as Stack;
	expect(itemToForm(item).variantId).toBe("b");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test src/components/collection/stack-form-mapping.test.ts`
Expected: FAIL — `formToPatch` ignores `variantsDetailed`/`printing`; `itemToForm(...).variantId` is `undefined`.

- [ ] **Step 3: Implement**

In `src/components/collection/stack-form-schema.ts`, add `variantId` to `stackFormSchema` (after `variant: z.string(),`):

```ts
	variantId: z.string(),
```

In `src/components/collection/stack-form-mapping.ts`:

Add imports at the top:

```ts
import { type CardVariant, variantLabel } from "../../lib/card-variants";
```

In `itemToForm`, add after the `variant:` line:

```ts
		variantId: i.printing?.variantId ?? "",
```

Change `formToPatch` to accept the detailed list and resolve it. Replace the current signature + `variant:` line:

```ts
export function formToPatch(
	values: StackFormValues,
	variantsDetailed?: CardVariant[],
): Omit<EditableStackFields, "currency"> {
	// A picked detailed printing wins: it sets both the structured identity and
	// the display label. Otherwise fall back to the coarse free-text variant.
	const chosen = values.variantId
		? variantsDetailed?.find((v) => v.variantId === values.variantId)
		: undefined;
	return {
		label: values.label.trim() === "" ? null : values.label.trim(),
		// ... unchanged fields ...
		variant: chosen
			? variantLabel(chosen)
			: values.variant === ""
				? null
				: values.variant,
		printing: chosen ?? null,
		// ... unchanged fields ...
	};
}
```

(Keep every other line of the original `formToPatch` object exactly as-is; only the signature, the `variant:` line, and the new `printing:` line change. Add the `chosen` const before the `return`.)

- [ ] **Step 4: Run to verify it passes**

Run: `bun test src/components/collection/stack-form-mapping.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + lint + commit**

Run: `bunx tsc -b`  (expect: no errors — the `StackEditForm` call to `formToPatch(value)` still compiles because `variantsDetailed` is optional; Task 5 passes it.)

```bash
bunx biome check --config-path=. --write src/components/collection/stack-form-schema.ts src/components/collection/stack-form-mapping.ts src/components/collection/stack-form-mapping.test.ts
git add src/components/collection/stack-form-schema.ts src/components/collection/stack-form-mapping.ts src/components/collection/stack-form-mapping.test.ts
git commit -m "feat(variants): resolve printing from variantId in the stack form mapping"
```

---

### Task 5: Printing picker in StackEditForm + wire card-cockpit → StackManager

**Files:**
- Modify: `src/components/collection/stack-edit-form.tsx` (props, defaults, picker, submit)
- Modify: `src/components/collection/stack-manager.tsx` (forward `variantsDetailed`)
- Modify: `src/components/card/card-cockpit.tsx` (pass `card.variantsDetailed`)
- Test: `src/components/collection/stack-edit-form.test.tsx` (add case; if absent, create it)

**Interfaces:**
- Consumes: `FocusCardData.variantsDetailed` (Task 2); `formToPatch(values, variantsDetailed)` (Task 4); `variantLabel` (Task 1).
- Produces: rendered `<select>`/segmented printing control keyed by `variantId`.

- [ ] **Step 1: Write the failing test** — add to `src/components/collection/stack-edit-form.test.tsx` (the file already imports `render`/`screen` and has `beforeEach(setupUserlandTest)`; add only the `CardVariant` type import).

```ts
import type { CardVariant } from "../../lib/card-variants";

const VARIANTS: CardVariant[] = [
	{ variantId: "a", type: "holo", subtype: "unlimited", size: "standard", stamp: null },
	{ variantId: "b", type: "holo", subtype: "shadowless", size: "standard", stamp: ["1st-edition"] },
];

test("create form renders a printing option per detailed variant", () => {
	render(
		<StackEditForm
			mode="create"
			cardId="base1-4"
			variantsDetailed={VARIANTS}
			onSaved={() => {}}
			onCancel={() => {}}
		/>,
	);
	// The humanized labels are present as selectable options.
	screen.getByText("Unlimited · Holo");
	screen.getByText("1st Edition · Shadowless · Holo");
});
```

(If the segmented/select control renders options lazily, assert on the control's presence + option labels via `container.textContent` instead. Match whatever `SegmentedControl`/`Select` the file already uses for `variant`.)

- [ ] **Step 2: Run to verify it fails**

Run: `bun test src/components/collection/stack-edit-form.test.tsx`
Expected: FAIL — `variantsDetailed` is not a prop; labels absent.

- [ ] **Step 3: Implement**

In `src/components/collection/stack-edit-form.tsx`:

Add imports:

```ts
import { type CardVariant, variantLabel } from "../../lib/card-variants";
```

Add to `interface StackEditFormProps`:

```ts
	/** Exact printings from the live card detail; when present, drives the printing picker. */
	variantsDetailed?: CardVariant[];
```

Add `variantId: ""` to `BLANK_DEFAULTS`.

Add `variantsDetailed` to the destructured props of `StackEditForm({ ... })`.

In `useForm({ ... onSubmit })`, change the patch line:

```ts
			const patch = formToPatch(value, variantsDetailed);
```

Replace the existing variant control block. Where the file currently renders the coarse variant (the `{variants && variants.length > 0 && (` block), render the printing picker **instead** when detailed variants exist, else keep the coarse one:

```tsx
{variantsDetailed && variantsDetailed.length > 0 ? (
	<form.Field
		name="variantId"
		// biome-ignore lint/correctness/noChildrenProp: TanStack Form requires render-prop
		children={(field) => (
			<Field className="sm:col-span-2">
				<FieldLabel>Printing</FieldLabel>
				<SegmentedControl
					aria-label="Printing"
					value={field.state.value}
					onChange={(v) => field.handleChange(v)}
					options={[
						{ value: "", label: "Unspecified" },
						...variantsDetailed.map((v) => ({
							value: v.variantId,
							label: variantLabel(v),
						})),
					]}
				/>
			</Field>
		)}
	/>
) : (
	variants &&
	variants.length > 0 && (
		/* ...existing coarse variant <form.Field name="variant"> block, unchanged... */
	)
)}
```

(Keep the existing coarse block verbatim inside the `else`. `SegmentedControl`, `Field`, `FieldLabel` are already imported/defined in this file.)

In `src/components/collection/stack-manager.tsx`:

Add `variantsDetailed?: CardVariant[]` to `StackManagerProps` (import `CardVariant` from `../../lib/card-variants`), destructure it, and forward to the create-mode `<StackEditForm ... variantsDetailed={variantsDetailed} />`.

In `src/components/card/card-cockpit.tsx`, update the `StackManager` usage:

```tsx
<StackManager
	cardId={card.id}
	variants={variants}
	variantsDetailed={card.variantsDetailed}
/>
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun test src/components/collection/stack-edit-form.test.tsx`
Expected: PASS.

- [ ] **Step 5: Typecheck + lint + commit**

Run: `bunx tsc -b`  Expected: no errors.

```bash
bunx biome check --config-path=. --write src/components/collection/stack-edit-form.tsx src/components/collection/stack-manager.tsx src/components/card/card-cockpit.tsx src/components/collection/stack-edit-form.test.tsx
git add src/components/collection/stack-edit-form.tsx src/components/collection/stack-manager.tsx src/components/card/card-cockpit.tsx src/components/collection/stack-edit-form.test.tsx
git commit -m "feat(variants): printing picker in the stack edit form, wired from card detail"
```

---

### Task 6: "Printings" line on the card detail

**Files:**
- Modify: `src/components/card/card-info.tsx` (`CardMetaStrip`)
- Test: `src/components/card/card-info.test.tsx` (add case; if absent, create it)

**Interfaces:**
- Consumes: `FocusCardData.variantsDetailed` (Task 2); `variantLabel` (Task 1).

- [ ] **Step 1: Write the failing test** — add to `src/components/card/card-info.test.tsx` (the file already imports `render` from `@testing-library/react` and `makeFocusCard` from `../../test-utils`; reuse them, don't re-import).

```ts
test("CardInfo lists the printings when variantsDetailed is present", () => {
	const { container } = render(
		<CardInfo
			card={makeFocusCard({
				variantsDetailed: [
					{ variantId: "a", type: "holo", subtype: "unlimited", size: "standard", stamp: null },
					{ variantId: "b", type: "holo", subtype: "shadowless", size: "standard", stamp: ["1st-edition"] },
				],
			})}
		/>,
	);
	expect(container.textContent).toContain("Printings");
	expect(container.textContent).toContain("Unlimited · Holo");
	expect(container.textContent).toContain("1st Edition · Shadowless · Holo");
});

test("CardInfo omits the printings line when absent", () => {
	const { container } = render(<CardInfo card={makeFocusCard({})} />);
	expect(container.textContent).not.toContain("Printings");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test src/components/card/card-info.test.tsx`
Expected: FAIL — no "Printings" text rendered.

- [ ] **Step 3: Implement**

In `src/components/card/card-info.tsx`:

Add the import:

```ts
import { variantLabel } from "../../lib/card-variants";
```

In `CardMetaStrip`, add a printings item to the `items` list (after the existing pushes, before the `if (!items.length) return null;`):

```ts
	if (card.variantsDetailed?.length)
		items.push({
			label: "Printings",
			value: card.variantsDetailed.map(variantLabel).join(" · "),
		});
```

(The strip already renders `{label} {value}`; this reuses it. `card` is already the `CardMetaStrip` prop.)

- [ ] **Step 4: Run to verify it passes**

Run: `bun test src/components/card/card-info.test.tsx`
Expected: PASS.

- [ ] **Step 5: Full gate + lint + commit**

Run (parallel): `bunx tsc -b` ; `bun test src/lib/ src/server/ src/store/userland/ src/components/collection/ src/components/card/`
Expected: all PASS, tsc clean.

```bash
bunx biome check --config-path=. --write src/components/card/card-info.tsx src/components/card/card-info.test.tsx
git add src/components/card/card-info.tsx src/components/card/card-info.test.tsx
git commit -m "feat(variants): list known printings on the card detail"
```

---

## Verification (after all tasks)

- Live preview: open a vintage card (Base Set Charizard) detail → the **Details tab shows a "Printings" line**; the **Collection tab's add-stack form shows a Printing picker** with the 4 real printings. Pick "1st Edition · Shadowless · Holo", save → the stack row's auto-label reads that printing.
- Open a modern single-printing card → picker shows one option (+ Unspecified); a card with no `variants_detailed` falls back to the coarse Variant control unchanged.
- `bunx tsc -b` clean; full `bun test` green; `bunx biome check --config-path=.` clean.
