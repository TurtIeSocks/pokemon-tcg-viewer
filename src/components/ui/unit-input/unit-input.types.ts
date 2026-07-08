// =====================================================================
// 1. PRIMITIVES — private helpers, not exported
// =====================================================================

type Digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"

type WS = " " | "\n" | "\t"
type TrimLeft<S extends string> = S extends `${WS}${infer R}` ? TrimLeft<R> : S
type TrimRight<S extends string> = S extends `${infer R}${WS}`
  ? TrimRight<R>
  : S
type Trim<S extends string> = TrimLeft<TrimRight<S>>

type AllChars<S extends string, Allowed extends string> = S extends ""
  ? true
  : S extends `${infer C}${infer R}`
    ? C extends Allowed
      ? AllChars<R, Allowed>
      : false
    : false

type NonEmptyAllChars<S extends string, Allowed extends string> = S extends ""
  ? false
  : AllChars<S, Allowed>

type And<A extends boolean, B extends boolean> = A extends true
  ? B extends true
    ? true
    : false
  : false

type IsIntPart<S extends string> = S extends ""
  ? true
  : NonEmptyAllChars<S, Digit>

type IsNonNegativeNumber<S extends string> = S extends `${infer I}.${infer F}`
  ? And<IsIntPart<I>, NonEmptyAllChars<F, Digit>> extends true
    ? true
    : false
  : NonEmptyAllChars<S, Digit>

type IsSignedDecimal<S extends string> = S extends `-${infer R}`
  ? IsNonNegativeNumber<R>
  : IsNonNegativeNumber<S>

type KeepIf<B extends boolean, S extends string> = B extends true ? S : never

// =====================================================================
// 2. STRICT VALIDATORS — exported, generic. Used by deg()/percent()/etc.
// =====================================================================

// Validate that S is `<signed-decimal><U>` and, if so, return S unchanged
// (else never). All per-unit *Literal aliases are just this with U pinned.
export type SuffixLiteral<
  S extends string,
  U extends string,
> = S extends `${infer N}${U}` ? KeepIf<IsSignedDecimal<Trim<N>>, S> : never

export type DegLiteral<S extends string> = SuffixLiteral<S, "deg">
export type PercentLiteral<S extends string> = SuffixLiteral<S, "%">
export type PxLiteral<S extends string> = SuffixLiteral<S, "px">
export type RemLiteral<S extends string> = SuffixLiteral<S, "rem">
export type EmLiteral<S extends string> = SuffixLiteral<S, "em">
export type VwLiteral<S extends string> = SuffixLiteral<S, "vw">
export type VhLiteral<S extends string> = SuffixLiteral<S, "vh">

export type UnitLiteral<S extends string> =
  | DegLiteral<S>
  | PercentLiteral<S>
  | PxLiteral<S>
  | RemLiteral<S>
  | EmLiteral<S>
  | VwLiteral<S>
  | VhLiteral<S>

// =====================================================================
// 3. SUGGESTION STRINGS — non-generic, for IntelliSense + onChange returns.
// =====================================================================

export type SuffixString<U extends string> = `${number}${U}`

export type DegString = SuffixString<"deg">
export type PercentString = SuffixString<"%">
export type PxString = SuffixString<"px">
export type RemString = SuffixString<"rem">
export type EmString = SuffixString<"em">
export type VwString = SuffixString<"vw">
export type VhString = SuffixString<"vh">

export interface UnitStringMap {
  deg: DegString
  "%": PercentString
  px: PxString
  rem: RemString
  em: EmString
  vw: VwString
  vh: VhString
}

export type KnownUnit = keyof UnitStringMap
export type UnitString =
  | DegString
  | PercentString
  | PxString
  | RemString
  | EmString
  | VwString
  | VhString

// =====================================================================
// 4. STRICT HELPERS — validate at the call site, return the literal back.
// =====================================================================

// Build a strict tag helper for one unit suffix: it accepts S only when S is a
// valid `<number><U>` literal and returns S unchanged, so callers keep the
// narrow type. Each per-unit helper below is one application of this factory.
const makeUnit =
  <U extends string>() =>
  <S extends string>(value: S & SuffixLiteral<S, U>): S =>
    value

export const deg = makeUnit<"deg">()
export const percent = makeUnit<"%">()
export const px = makeUnit<"px">()
export const rem = makeUnit<"rem">()
export const em = makeUnit<"em">()
export const vw = makeUnit<"vw">()
export const vh = makeUnit<"vh">()
