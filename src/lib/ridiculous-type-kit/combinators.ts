import type { Trim } from "./primitives";

export type StartsWith<
	S extends string,
	P extends string,
> = S extends `${P}${string}` ? true : false;

export type EndsWith<
	S extends string,
	P extends string,
> = S extends `${string}${P}` ? true : false;

// --- paren/bracket-aware top-level splitter --------------------------
// Walks char-by-char tracking () and [] depth. Splits only on Sep when
// depth is 0. Tail-recursive (TS eliminates the tail recursion).

type Push<Acc extends string[], Cur extends string> = [...Acc, Cur];

type SplitTopLevel<
	S extends string,
	Sep extends string,
	Depth extends unknown[] = [],
	Cur extends string = "",
	Acc extends string[] = [],
> = S extends `${infer C}${infer Rest}`
	? C extends "(" | "["
		? SplitTopLevel<Rest, Sep, [...Depth, unknown], `${Cur}${C}`, Acc>
		: C extends ")" | "]"
			? SplitTopLevel<
					Rest,
					Sep,
					Depth extends [unknown, ...infer D] ? D : [],
					`${Cur}${C}`,
					Acc
				>
			: C extends Sep
				? Depth["length"] extends 0
					? SplitTopLevel<Rest, Sep, Depth, "", Push<Acc, Cur>>
					: SplitTopLevel<Rest, Sep, Depth, `${Cur}${C}`, Acc>
				: SplitTopLevel<Rest, Sep, Depth, `${Cur}${C}`, Acc>
	: Push<Acc, Cur>;

// Trim every token; for space-splitting also drop empties (collapses runs).
type TrimAll<T extends string[], DropEmpty extends boolean> = T extends [
	infer H extends string,
	...infer R extends string[],
]
	? Trim<H> extends ""
		? DropEmpty extends true
			? TrimAll<R, DropEmpty>
			: ["", ...TrimAll<R, DropEmpty>]
		: [Trim<H>, ...TrimAll<R, DropEmpty>]
	: [];

export type SplitByComma<S extends string> = TrimAll<
	SplitTopLevel<S, ",">,
	false
>;

export type SplitBySpace<S extends string> = TrimAll<
	SplitTopLevel<S, " ">,
	true
>;

// --- function parser --------------------------------------------------
// Splits on the FIRST "(" (name) and the LAST ")" (args), so the outer
// call wins for nested functions. Name is trimmed; args kept verbatim.

export type ParseFunction<S extends string> =
	Trim<S> extends `${infer Name}(${infer Args})`
		? { name: Trim<Name>; args: Args }
		: never;
