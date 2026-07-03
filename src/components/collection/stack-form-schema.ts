import { z } from "zod";
import { SUPPORTED_LANGUAGES } from "@/lib/languages";

/** Allowed raw-card condition grades in order of severity. */
export const CONDITIONS = ["NM", "LP", "MP", "HP", "DMG"] as const;
/** Recognised third-party grading companies. */
export const GRADERS = ["PSA", "BGS", "CGC", "TAG", "SGC", "Other"] as const;
/**
 * Card-language select options. Gated to the catalog-supported set (ISO 639-1)
 * so a recorded language can no longer silently render English — picking one of
 * these is a language the catalog actually renders. `language` itself stays a
 * free `z.string()`, so legacy stacks in other languages still load (they render
 * EN). Japanese/Korean/Chinese rejoin in Phase 2.
 */
export const LANGUAGES = SUPPORTED_LANGUAGES;

/** Returns true for strings matching YYYY-MM-DD that parse to a valid calendar date. */
export function isValidDateStr(s: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
	const t = Date.parse(s);
	return !Number.isNaN(t);
}
/** Returns true for empty string or a finite non-negative decimal string. */
export function isMoneyOrEmpty(s: string): boolean {
	if (s === "") return true;
	const n = Number(s);
	return Number.isFinite(n) && n >= 0;
}
/** Returns true for empty string or a numeric grade in the 0–10 range. */
export function isGradeOrEmpty(s: string): boolean {
	if (s === "") return true;
	const n = Number(s);
	return Number.isFinite(n) && n >= 0 && n <= 10;
}
/** Returns true for a whole number ≥ 1 (stack quantity). */
function isPositiveIntStr(s: string): boolean {
	const n = Number(s);
	return Number.isInteger(n) && n >= 1;
}

/** Zod schema for the stack-edit form; all fields are strings for controlled-input compatibility. */
export const stackFormSchema = z.object({
	label: z.string(),
	quantity: z.string().refine(isPositiveIntStr, "Whole number ≥ 1"),
	acquiredAt: z.string().refine(isValidDateStr, "Invalid date"),
	pricePaid: z.string().refine(isMoneyOrEmpty, "Must be a number ≥ 0"),
	currency: z.string(),
	language: z.string(),
	variant: z.string(),
	variantId: z.string(),
	notes: z.string(),
	source: z.string(),
	storageLocation: z.string(),
	state: z.enum(["raw", "graded"]),
	condition: z.enum(["", ...CONDITIONS]),
	gradingCompany: z.enum(["", ...GRADERS]),
	grade: z.string().refine(isGradeOrEmpty, "0-10"),
	gradingCert: z.string(),
});
/** Inferred form-value type from {@link stackFormSchema}. */
export type StackFormValues = z.infer<typeof stackFormSchema>;
