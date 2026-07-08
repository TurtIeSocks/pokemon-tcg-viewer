import { CHECKER_BG } from "./color-picker.constants"
import { clamp01 } from "./color-picker.helpers"

export function AlphaStrip({
  a,
  l,
  c,
  h,
  onChange,
}: {
  a: number
  l: number
  c: number
  h: number
  onChange: (next: number) => void
}) {
  const handlePointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    onChange(clamp01((event.clientX - rect.left) / rect.width))
  }

  const color = `oklch(${l} ${c} ${h})`
  const background = `linear-gradient(to right, transparent, ${color}), ${CHECKER_BG}`

  return (
    <div
      data-slot="color-picker-alpha"
      role="slider"
      aria-label="Alpha"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(a * 100)}
      aria-valuetext={`${Math.round(a * 100)}%`}
      tabIndex={0}
      className="relative h-4 w-full cursor-pointer touch-none rounded-[3px]"
      style={{ background }}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        handlePointer(event)
      }}
      onPointerMove={(event) => {
        if (event.buttons) handlePointer(event)
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") onChange(clamp01(a - 0.01))
        if (event.key === "ArrowRight") onChange(clamp01(a + 0.01))
      }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 h-5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-black/40 bg-white shadow"
        style={{ left: `${a * 100}%` }}
      />
    </div>
  )
}
