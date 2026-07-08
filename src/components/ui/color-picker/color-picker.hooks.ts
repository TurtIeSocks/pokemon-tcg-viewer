import { useCallback, useRef, useState } from "react"

interface UseControllableStateParams<T> {
  /** Controlled value. When defined, the hook does not own the state. */
  prop: T | undefined
  /** Initial value used only in uncontrolled mode. */
  defaultProp: T
  /** Fired with the next value in BOTH controlled and uncontrolled modes. */
  onChange?: (next: T) => void
}

/**
 * Minimal controlled/uncontrolled state. Self-contained (registry components
 * must not depend on @radix-ui/react-use-controllable-state). The setter is
 * stable and reads value/onChange through refs to avoid stale closures, and
 * accepts a functional updater.
 */
export function useControllableState<T>({
  prop,
  defaultProp,
  onChange,
}: UseControllableStateParams<T>): [T, (next: T | ((prev: T) => T)) => void] {
  const [uncontrolled, setUncontrolled] = useState<T>(defaultProp)
  const isControlled = prop !== undefined
  const value = isControlled ? (prop as T) : uncontrolled

  const valueRef = useRef(value)
  valueRef.current = value
  const isControlledRef = useRef(isControlled)
  isControlledRef.current = isControlled
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const setValue = useCallback((next: T | ((prev: T) => T)) => {
    const resolved =
      typeof next === "function"
        ? (next as (prev: T) => T)(valueRef.current)
        : next
    if (!isControlledRef.current) setUncontrolled(resolved)
    onChangeRef.current?.(resolved)
  }, [])

  return [value, setValue]
}
