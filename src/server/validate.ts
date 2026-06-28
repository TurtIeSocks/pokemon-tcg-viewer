// Input-validation guards for createServerFn server functions. They run on the
// server for every RPC call; throwing rejects the request before it reaches a
// fetch or corpus query. Public GET server fns are reachable by any client, so
// their inputs are untrusted — pass-through validators (`(x) => x`) are not
// validation. Pure (no server-only deps), so safe wherever it's imported.

/** Reject anything that isn't a non-empty string. */
export function nonEmptyString(value: unknown, label: string): string {
	if (typeof value !== "string" || value.length === 0)
		throw new Error(`${label} must be a non-empty string`);
	return value;
}

/** Reject anything that isn't a known card supertype. */
export function supertypeName(value: unknown): string {
	const v = nonEmptyString(value, "supertype");
	if (v !== "Pokémon" && v !== "Trainer" && v !== "Energy")
		throw new Error("supertype must be Pokémon, Trainer, or Energy");
	return v;
}

/** Coerce to a number and reject anything outside the integer range [min, max]. */
export function boundedInt(
	value: unknown,
	label: string,
	min: number,
	max: number,
): number {
	const n = typeof value === "number" ? value : Number(value);
	if (!Number.isInteger(n) || n < min || n > max)
		throw new Error(`${label} must be an integer in [${min}, ${max}]`);
	return n;
}
