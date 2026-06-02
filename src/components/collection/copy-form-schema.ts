import { z } from "zod";

export const CONDITIONS = ["NM", "LP", "MP", "HP", "DMG"] as const;
export const GRADERS = ["PSA", "BGS", "CGC", "TAG", "SGC", "Other"] as const;

export function isValidDateStr(s: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
	const t = Date.parse(s);
	return !Number.isNaN(t);
}
export function isMoneyOrEmpty(s: string): boolean {
	if (s === "") return true;
	const n = Number(s);
	return Number.isFinite(n) && n >= 0;
}
export function isGradeOrEmpty(s: string): boolean {
	if (s === "") return true;
	const n = Number(s);
	return Number.isFinite(n) && n >= 0 && n <= 10;
}

export const copyFormSchema = z.object({
	acquiredAt: z.string().refine(isValidDateStr, "Invalid date"),
	pricePaid: z.string().refine(isMoneyOrEmpty, "Must be a number ≥ 0"),
	variant: z.string(),
	notes: z.string(),
	state: z.enum(["raw", "graded"]),
	condition: z.enum(["", ...CONDITIONS]),
	gradingCompany: z.enum(["", ...GRADERS]),
	grade: z.string().refine(isGradeOrEmpty, "0–10"),
});
export type CopyFormValues = z.infer<typeof copyFormSchema>;
