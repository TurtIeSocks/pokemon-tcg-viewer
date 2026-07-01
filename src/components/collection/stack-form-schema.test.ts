import { expect, test } from "bun:test";
import {
	isGradeOrEmpty,
	isMoneyOrEmpty,
	isValidDateStr,
	stackFormSchema,
} from "./stack-form-schema";

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

test("schema accepts a valid raw stack and rejects bad price", () => {
	const base = {
		label: "",
		quantity: "1",
		acquiredAt: "2024-03-01",
		pricePaid: "5",
		language: "en",
		variant: "",
		variantId: "",
		notes: "",
		source: "",
		storageLocation: "",
		state: "raw" as const,
		condition: "NM" as const,
		gradingCompany: "" as const,
		grade: "",
		gradingCert: "",
	};
	expect(stackFormSchema.safeParse(base).success).toBe(true);
	expect(stackFormSchema.safeParse({ ...base, pricePaid: "-3" }).success).toBe(
		false,
	);
	expect(stackFormSchema.safeParse({ ...base, quantity: "0" }).success).toBe(
		false,
	);
	expect(stackFormSchema.safeParse({ ...base, quantity: "x" }).success).toBe(
		false,
	);
});
