# Single-pill toggle redesign — design

**Date:** 2026-06-06
**Status:** Approved (interactive brainstorm)
**Branch:** `redesign/pill-toggle`

## Problem

`MatchModeToggle` (Fuzzy|Exact) and `ViewModeToggle` (Grid|Timeline) are both
two-button segmented groups built on a generic `ToggleGroup`/`ToggleField`/
`ToggleButton` stack (`toggle-group.tsx`). Both filters are fundamentally
binary, so the group abstraction is heavier than needed. Replace each with a
single on/off **pill**: pressed/filled = `true`/on, ghost = `false`/off.

## Decisions (from brainstorm)

1. **Scope:** both filters become single pills.
2. **Content:** label-only (no icons). Fixed text names the ON state; fill
   communicates state. ViewMode discoverability handled via a `title` tooltip.
3. **Component:** new `PillToggle` that **reuses** the existing `ToggleButton`
   primitive. Delete the now-unused `ToggleGroup`, `ToggleField`, and the
   `ToggleOption`/`ToggleGroupProps` types.

## Component design

Split presentational vs stateful:

- **`ToggleButton`** (kept, moved into `pill-toggle.tsx`) — presentational chip.
  Receives a11y attrs (`aria-pressed`, `disabled`, `title`) from the caller.
- **`PillToggle`** — stateful binding only.

```tsx
interface PillToggleProps {
  value: boolean;
  onChange: (next: boolean) => void;
  /** Pill text; names the ON state ("Exact", "Timeline"). */
  label: string;
  /** Tooltip + fuller a11y context when the label alone is ambiguous. */
  title?: string;
  disabled?: boolean;
}

export function PillToggle({ value, onChange, label, title, disabled = false }: PillToggleProps) {
  return (
    <ToggleButton aria-pressed={value} disabled={disabled} title={title} onClick={() => onChange(!value)}>
      {label}
    </ToggleButton>
  );
}
```

### Accessibility

Toggle button with `aria-pressed` (reuses ToggleButton's pressed-keyed styling;
valid WAI-ARIA for a binary on/off). Not `role="switch"` — chosen for reuse and
consistency with the prior group buttons.

### Visual

The group got its border/glass *track* from the `<fieldset>`. A lone pill has no
track, so resting chrome is baked into `ToggleButton` (now standalone-only):

- **OFF:** `bg-(--glass) border-border text-(--ink-muted) hover:text-(--ink)`
- **ON:** `bg-primary border-transparent text-white font-semibold`
- transition includes `border-color`; `disabled:opacity-40 disabled:cursor-not-allowed` retained.

Disabled = plain `disabled` attr on the single button (no fieldset cascade).

## Wrappers (public APIs unchanged → zero call-site changes)

`Pick<ToggleGroupProps>` derivation dies with `ToggleGroup`; wrappers return to
explicit interfaces.

```tsx
// match-mode-toggle.tsx — value IS the boolean (exact), maps straight through
export function MatchModeToggle({ value, onChange, disabled = false }: MatchModeToggleProps) {
  return <PillToggle value={value} onChange={onChange}
    label="Exact" title="Exact name match (off = fuzzy)" disabled={disabled} />;
}

// view-mode-toggle.tsx — string union <-> boolean mapping (the only new logic)
export function ViewModeToggle({ value, onChange, disabled }: ViewModeToggleProps) {
  return <PillToggle
    value={value === "timeline"}
    onChange={(on) => onChange(on ? "timeline" : "grid")}
    label="Timeline" title="Toggle timeline view (off = grid)" disabled={disabled} />;
}
```

## Tests

- **Rewrite** `match-mode-toggle.test.tsx` — was asserting two buttons; now one
  `Exact` pill: `value=false`→`aria-pressed="false"`, `value=true`→`"true"`,
  click-off→`onChange(true)`, click-on→`onChange(false)`.
- **New** `pill-toggle.test.tsx` — primitive: label renders, `aria-pressed`
  tracks `value`, click→`onChange(!value)`, `disabled` blocks the click handler.
- **New** `view-mode-toggle.test.tsx` — covers the string↔boolean mapping:
  `"grid"`→unpressed, `"timeline"`→pressed, click flips `"grid"`⇄`"timeline"`.

## File deltas

| Action | File |
|---|---|
| new | `src/components/islands/pill-toggle.tsx` (`ToggleButton` + `PillToggle`) |
| delete | `src/components/islands/toggle-group.tsx` |
| edit | `src/components/islands/match-mode-toggle.tsx` |
| edit | `src/components/islands/view-mode-toggle.tsx` |
| rewrite | `src/components/islands/match-mode-toggle.test.tsx` |
| new | `src/components/islands/pill-toggle.test.tsx` |
| new | `src/components/islands/view-mode-toggle.test.tsx` |
| unchanged | `search-controls.tsx`, `search.tsx`, `pokemon/$name.tsx` |

## Verification

- `bunx tsc -b`, `bunx biome check --config-path=. <files>`
- `bun test` on the three toggle test files + `search-controls.test.tsx`
- Browser (`/search`): pill on/off fill, disabled state when query empty, click
  actually flips grid⇄timeline.
