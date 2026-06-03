/**
 * Extract a human-readable message from a form field error.
 *
 * TanStack Form surfaces validation errors as whatever the validator returns.
 * With Zod, `field.state.meta.errors[0]` is a Zod issue OBJECT (`{ message, path, … }`),
 * so the naive `String(error)` renders the infamous `"[object Object]"`. This reads
 * the `message` instead, and degrades gracefully for string / null / shapeless inputs.
 */
export function fieldErrorText(e: unknown): string {
	if (e == null) return "";
	if (typeof e === "string") return e;
	if (typeof e === "object" && "message" in e) {
		const m = (e as { message: unknown }).message;
		return typeof m === "string" ? m : m == null ? "" : String(m);
	}
	return "";
}
