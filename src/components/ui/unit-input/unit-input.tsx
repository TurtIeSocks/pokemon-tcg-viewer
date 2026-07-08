"use client"

import * as React from "react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { KnownUnit, UnitStringMap } from "./unit-input.types"

export interface UnitInputProps<
  TUnit extends KnownUnit | (string & {}) = KnownUnit | (string & {}),
> {
  value: TUnit extends KnownUnit ? UnitStringMap[TUnit] | (string & {}) : string
  onChange: (
    next: TUnit extends KnownUnit ? UnitStringMap[TUnit] : string,
  ) => void
  unit: TUnit
  min?: number
  max?: number
  step?: number
  precision?: number
  dragSensitivity?: number
  prefix?: React.ReactNode
  suffix?: React.ReactNode
  disabled?: boolean
  "aria-label"?: string
  className?: string
}

function parseNumericResult(
  value: string,
  unit: string,
): { value: number; ok: boolean } {
  // Reject a wrong suffix: parseFloat("45px") would silently accept it for unit="deg".
  if (value !== "" && unit !== "" && !value.endsWith(unit)) {
    return { value: 0, ok: false }
  }
  const stripped = value.endsWith(unit) ? value.slice(0, -unit.length) : value
  const n = Number.parseFloat(stripped)
  if (Number.isNaN(n)) return { value: 0, ok: false }
  // Reject trailing garbage that parseFloat would otherwise tolerate.
  if (!/^-?\d+(\.\d+)?$/.test(stripped)) return { value: 0, ok: false }
  return { value: n, ok: true }
}

function clamp(n: number, min: number | undefined, max: number | undefined) {
  if (min !== undefined && n < min) return min
  if (max !== undefined && n > max) return max
  return n
}

export function UnitInput<TUnit extends KnownUnit | (string & {})>({
  value,
  onChange,
  unit,
  min,
  max,
  step = 1,
  precision = 0,
  dragSensitivity = 1,
  prefix,
  suffix,
  disabled,
  className,
  "aria-label": ariaLabel,
}: UnitInputProps<TUnit>) {
  const unitStr = String(unit)
  const warnedRef = React.useRef(false)
  const { value: parsedFromValue, ok: parseOk } = parseNumericResult(
    String(value),
    unitStr,
  )
  React.useEffect(() => {
    if (!parseOk && !warnedRef.current) {
      warnedRef.current = true
      console.warn(
        `[UnitInput] could not parse value "${String(value)}" for unit "${unitStr}". Falling back to 0.`,
      )
    }
  }, [parseOk, value, unitStr])
  const [rawDraft, setRawDraft] = React.useState<string | null>(null)
  const displayed = rawDraft ?? parsedFromValue.toFixed(precision)

  const commit = (raw: string) => {
    const parsed = Number.parseFloat(raw)
    const next = Number.isNaN(parsed)
      ? parsedFromValue
      : clamp(parsed, min, max)
    const rounded = Number(next.toFixed(precision))
    const formatted = `${rounded}${unitStr}`
    setRawDraft(null)
    if (formatted !== String(value)) {
      onChange(formatted as Parameters<typeof onChange>[0])
    }
  }

  const stepValue = (
    direction: 1 | -1,
    modifier: { shift: boolean; alt: boolean },
  ) => {
    const multiplier = modifier.shift ? 10 : modifier.alt ? 0.1 : 1
    const delta = step * multiplier * direction
    let base = parsedFromValue
    if (rawDraft !== null) {
      // Use the live draft as the step base, but only when it's a real number.
      // A bare `|| parsedFromValue` would discard a legit "0" (0 is falsy).
      const p = Number.parseFloat(rawDraft)
      base = Number.isNaN(p) ? parsedFromValue : p
    }
    commit(String(base + delta))
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return
    if (e.key === "Enter") {
      e.preventDefault()
      commit(e.currentTarget.value)
    } else if (e.key === "Escape") {
      e.preventDefault()
      setRawDraft(null)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      stepValue(1, { shift: e.shiftKey, alt: e.altKey })
    } else if (e.key === "ArrowDown") {
      e.preventDefault()
      stepValue(-1, { shift: e.shiftKey, alt: e.altKey })
    }
  }

  const scrubRef = React.useRef<{
    active: boolean
    anchor: number
    deltaPx: number
    lastShift: boolean
    lastAlt: boolean
    appliedShift: boolean
    appliedAlt: boolean
    hasCommitted: boolean
  }>({
    active: false,
    anchor: 0,
    deltaPx: 0,
    lastShift: false,
    lastAlt: false,
    appliedShift: false,
    appliedAlt: false,
    hasCommitted: false,
  })

  const rafPendingRef = React.useRef(false)

  // Hold the latest move-handler in a ref so the window listeners can register
  // once (empty deps) instead of re-binding on every render.
  const scrubMoveRef = React.useRef<(event: PointerEvent) => void>(() => {})
  scrubMoveRef.current = (event: PointerEvent) => {
    if (!scrubRef.current.active) return
    scrubRef.current.deltaPx += event.movementX
    scrubRef.current.lastShift = event.shiftKey
    scrubRef.current.lastAlt = event.altKey
    if (rafPendingRef.current) return
    rafPendingRef.current = true
    requestAnimationFrame(() => {
      rafPendingRef.current = false
      if (!scrubRef.current.active) return
      const prevShift = scrubRef.current.appliedShift
      const prevAlt = scrubRef.current.appliedAlt
      const newShift = scrubRef.current.lastShift
      const newAlt = scrubRef.current.lastAlt
      if (
        scrubRef.current.hasCommitted &&
        (prevShift !== newShift || prevAlt !== newAlt)
      ) {
        // Fold accumulated delta into the anchor under the old multiplier, then
        // zero it — so the new modifier never retroactively rescales past motion.
        const prevMul = prevShift ? 10 : prevAlt ? 0.1 : 1
        scrubRef.current.anchor =
          scrubRef.current.anchor +
          scrubRef.current.deltaPx * step * dragSensitivity * prevMul
        scrubRef.current.deltaPx = 0
      }
      scrubRef.current.appliedShift = newShift
      scrubRef.current.appliedAlt = newAlt
      scrubRef.current.hasCommitted = true
      const multiplier = newShift ? 10 : newAlt ? 0.1 : 1
      const next =
        scrubRef.current.anchor +
        scrubRef.current.deltaPx * step * dragSensitivity * multiplier
      commit(String(next))
    })
  }

  React.useEffect(() => {
    const onPointerMove = (event: PointerEvent) => scrubMoveRef.current(event)
    const onPointerUp = () => {
      if (!scrubRef.current.active) return
      scrubRef.current.active = false
      document.exitPointerLock()
    }
    window.addEventListener("pointermove", onPointerMove)
    window.addEventListener("pointerup", onPointerUp)
    return () => {
      window.removeEventListener("pointermove", onPointerMove)
      window.removeEventListener("pointerup", onPointerUp)
    }
  }, [])

  const onSuffixPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (disabled) return
    event.preventDefault()
    scrubRef.current = {
      active: true,
      anchor: parsedFromValue,
      deltaPx: 0,
      lastShift: false,
      lastAlt: false,
      appliedShift: false,
      appliedAlt: false,
      hasCommitted: false,
    }
    event.currentTarget.requestPointerLock()
  }

  const suffixNode =
    suffix === undefined ? (
      <span
        data-slot="unit-input-suffix"
        className={cn(
          "flex select-none items-center bg-muted/50 px-2 font-mono text-muted-foreground text-xs",
          disabled ? "cursor-not-allowed" : "cursor-ew-resize",
        )}
        aria-hidden="true"
        onPointerDown={onSuffixPointerDown}
      >
        {unitStr}
      </span>
    ) : (
      <div data-slot="unit-input-suffix" onPointerDown={onSuffixPointerDown}>
        {suffix}
      </div>
    )

  return (
    <div
      data-slot="unit-input"
      className={cn(
        "inline-flex h-7 items-stretch overflow-hidden rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1",
        disabled && "opacity-50",
        className,
      )}
    >
      {prefix ? (
        <div
          data-slot="unit-input-prefix"
          className="flex items-center border-input border-r bg-muted/50 px-2"
        >
          {prefix}
        </div>
      ) : null}
      <Input
        value={displayed}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => setRawDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={onKeyDown}
        className="h-full rounded-none border-0 bg-transparent px-2 font-mono text-xs shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
      />
      <div className="w-px bg-input" aria-hidden="true" />
      {suffixNode}
    </div>
  )
}
