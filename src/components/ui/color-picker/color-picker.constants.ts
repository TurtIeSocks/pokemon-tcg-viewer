import type { ColorMode } from "./color-picker.types"

/** Modes offered by the in-popover format switcher, in display order. */
export const COLOR_MODES = [
  "oklch",
  "oklab",
  "hex",
  "rgb",
  "hsl",
  "hwb",
] as const satisfies readonly ColorMode[]

// L×C pad geometry. Width/height are the canvas pixel dimensions; chroma max
// is the rightmost chroma value the horizontal axis maps to.
export const PAD_WIDTH = 240
export const PAD_HEIGHT = 160
export const CHROMA_MAX = 0.4

export const HUE_GRADIENT = `linear-gradient(to right, oklch(0.7 0.18 0), oklch(0.7 0.18 60), oklch(0.7 0.18 120), oklch(0.7 0.18 180), oklch(0.7 0.18 240), oklch(0.7 0.18 300), oklch(0.7 0.18 360))`

export const CHECKER_BG = `conic-gradient(#bbb 25%, #fff 0 50%, #bbb 0 75%, #fff 0) 0 0 / 10px 10px`

/** Max recents kept in the history row (fits one popover-width swatch row). */
export const MAX_RECENTS = 8

export const PRESETS: ReadonlyArray<{
  l: number
  c: number
  h: number
  name: string
}> = [
  { l: 0.637, c: 0.237, h: 25.331, name: "red" },
  { l: 0.705, c: 0.213, h: 47.604, name: "orange" },
  { l: 0.769, c: 0.188, h: 70.08, name: "amber" },
  { l: 0.768, c: 0.233, h: 130.85, name: "lime" },
  { l: 0.696, c: 0.17, h: 162.48, name: "emerald" },
  { l: 0.715, c: 0.143, h: 215.221, name: "cyan" },
  { l: 0.623, c: 0.214, h: 259.815, name: "blue" },
  { l: 0.606, c: 0.25, h: 292.717, name: "violet" },
  { l: 0.667, c: 0.295, h: 322.15, name: "fuchsia" },
  { l: 0.656, c: 0.241, h: 354.308, name: "pink" },
]
