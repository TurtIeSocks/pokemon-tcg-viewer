import { useEffect, useRef } from "react"
import { CHROMA_MAX, PAD_HEIGHT, PAD_WIDTH } from "./color-picker.constants"
import { clamp01, oklchToSrgb } from "./color-picker.helpers"

export function LcPad({
  l,
  c,
  h,
  onChange,
}: {
  l: number
  c: number
  h: number
  onChange: (l: number, c: number) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const image = ctx.createImageData(PAD_WIDTH, PAD_HEIGHT)
    for (let y = 0; y < PAD_HEIGHT; y++) {
      const lAtRow = 1 - y / (PAD_HEIGHT - 1)
      for (let x = 0; x < PAD_WIDTH; x++) {
        const cAtCol = (x / (PAD_WIDTH - 1)) * CHROMA_MAX
        const [r, g, b] = oklchToSrgb(lAtRow, cAtCol, h)
        const i = (y * PAD_WIDTH + x) * 4
        image.data[i] = r * 255
        image.data[i + 1] = g * 255
        image.data[i + 2] = b * 255
        image.data[i + 3] = 255
      }
    }
    ctx.putImageData(image, 0, 0)
  }, [h])

  const handlePointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const nx = clamp01((event.clientX - rect.left) / rect.width)
    const ny = clamp01((event.clientY - rect.top) / rect.height)
    onChange(1 - ny, nx * CHROMA_MAX)
  }

  const markerX = (c / CHROMA_MAX) * 100
  const markerY = (1 - l) * 100

  // The pad is a 2-D control: lightness on the vertical axis, chroma on the
  // horizontal. `role="application"` carries no implicit value semantics and
  // does not support `aria-valuetext`, so we fold the live value of BOTH axes
  // into the accessible name itself. The label updates as the user nudges, so
  // a screen reader announces the new lightness/chroma on every arrow press.
  const label = `Lightness and chroma. Lightness ${(l * 100).toFixed(0)} percent, chroma ${c.toFixed(2)}. Use arrow keys to adjust lightness up and down, chroma left and right.`

  return (
    <div
      data-slot="color-picker-pad"
      role="application"
      aria-label={label}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: 2D pad needs to be keyboard-focusable for arrow-key nudge
      tabIndex={0}
      className="relative w-full cursor-crosshair touch-none overflow-hidden rounded border focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={{ height: PAD_HEIGHT }}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        handlePointer(event)
      }}
      onPointerMove={(event) => {
        if (event.buttons) handlePointer(event)
      }}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 0.05 : 0.01
        if (event.key === "ArrowLeft") {
          event.preventDefault()
          onChange(l, Math.max(0, c - step * CHROMA_MAX))
        } else if (event.key === "ArrowRight") {
          event.preventDefault()
          onChange(l, Math.min(CHROMA_MAX, c + step * CHROMA_MAX))
        } else if (event.key === "ArrowUp") {
          event.preventDefault()
          onChange(Math.min(1, l + step), c)
        } else if (event.key === "ArrowDown") {
          event.preventDefault()
          onChange(Math.max(0, l - step), c)
        }
      }}
    >
      <canvas
        ref={canvasRef}
        width={PAD_WIDTH}
        height={PAD_HEIGHT}
        className="block h-full w-full"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow ring-1 ring-black/40"
        style={{ left: `${markerX}%`, top: `${markerY}%` }}
      />
    </div>
  )
}
