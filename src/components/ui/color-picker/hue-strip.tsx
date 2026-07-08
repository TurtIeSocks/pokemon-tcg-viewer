import { HUE_GRADIENT } from "./color-picker.constants"
import { clamp01 } from "./color-picker.helpers"

export function HueStrip({
  h,
  onChange,
}: {
  h: number
  onChange: (h: number) => void
}) {
  const handlePointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    onChange(clamp01((event.clientX - rect.left) / rect.width) * 360)
  }

  return (
    <div
      data-slot="color-picker-hue"
      role="slider"
      aria-label="Hue"
      aria-valuemin={0}
      aria-valuemax={360}
      aria-valuenow={Math.round(h)}
      aria-valuetext={`${Math.round(h)} degrees`}
      tabIndex={0}
      className="relative h-4 w-full cursor-pointer touch-none rounded-[3px]"
      style={{ background: HUE_GRADIENT }}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        handlePointer(event)
      }}
      onPointerMove={(event) => {
        if (event.buttons) handlePointer(event)
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") onChange(Math.max(0, h - 1))
        if (event.key === "ArrowRight") onChange(Math.min(360, h + 1))
      }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 h-5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-black/40 bg-white shadow"
        style={{ left: `${(h / 360) * 100}%` }}
      />
    </div>
  )
}
