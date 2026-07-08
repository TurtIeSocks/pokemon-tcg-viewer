import type {
  AllChars,
  And,
  HexDigit,
  IsByte,
  IsNonNegativeNumber,
  IsNumber0To1,
  IsNumber0To360,
  IsNumber0To400,
  IsPercent0To100,
  IsSignedDecimal,
  KeepIf,
  Length,
  Or,
  Trim,
} from "@/lib/ridiculous-type-kit"

type IsAlpha<S extends string> = Or<IsNumber0To1<S>, IsPercent0To100<S>>

type IsRgbChannel<S extends string> = Or<IsByte<S>, IsPercent0To100<S>>

type IsHue<S extends string> = S extends `${infer N}deg`
  ? IsNumber0To360<N>
  : S extends `${infer N}turn`
    ? IsNumber0To1<N>
    : S extends `${infer N}grad`
      ? IsNumber0To400<N>
      : IsNumber0To360<S>

/**
 * The component's canonical runtime color value: OKLCH lightness/chroma/hue
 * plus alpha. This is the single source of truth the L×C pad and sliders read
 * and write; every mode formatter consumes it. Kept here (not in the helpers)
 * so both the component and the parse/format helpers can share one named shape.
 */
export interface Oklch {
  l: number
  c: number
  h: number
  a: number
}

// =====================================================================
// 2. STRICT VALIDATORS — exported, generic. Used by color() helper.
// =====================================================================

/** #RGB, #RGBA, #RRGGBB, #RRGGBBAA */
export type HexLiteral<S extends string> = S extends `#${infer Body}`
  ? Length<Body> extends 3 | 4 | 6 | 8
    ? KeepIf<AllChars<Body, HexDigit>, S>
    : never
  : never

/** rgb(255, 0, 0) | rgb(100%, 0%, 0%) | rgb(255 0 0) */
export type RGBLiteral<S extends string> =
  S extends `rgb(${infer R},${infer G},${infer B})`
    ? KeepIf<
        And<
          IsRgbChannel<Trim<R>>,
          And<IsRgbChannel<Trim<G>>, IsRgbChannel<Trim<B>>>
        >,
        S
      >
    : S extends `rgb(${infer R} ${infer G} ${infer B})`
      ? KeepIf<
          And<
            IsRgbChannel<Trim<R>>,
            And<IsRgbChannel<Trim<G>>, IsRgbChannel<Trim<B>>>
          >,
          S
        >
      : never

/**
 * rgba(255, 0, 0, 0.5) | rgba(255, 0, 0, 50%)
 * rgba(255 0 0 / 0.5) | rgb(255 0 0 / 0.5)
 */
export type RGBALiteral<S extends string> =
  S extends `rgba(${infer R},${infer G},${infer B},${infer A})`
    ? KeepIf<
        And<
          IsRgbChannel<Trim<R>>,
          And<
            IsRgbChannel<Trim<G>>,
            And<IsRgbChannel<Trim<B>>, IsAlpha<Trim<A>>>
          >
        >,
        S
      >
    : S extends `rgba(${infer R} ${infer G} ${infer B} / ${infer A})`
      ? KeepIf<
          And<
            IsRgbChannel<Trim<R>>,
            And<
              IsRgbChannel<Trim<G>>,
              And<IsRgbChannel<Trim<B>>, IsAlpha<Trim<A>>>
            >
          >,
          S
        >
      : S extends `rgb(${infer R} ${infer G} ${infer B} / ${infer A})`
        ? KeepIf<
            And<
              IsRgbChannel<Trim<R>>,
              And<
                IsRgbChannel<Trim<G>>,
                And<IsRgbChannel<Trim<B>>, IsAlpha<Trim<A>>>
              >
            >,
            S
          >
        : never

/** hsl(210, 100%, 50%) | hsl(210 100% 50%) | hsl(210 100% 50% / 0.5) */
export type HSLLiteral<S extends string> =
  S extends `hsl(${infer H} ${infer Sat} ${infer Light} / ${infer A})`
    ? KeepIf<
        And<
          IsHue<Trim<H>>,
          And<
            IsPercent0To100<Trim<Sat>>,
            And<IsPercent0To100<Trim<Light>>, IsAlpha<Trim<A>>>
          >
        >,
        S
      >
    : S extends `hsl(${infer H},${infer Sat},${infer Light})`
      ? KeepIf<
          And<
            IsHue<Trim<H>>,
            And<IsPercent0To100<Trim<Sat>>, IsPercent0To100<Trim<Light>>>
          >,
          S
        >
      : S extends `hsl(${infer H} ${infer Sat} ${infer Light})`
        ? KeepIf<
            And<
              IsHue<Trim<H>>,
              And<IsPercent0To100<Trim<Sat>>, IsPercent0To100<Trim<Light>>>
            >,
            S
          >
        : never

/**
 * oklch(62% 0.18 240)
 * oklch(0.62 0.18 240deg / 0.8)
 */
export type OKLCHLiteral<S extends string> =
  S extends `oklch(${infer L} ${infer C} ${infer H} / ${infer A})`
    ? KeepIf<
        And<
          Or<IsNumber0To1<Trim<L>>, IsPercent0To100<Trim<L>>>,
          And<
            Or<IsNonNegativeNumber<Trim<C>>, IsPercent0To100<Trim<C>>>,
            And<IsHue<Trim<H>>, IsAlpha<Trim<A>>>
          >
        >,
        S
      >
    : S extends `oklch(${infer L} ${infer C} ${infer H})`
      ? KeepIf<
          And<
            Or<IsNumber0To1<Trim<L>>, IsPercent0To100<Trim<L>>>,
            And<
              Or<IsNonNegativeNumber<Trim<C>>, IsPercent0To100<Trim<C>>>,
              IsHue<Trim<H>>
            >
          >,
          S
        >
      : never

/**
 * oklab(0.5 0.1 -0.05)
 * oklab(50% 0.1 -0.05 / 0.5)
 *
 * Note: a/b axes are signed (typically -0.4..0.4 in sRGB gamut). This validator
 * accepts any signed decimal; it does NOT range-check a/b to keep complexity
 * tractable. CSS Color 4 allows broader ranges anyway.
 */
export type OklabLiteral<S extends string> =
  S extends `oklab(${infer L} ${infer A} ${infer B} / ${infer Alpha})`
    ? KeepIf<
        And<
          Or<IsNumber0To1<Trim<L>>, IsPercent0To100<Trim<L>>>,
          And<
            IsSignedDecimal<Trim<A>>,
            And<IsSignedDecimal<Trim<B>>, IsAlpha<Trim<Alpha>>>
          >
        >,
        S
      >
    : S extends `oklab(${infer L} ${infer A} ${infer B})`
      ? KeepIf<
          And<
            Or<IsNumber0To1<Trim<L>>, IsPercent0To100<Trim<L>>>,
            And<IsSignedDecimal<Trim<A>>, IsSignedDecimal<Trim<B>>>
          >,
          S
        >
      : never

/**
 * hwb(240 20% 30%)
 * hwb(240 20% 30% / 0.5)
 */
export type HWBLiteral<S extends string> =
  S extends `hwb(${infer H} ${infer W} ${infer B} / ${infer A})`
    ? KeepIf<
        And<
          IsHue<Trim<H>>,
          And<
            IsPercent0To100<Trim<W>>,
            And<IsPercent0To100<Trim<B>>, IsAlpha<Trim<A>>>
          >
        >,
        S
      >
    : S extends `hwb(${infer H} ${infer W} ${infer B})`
      ? KeepIf<
          And<
            IsHue<Trim<H>>,
            And<IsPercent0To100<Trim<W>>, IsPercent0To100<Trim<B>>>
          >,
          S
        >
      : never

export type ColorLiteral<S extends string> =
  | HexLiteral<S>
  | RGBLiteral<S>
  | RGBALiteral<S>
  | HSLLiteral<S>
  | OKLCHLiteral<S>
  | OklabLiteral<S>
  | HWBLiteral<S>

/** Validate a color literal at the call site. */
export const color = <S extends string>(value: S & ColorLiteral<S>): S => value

// =====================================================================
// 3. SUGGESTION STRINGS — non-generic, for IntelliSense + onChange returns.
// =====================================================================

export type HexString = `#${string}`

export type RgbString =
  | `rgb(${number} ${number} ${number})`
  | `rgb(${number} ${number} ${number} / ${number}%)`
  | `rgb(${number}, ${number}, ${number})`
  | `rgba(${number}, ${number}, ${number}, ${number})`

export type HslString =
  | `hsl(${number} ${number}% ${number}%)`
  | `hsl(${number} ${number}% ${number}% / ${number}%)`

export type OklchString =
  | `oklch(${number} ${number} ${number})`
  | `oklch(${number} ${number} ${number} / ${number}%)`

export type OklabString =
  | `oklab(${number} ${number} ${number})`
  | `oklab(${number} ${number} ${number} / ${number}%)`

export type HwbString =
  | `hwb(${number} ${number}% ${number}%)`
  | `hwb(${number} ${number}% ${number}% / ${number}%)`

export type ColorString =
  | HexString
  | RgbString
  | HslString
  | OklchString
  | OklabString
  | HwbString

export interface ColorStringMap {
  hex: HexString
  rgb: RgbString
  hsl: HslString
  oklch: OklchString
  oklab: OklabString
  hwb: HwbString
}

export type ColorMode = keyof ColorStringMap

/**
 * The value `onChange` emits and the element type of the recents `history`.
 * Mode-locked pickers narrow to the exact mode string; auto pickers widen to
 * the full `ColorString` union. Reused so onChange and history can never drift.
 */
export type ColorValue<TMode extends ColorMode | undefined = undefined> =
  TMode extends ColorMode ? ColorStringMap[TMode] : ColorString

// =====================================================================
// 4. UTILITY TYPES — operate on color string literals at the type level.
// =====================================================================

/**
 * Extract the color mode from a color literal at the type level.
 *
 * @example
 * type T1 = ModeOf<"#ff0000">              // "hex"
 * type T2 = ModeOf<"oklch(0.5 0.1 240)">   // "oklch"
 * type T3 = ModeOf<"not-a-color">          // never
 */
export type ModeOf<S extends string> = S extends `oklch(${string})`
  ? "oklch"
  : S extends `oklab(${string})`
    ? "oklab"
    : S extends `#${string}`
      ? "hex"
      : S extends `rgba(${string})`
        ? "rgb"
        : S extends `rgb(${string})`
          ? "rgb"
          : S extends `hsla(${string})`
            ? "hsl"
            : S extends `hsl(${string})`
              ? "hsl"
              : S extends `hwb(${string})`
                ? "hwb"
                : never

/**
 * Replace (or add) the alpha tag on a color literal that uses functional
 * notation. Hex literals are NOT supported here because hex alpha is a
 * byte-aligned digit pair; encoding a number-to-hex transform at the type
 * level would require a 256-entry lookup table per nibble.
 *
 * @example
 * type T1 = WithAlpha<"oklch(0.5 0.1 240)", 50>           // "oklch(0.5 0.1 240 / 50%)"
 * type T2 = WithAlpha<"oklch(0.5 0.1 240 / 100%)", 50>    // "oklch(0.5 0.1 240 / 50%)"
 * type T3 = WithAlpha<"rgb(255 0 0)", 25>                 // "rgb(255 0 0 / 25%)"
 */
export type WithAlpha<
  S extends string,
  A extends number,
> = S extends `${infer Base} / ${string})`
  ? `${Base} / ${A}%)`
  : S extends `${infer Base})`
    ? `${Base} / ${A}%)`
    : never

/**
 * Strip the alpha tag from a color literal that uses functional notation.
 * Hex literals pass through unchanged (use `slice` at runtime for 8-digit
 * hex if needed).
 *
 * @example
 * type T1 = WithoutAlpha<"oklch(0.5 0.1 240 / 50%)">  // "oklch(0.5 0.1 240)"
 * type T2 = WithoutAlpha<"oklch(0.5 0.1 240)">        // "oklch(0.5 0.1 240)"
 */
export type WithoutAlpha<S extends string> =
  S extends `${infer Base} / ${string})` ? `${Base})` : S
