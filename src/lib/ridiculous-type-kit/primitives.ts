export type Digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";

export type HexDigit =
	| Digit
	| "a"
	| "b"
	| "c"
	| "d"
	| "e"
	| "f"
	| "A"
	| "B"
	| "C"
	| "D"
	| "E"
	| "F";

// ASCII letters, both cases. Hoisted from the per-component CSS-ident
// validators (grid-builder / transition-editor / font-editor), which all
// re-declared this identical A–Z + a–z union.
export type Letter =
	| "a"
	| "b"
	| "c"
	| "d"
	| "e"
	| "f"
	| "g"
	| "h"
	| "i"
	| "j"
	| "k"
	| "l"
	| "m"
	| "n"
	| "o"
	| "p"
	| "q"
	| "r"
	| "s"
	| "t"
	| "u"
	| "v"
	| "w"
	| "x"
	| "y"
	| "z"
	| "A"
	| "B"
	| "C"
	| "D"
	| "E"
	| "F"
	| "G"
	| "H"
	| "I"
	| "J"
	| "K"
	| "L"
	| "M"
	| "N"
	| "O"
	| "P"
	| "Q"
	| "R"
	| "S"
	| "T"
	| "U"
	| "V"
	| "W"
	| "X"
	| "Y"
	| "Z";

// ASCII letter or digit — the alphanumeric char class.
export type Alpha = Letter | Digit;

export type WS = " " | "\n" | "\t";

export type TrimLeft<S extends string> = S extends `${WS}${infer R}`
	? TrimLeft<R>
	: S;
export type TrimRight<S extends string> = S extends `${infer R}${WS}`
	? TrimRight<R>
	: S;
export type Trim<S extends string> = TrimLeft<TrimRight<S>>;

// Every char of `S` must be a member of the `Allowed` union (e.g. `Digit`).
// Faithful extraction from the shipped components — callers pass a char union.
export type AllChars<S extends string, Allowed extends string> = S extends ""
	? true
	: S extends `${infer C}${infer R}`
		? C extends Allowed
			? AllChars<R, Allowed>
			: false
		: false;

export type NonEmptyAllChars<
	S extends string,
	Allowed extends string,
> = S extends "" ? false : AllChars<S, Allowed>;

export type And<A extends boolean, B extends boolean> = A extends true
	? B extends true
		? true
		: false
	: false;

export type Or<A extends boolean, B extends boolean> = A extends true
	? true
	: B extends true
		? true
		: false;

export type Not<A extends boolean> = A extends true ? false : true;

export type KeepIf<B extends boolean, S extends string> = B extends true
	? S
	: never;

export type Length<
	S extends string,
	A extends unknown[] = [],
> = S extends `${string}${infer R}` ? Length<R, [...A, unknown]> : A["length"];

// --- integer range machinery -----------------------------------------

type Enumerate<
	N extends number,
	A extends number[] = [],
> = A["length"] extends N ? A[number] : Enumerate<N, [...A, A["length"]]>;

export type IntRange<From extends number, To extends number> = Exclude<
	Enumerate<To>,
	Enumerate<From>
>;

type StripLeadingZeros<S extends string> = S extends `0${infer R}`
	? R extends ""
		? "0"
		: StripLeadingZeros<R>
	: S;

type NormalizeInt<S extends string> = S extends "" ? "0" : StripLeadingZeros<S>;

type IsIntPart<S extends string> = S extends ""
	? true
	: NonEmptyAllChars<S, Digit>;

// --- number shape predicates -----------------------------------------

export type IsNonNegativeNumber<S extends string> =
	S extends `${infer I}.${infer F}`
		? And<IsIntPart<I>, NonEmptyAllChars<F, Digit>>
		: NonEmptyAllChars<S, Digit>;

export type IsSignedDecimal<S extends string> = S extends `-${infer R}`
	? IsNonNegativeNumber<R>
	: IsNonNegativeNumber<S>;

export type IsNumber<S extends string> = S extends `+${infer R}`
	? IsNonNegativeNumber<R>
	: IsSignedDecimal<S>;

export type IsPositiveInt<S extends string> = S extends "0"
	? false
	: S extends "" | "-"
		? false
		: NonEmptyAllChars<S, Digit>;

// --- bounded-number predicates ---------------------------------------
//
// One generic engine for "is `S` a number in a closed integer-capped range".
// Three char-set parameters pin the exact accepted values so every existing
// alias keeps byte-identical behavior:
//   • `IntSet`     — bare-integer forms accepted (the integer branch).
//   • `DecIntSet`  — integer-parts STRICTLY BELOW the cap (a non-zero
//                    fraction is allowed for these).
//   • `MaxLit`     — the cap's integer literal; valid only with an all-zero
//                    fraction (e.g. `"100"` → `100.0` ok, `100.5` not).
// Each set may be a bare-literal union (`"0" | "1"`) or an `IntRange<…>`
// template — `IsNumber0To1` uses the former, the rest use the latter.
// `IsByte` is the integer-only degenerate: passing `never` for both decimal
// sets makes the fraction branch always reject, leaving the integer check.
export type IsNumberInClosedRange<
	S extends string,
	IntSet extends string,
	DecIntSet extends string,
	MaxLit extends string,
> = S extends `${infer I}.${infer F}`
	? And<IsIntPart<I>, NonEmptyAllChars<F, Digit>> extends true
		? NormalizeInt<I> extends DecIntSet
			? true
			: NormalizeInt<I> extends MaxLit
				? AllChars<F, "0">
				: false
		: false
	: NonEmptyAllChars<S, Digit> extends true
		? NormalizeInt<S> extends IntSet
			? true
			: false
		: false;

export type IsByte<S extends string> = IsNumberInClosedRange<
	S,
	`${IntRange<0, 256>}`,
	never,
	never
>;

export type IsNumber0To1<S extends string> = IsNumberInClosedRange<
	S,
	"0" | "1",
	"0",
	"1"
>;

export type IsNumber0To100<S extends string> = IsNumberInClosedRange<
	S,
	`${IntRange<0, 101>}`,
	`${IntRange<0, 100>}`,
	"100"
>;

export type IsNumber0To360<S extends string> = IsNumberInClosedRange<
	S,
	`${IntRange<0, 361>}`,
	`${IntRange<0, 360>}`,
	"360"
>;

export type IsNumber0To400<S extends string> = IsNumberInClosedRange<
	S,
	`${IntRange<0, 401>}`,
	`${IntRange<0, 400>}`,
	"400"
>;

// Trims the numeric part before range-checking, mirroring `IsPercentage`
// (dimensions.ts), which does `IsNumber<Trim<N>>`. Both now treat `" 50%"`
// identically (previously this returned false here while IsPercentage
// returned true — an inconsistency across the public API). The `%` must
// still be the literal final char (no trailing-whitespace acceptance), so
// only the inner number is trimmed — exactly as IsPercentage does.
export type IsPercent0To100<S extends string> = S extends `${infer N}%`
	? IsNumber0To100<Trim<N>>
	: false;
