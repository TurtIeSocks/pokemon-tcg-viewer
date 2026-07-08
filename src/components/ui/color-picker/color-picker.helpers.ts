import type {
  ColorLiteral,
  ColorMode,
  ColorString,
  Oklch,
} from "./color-picker.types"

// ---------------------------------------------------------------------------
// Parsing / formatting
// ---------------------------------------------------------------------------

export function parseAlphaToken(raw: string): number {
  return raw.endsWith("%") ? parseFloat(raw) / 100 : parseFloat(raw)
}

export function trimNumber(n: number): number {
  return parseFloat(n.toFixed(4))
}

export function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n
}

export function parseHex(
  value: string,
): { r: number; g: number; b: number; a: number } | null {
  const match = value.match(/^#([0-9a-f]{3,8})$/i)
  if (!match) return null
  const body = match[1]
  const read = (hex: string) => parseInt(hex, 16) / 255
  if (body.length === 3) {
    return {
      r: read(body[0].repeat(2)),
      g: read(body[1].repeat(2)),
      b: read(body[2].repeat(2)),
      a: 1,
    }
  }
  if (body.length === 4) {
    return {
      r: read(body[0].repeat(2)),
      g: read(body[1].repeat(2)),
      b: read(body[2].repeat(2)),
      a: read(body[3].repeat(2)),
    }
  }
  if (body.length === 6) {
    return {
      r: read(body.slice(0, 2)),
      g: read(body.slice(2, 4)),
      b: read(body.slice(4, 6)),
      a: 1,
    }
  }
  if (body.length === 8) {
    return {
      r: read(body.slice(0, 2)),
      g: read(body.slice(2, 4)),
      b: read(body.slice(4, 6)),
      a: read(body.slice(6, 8)),
    }
  }
  return null
}

export function parseRgb(
  value: string,
): { r: number; g: number; b: number; a: number } | null {
  const match = value.match(
    /^rgba?\(\s*([\d.]+%?)[\s,]+([\d.]+%?)[\s,]+([\d.]+%?)\s*(?:[,/]\s*([\d.]+%?))?\s*\)$/i,
  )
  if (!match) return null
  const channel = (raw: string) =>
    raw.endsWith("%") ? parseFloat(raw) / 100 : parseFloat(raw) / 255
  const r = channel(match[1])
  const g = channel(match[2])
  const b = channel(match[3])
  const a = match[4] != null ? parseAlphaToken(match[4]) : 1
  if ([r, g, b].some((n) => Number.isNaN(n))) return null
  return { r, g, b, a }
}

export function parseHsl(
  value: string,
): { h: number; s: number; l: number; a: number } | null {
  const match = value.match(
    /^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%\s*(?:[,/]\s*([\d.]+%?))?\s*\)$/i,
  )
  if (!match) return null
  const h = parseFloat(match[1])
  const s = parseFloat(match[2]) / 100
  const l = parseFloat(match[3]) / 100
  const a = match[4] != null ? parseAlphaToken(match[4]) : 1
  if ([h, s, l].some((n) => Number.isNaN(n))) return null
  return { h, s, l, a }
}

const OKLCH_RE =
  /^oklch\(\s*([\d.]+%?)\s+([\d.]+%?)\s+([\d.]+(?:deg)?)\s*(?:\/\s*([\d.]+%?)\s*)?\)$/i

export function parseOklch(value: string): Oklch | null {
  const match = value.match(OKLCH_RE)
  if (!match) return null
  const l = match[1].endsWith("%")
    ? parseFloat(match[1]) / 100
    : parseFloat(match[1])
  const c = match[2].endsWith("%")
    ? (parseFloat(match[2]) / 100) * 0.4
    : parseFloat(match[2])
  const h = parseFloat(match[3].replace(/deg$/i, ""))
  const a = match[4] != null ? parseAlphaToken(match[4]) : 1
  if ([l, c, h].some((n) => Number.isNaN(n))) return null
  return { l, c, h, a }
}

// Alpha formatting: oklch and oklab preserve fractional precision via
// trimNumber (perceptual spaces are precision-sensitive); rgb/hsl/hwb round
// to integer percent (byte-quantized inputs make fractional alpha meaningless).
// Hex encodes alpha as a byte-aligned digit pair.

export function formatOklch({ l, c, h, a }: Oklch): string {
  const base = `oklch(${trimNumber(l)} ${trimNumber(c)} ${trimNumber(h)}`
  if (a >= 1) return `${base})`
  return `${base} / ${trimNumber(a * 100)}%)`
}

export function formatHex(oklch: Oklch, includeAlpha: boolean): string {
  const [r, g, b] = oklchToSrgb(oklch.l, oklch.c, oklch.h)
  const channel = (n: number) =>
    Math.round(clamp01(n) * 255)
      .toString(16)
      .padStart(2, "0")
  const base = `#${channel(r)}${channel(g)}${channel(b)}`
  if (!includeAlpha) return base
  return `${base}${channel(oklch.a)}`
}

export function formatRgb(oklch: Oklch): string {
  const [r, g, b] = oklchToSrgb(oklch.l, oklch.c, oklch.h)
  const channel = (n: number) => Math.round(clamp01(n) * 255)
  const base = `rgb(${channel(r)} ${channel(g)} ${channel(b)}`
  if (oklch.a >= 1) return `${base})`
  return `${base} / ${Math.round(oklch.a * 100)}%)`
}

export function formatHsl(oklch: Oklch): string {
  const [r, g, b] = oklchToSrgb(oklch.l, oklch.c, oklch.h)
  const hsl = srgbToHsl(clamp01(r), clamp01(g), clamp01(b))
  const h = Math.round(hsl.h)
  const s = Math.round(hsl.s * 100)
  const l = Math.round(hsl.l * 100)
  const base = `hsl(${h} ${s}% ${l}%`
  if (oklch.a >= 1) return `${base})`
  return `${base} / ${Math.round(oklch.a * 100)}%)`
}

const OKLAB_RE =
  /^oklab\(\s*([\d.]+%?)\s+(-?[\d.]+%?)\s+(-?[\d.]+%?)\s*(?:\/\s*([\d.]+%?)\s*)?\)$/i

export function parseOklab(value: string): {
  l: number
  a: number
  b: number
  alpha: number
} | null {
  const match = value.match(OKLAB_RE)
  if (!match) return null
  const l = match[1].endsWith("%")
    ? parseFloat(match[1]) / 100
    : parseFloat(match[1])
  // Per CSS Color 4, oklab a/b percentages are relative to 0.4 (signed).
  const a = match[2].endsWith("%")
    ? (parseFloat(match[2]) / 100) * 0.4
    : parseFloat(match[2])
  const b = match[3].endsWith("%")
    ? (parseFloat(match[3]) / 100) * 0.4
    : parseFloat(match[3])
  const alpha = match[4] != null ? parseAlphaToken(match[4]) : 1
  if ([l, a, b].some((n) => Number.isNaN(n))) return null
  return { l, a, b, alpha }
}

export function formatOklab(oklch: Oklch): string {
  const { a, b } = oklchToOklab(oklch.l, oklch.c, oklch.h)
  const base = `oklab(${trimNumber(oklch.l)} ${trimNumber(a)} ${trimNumber(b)}`
  if (oklch.a >= 1) return `${base})`
  return `${base} / ${trimNumber(oklch.a * 100)}%)`
}

const HWB_RE =
  /^hwb\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%\s*(?:\/\s*([\d.]+%?)\s*)?\)$/i

export function parseHwb(value: string): {
  h: number
  w: number
  b: number
  a: number
} | null {
  const match = value.match(HWB_RE)
  if (!match) return null
  const h = parseFloat(match[1])
  const w = parseFloat(match[2]) / 100
  const b = parseFloat(match[3]) / 100
  const a = match[4] != null ? parseAlphaToken(match[4]) : 1
  if ([h, w, b].some((n) => Number.isNaN(n))) return null
  return { h, w, b, a }
}

export function formatHwb(oklch: Oklch): string {
  const [r, g, b] = oklchToSrgb(oklch.l, oklch.c, oklch.h)
  const hwb = srgbToHwb(clamp01(r), clamp01(g), clamp01(b))
  const h = Math.round(hwb.h)
  const w = Math.round(hwb.w * 100)
  const bk = Math.round(hwb.b * 100)
  const base = `hwb(${h} ${w}% ${bk}%`
  if (oklch.a >= 1) return `${base})`
  return `${base} / ${Math.round(oklch.a * 100)}%)`
}

// ---------------------------------------------------------------------------
// Color space conversions
// ---------------------------------------------------------------------------

export function linearToSrgb(x: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055
}

export function srgbToLinear(x: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
}

export function hslToSrgb(
  h: number,
  s: number,
  l: number,
): { r: number; g: number; b: number } {
  const chroma = (1 - Math.abs(2 * l - 1)) * s
  const hh = (((h % 360) + 360) % 360) / 60
  const x = chroma * (1 - Math.abs((hh % 2) - 1))
  let r1 = 0
  let g1 = 0
  let b1 = 0
  if (hh < 1) [r1, g1, b1] = [chroma, x, 0]
  else if (hh < 2) [r1, g1, b1] = [x, chroma, 0]
  else if (hh < 3) [r1, g1, b1] = [0, chroma, x]
  else if (hh < 4) [r1, g1, b1] = [0, x, chroma]
  else if (hh < 5) [r1, g1, b1] = [x, 0, chroma]
  else [r1, g1, b1] = [chroma, 0, x]
  const m = l - chroma / 2
  return { r: r1 + m, g: g1 + m, b: b1 + m }
}

export function srgbToHsl(
  r: number,
  g: number,
  b: number,
): { h: number; s: number; l: number } {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return { h: 0, s: 0, l }
  const s = d / (1 - Math.abs(2 * l - 1))
  let h: number
  if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  h *= 60
  if (h < 0) h += 360
  return { h, s, l }
}

export function oklchToSrgb(
  L: number,
  C: number,
  hDeg: number,
): [number, number, number] {
  const hRad = (hDeg * Math.PI) / 180
  const a = C * Math.cos(hRad)
  const b = C * Math.sin(hRad)

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b

  const lCubed = l_ * l_ * l_
  const mCubed = m_ * m_ * m_
  const sCubed = s_ * s_ * s_

  const rLin =
    4.0767416621 * lCubed - 3.3077115913 * mCubed + 0.2309699292 * sCubed
  const gLin =
    -1.2684380046 * lCubed + 2.6097574011 * mCubed - 0.3413193965 * sCubed
  const bLin =
    -0.0041960863 * lCubed - 0.7034186147 * mCubed + 1.707614701 * sCubed

  return [linearToSrgb(rLin), linearToSrgb(gLin), linearToSrgb(bLin)]
}

export function srgbToOklch(
  r: number,
  g: number,
  b: number,
  alpha: number,
): Oklch {
  const rLin = srgbToLinear(r)
  const gLin = srgbToLinear(g)
  const bLin = srgbToLinear(b)

  const lLms = 0.4122214708 * rLin + 0.5363325363 * gLin + 0.0514459929 * bLin
  const mLms = 0.2119034982 * rLin + 0.6806995451 * gLin + 0.1073969566 * bLin
  const sLms = 0.0883024619 * rLin + 0.2817188376 * gLin + 0.6299787005 * bLin

  const l_ = Math.cbrt(lLms)
  const m_ = Math.cbrt(mLms)
  const s_ = Math.cbrt(sLms)

  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_
  const aAxis = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_
  const bAxis = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_

  const C = Math.sqrt(aAxis * aAxis + bAxis * bAxis)
  let H = (Math.atan2(bAxis, aAxis) * 180) / Math.PI
  if (H < 0) H += 360

  return { l: L, c: C, h: H, a: alpha }
}

export function oklchToOklab(
  L: number,
  C: number,
  hDeg: number,
): { l: number; a: number; b: number } {
  const hRad = (hDeg * Math.PI) / 180
  return { l: L, a: C * Math.cos(hRad), b: C * Math.sin(hRad) }
}

export function oklabToOklch(
  L: number,
  a: number,
  b: number,
): { l: number; c: number; h: number } {
  const C = Math.sqrt(a * a + b * b)
  let H = (Math.atan2(b, a) * 180) / Math.PI
  if (H < 0) H += 360
  return { l: L, c: C, h: H }
}

// Per CSS Color 4 spec, https://www.w3.org/TR/css-color-4/#hwb-to-rgb
export function hwbToSrgb(
  h: number,
  w: number,
  b: number,
): { r: number; g: number; b: number } {
  if (w + b >= 1) {
    const gray = w / (w + b)
    return { r: gray, g: gray, b: gray }
  }
  const rgb = hslToSrgb(h, 1, 0.5)
  const scale = 1 - w - b
  return {
    r: rgb.r * scale + w,
    g: rgb.g * scale + w,
    b: rgb.b * scale + w,
  }
}

export function srgbToHwb(
  r: number,
  g: number,
  b: number,
): { h: number; w: number; b: number } {
  const hsl = srgbToHsl(r, g, b)
  const w = Math.min(r, g, b)
  const bk = 1 - Math.max(r, g, b)
  return { h: hsl.h, w, b: bk }
}

// ---------------------------------------------------------------------------
// Mode dispatchers
// ---------------------------------------------------------------------------

export interface ParseResult {
  oklch: Oklch
  mode: ColorMode
}

export function parseColor(value: string): ParseResult | null {
  const trimmed = value.trim()

  const oklch = parseOklch(trimmed)
  if (oklch) return { oklch, mode: "oklch" }

  const oklab = parseOklab(trimmed)
  if (oklab) {
    const polar = oklabToOklch(oklab.l, oklab.a, oklab.b)
    return {
      oklch: { l: polar.l, c: polar.c, h: polar.h, a: oklab.alpha },
      mode: "oklab",
    }
  }

  const hex = parseHex(trimmed)
  if (hex) {
    return { oklch: srgbToOklch(hex.r, hex.g, hex.b, hex.a), mode: "hex" }
  }

  const rgb = parseRgb(trimmed)
  if (rgb) {
    return { oklch: srgbToOklch(rgb.r, rgb.g, rgb.b, rgb.a), mode: "rgb" }
  }

  const hsl = parseHsl(trimmed)
  if (hsl) {
    const srgb = hslToSrgb(hsl.h, hsl.s, hsl.l)
    return {
      oklch: srgbToOklch(srgb.r, srgb.g, srgb.b, hsl.a),
      mode: "hsl",
    }
  }

  const hwb = parseHwb(trimmed)
  if (hwb) {
    const srgb = hwbToSrgb(hwb.h, hwb.w, hwb.b)
    return {
      oklch: srgbToOklch(srgb.r, srgb.g, srgb.b, hwb.a),
      mode: "hwb",
    }
  }

  return null
}

/**
 * Runtime type guard for color strings. Narrows `string` to `ColorString`
 * and a literal `S` to `S & ColorLiteral<S>`.
 *
 * @example
 * const v: string = userInput
 * if (isColorString(v)) {
 *   // v is now typed ColorString
 * }
 */
export function isColorString(value: string): value is ColorString
export function isColorString<S extends string>(
  value: S,
): value is S & ColorLiteral<S>
export function isColorString(value: string): boolean {
  return parseColor(value) !== null
}

export function formatColor(oklch: Oklch, mode: ColorMode): string {
  switch (mode) {
    case "oklch":
      return formatOklch(oklch)
    case "oklab":
      return formatOklab(oklch)
    case "hex":
      return formatHex(oklch, oklch.a < 1)
    case "rgb":
      return formatRgb(oklch)
    case "hsl":
      return formatHsl(oklch)
    case "hwb":
      return formatHwb(oklch)
  }
}

// ---------------------------------------------------------------------------
// CSS variable presets + recents
// ---------------------------------------------------------------------------

/** True for `var(--x)` / `var( --x )` and bare `--x` custom-property refs. */
export function isCssVar(s: string): boolean {
  return /^\s*(var\(\s*--|--)/.test(s)
}

/** A bare `--x` is wrapped to `var(--x)` for use as a CSS value; else passthrough. */
export function normalizeCssVar(s: string): string {
  const trimmed = s.trim()
  return trimmed.startsWith("--") ? `var(${trimmed})` : s
}

/**
 * Resolve a preset/recent entry to a concrete color.
 * - Concrete colors parse directly (lossless; preserves wide-gamut oklch).
 * - CSS vars need the live cascade: set them on a mounted `probe` element and
 *   read the browser-serialized computed `color`, then parse that. Returns null
 *   when unresolvable (undefined var, no probe / server render). parseColor has
 *   no `color()` branch, so wide-gamut P3 tokens resolve to null by design.
 */
export function resolveCssColor(
  raw: string,
  probe: HTMLElement | null,
): ParseResult | null {
  if (!isCssVar(raw)) return parseColor(raw)
  if (!probe) return null
  probe.style.color = normalizeCssVar(raw)
  const resolved = getComputedStyle(probe).color
  probe.style.color = ""
  return resolved ? parseColor(resolved) : null
}

/** Prepend `value`, drop any prior copy (move-to-front dedup), cap at `max`. */
export function pushRecent(
  prev: readonly string[],
  value: string,
  max: number,
): string[] {
  return [value, ...prev.filter((c) => c !== value)].slice(0, max)
}
