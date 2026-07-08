import type { IsNonNegativeNumber, IsNumber, Trim } from "./primitives";

// Try each unit suffix in turn; on a matched-but-non-numeric prefix keep
// trying (handles ambiguous suffixes like rem/em, dvh/vh). OR over the set.
type HasUnit<
	S extends string,
	Units extends readonly string[],
> = Units extends readonly [
	infer U extends string,
	...infer Rest extends readonly string[],
]
	? S extends `${infer N}${U}`
		? IsNumber<Trim<N>> extends true
			? true
			: HasUnit<S, Rest>
		: HasUnit<S, Rest>
	: false;

// Longest-first ordering is defensive only — HasUnit ORs over the whole set.
type LengthUnits = [
	"cqmin",
	"cqmax",
	"vmin",
	"vmax",
	"svw",
	"svh",
	"svi",
	"svb",
	"lvw",
	"lvh",
	"lvi",
	"lvb",
	"dvw",
	"dvh",
	"dvi",
	"dvb",
	"cqw",
	"cqh",
	"cqi",
	"cqb",
	"rlh",
	"rem",
	"cap",
	"rex",
	"px",
	"em",
	"ex",
	"ch",
	"ic",
	"lh",
	"vw",
	"vh",
	"vi",
	"vb",
	"cm",
	"mm",
	"in",
	"pt",
	"pc",
	"Q",
];
type AngleUnits = ["turn", "grad", "deg", "rad"];
type TimeUnits = ["ms", "s"];
type ResolutionUnits = ["dpcm", "dppx", "dpi", "x"];

export type IsLength<S extends string> = HasUnit<S, LengthUnits>;
export type IsAngle<S extends string> = HasUnit<S, AngleUnits>;
export type IsTime<S extends string> = HasUnit<S, TimeUnits>;
export type IsResolution<S extends string> = HasUnit<S, ResolutionUnits>;

export type IsPercentage<S extends string> = S extends `${infer N}%`
	? IsNumber<Trim<N>>
	: false;

export type IsFlex<S extends string> = S extends `${infer N}fr`
	? IsNonNegativeNumber<Trim<N>>
	: false;

export type Dimension =
	| "length"
	| "angle"
	| "time"
	| "percent"
	| "number"
	| "flex"
	| "resolution";

// Order matters: unit-bearing dimensions are checked before bare number.
export type DimensionOf<S extends string> =
	Trim<S> extends infer T extends string
		? IsPercentage<T> extends true
			? "percent"
			: IsAngle<T> extends true
				? "angle"
				: IsTime<T> extends true
					? "time"
					: IsResolution<T> extends true
						? "resolution"
						: IsFlex<T> extends true
							? "flex"
							: IsLength<T> extends true
								? "length"
								: IsNumber<T> extends true
									? "number"
									: never
		: never;
