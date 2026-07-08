import { Button } from "@/components/ui/button"
import { COLOR_MODES } from "./color-picker.constants"
import type { ColorMode } from "./color-picker.types"

export function ModeButtonGroup({
  mode,
  onChange,
}: {
  mode: ColorMode
  onChange: (next: ColorMode) => void
}) {
  return (
    <div
      role="tablist"
      aria-label="Color format"
      className="flex w-full items-center justify-evenly gap-1"
      data-slot="color-picker-modes"
    >
      {COLOR_MODES.map((m) => (
        <Button
          key={m}
          type="button"
          role="tab"
          aria-selected={m === mode}
          size="sm"
          variant={m === mode ? "secondary" : "ghost"}
          onClick={() => onChange(m)}
          className="h-7 px-2 font-mono text-xs"
        >
          {m}
        </Button>
      ))}
    </div>
  )
}
