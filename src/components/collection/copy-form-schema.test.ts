import { expect, test } from "bun:test";
import {
	copyFormSchema,
	isGradeOrEmpty,
	isMoneyOrEmpty,
	isValidDateStr,
} from "./copy-form-schema";

test("predicates", () => {
	expect(isValidDateStr("2024-03-01")).toBe(true);
	expect(isValidDateStr("nope")).toBe(false);
	expect(isMoneyOrEmpty("")).toBe(true);
	expect(isMoneyOrEmpty("0")).toBe(true);
	expect(isMoneyOrEmpty("5.5")).toBe(true);
	expect(isMoneyOrEmpty("-1")).toBe(false);
	expect(isMoneyOrEmpty("x")).toBe(false);
	expect(isGradeOrEmpty("")).toBe(true);
	expect(isGradeOrEmpty("10")).toBe(true);
	expect(isGradeOrEmpty("11")).toBe(false);
});

test("schema accepts a valid raw copy and rejects bad price", () => {
	const base = {
		label: "",
		acquiredAt: "2024-03-01",
		pricePaid: "5",
		variant: "",
		notes: "",
		state: "raw" as const,
		condition: "NM" as const,
		gradingCompany: "" as const,
		grade: "",
	};
	expect(copyFormSchema.safeParse(base).success).toBe(true);
	expect(copyFormSchema.safeParse({ ...base, pricePaid: "-3" }).success).toBe(
		false,
	);
});
