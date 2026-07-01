import { expect, test } from "bun:test";
import type { Stack } from "../../store/userland/types";
import {
	formFieldToPatch,
	formToPatch,
	inputDayToMs,
	itemToForm,
} from "./stack-form-mapping";

function item(over: Partial<Stack> = {}): Stack {
	return {
		id: "1",
		cardId: "c",
		quantity: 1,
		source: null,
		storageLocation: null,
		acquiredAt: inputDayToMs("2024-03-01"),
		createdAt: 0,
		updatedAt: 0,
		deletedAt: null,
		label: null,
		pricePaid: null,
		currency: "USD",
		language: "en",
		variant: null,
		printing: null,
		notes: null,
		condition: null,
		grading: null,
		isPrimary: false,
		...over,
	};
}

test("itemToForm: raw item with nulls → empty strings + raw state", () => {
	const f = itemToForm(item());
	expect(f.acquiredAt).toBe("2024-03-01");
	expect(f.pricePaid).toBe("");
	expect(f.state).toBe("raw");
	expect(f.condition).toBe("");
});

test("itemToForm: graded item → graded state + company/grade", () => {
	const f = itemToForm(
		item({ grading: { company: "PSA", grade: 10, cert: null } }),
	);
	expect(f.state).toBe("graded");
	expect(f.gradingCompany).toBe("PSA");
	expect(f.grade).toBe("10");
});

test("formFieldToPatch: price '' clears, '5' → 500 cents", () => {
	expect(formFieldToPatch("pricePaid", "")).toEqual({ pricePaid: null });
	expect(formFieldToPatch("pricePaid", "5")).toEqual({ pricePaid: 500 });
});

test("formFieldToPatch: switching to raw clears grading; graded clears condition", () => {
	expect(formFieldToPatch("state", "raw")).toEqual({ grading: null });
	expect(formFieldToPatch("state", "graded")).toEqual({ condition: null });
});

test("formFieldToPatch: acquiredAt date → ms midnight", () => {
	expect(formFieldToPatch("acquiredAt", "2024-03-01")).toEqual({
		acquiredAt: inputDayToMs("2024-03-01"),
	});
});

test("formFieldToPatch: condition non-empty → condition value", () => {
	expect(formFieldToPatch("condition", "NM")).toEqual({ condition: "NM" });
});

test("formFieldToPatch: condition empty → null", () => {
	expect(formFieldToPatch("condition", "")).toEqual({ condition: null });
});

test("formFieldToPatch: notes non-empty → notes value", () => {
	expect(formFieldToPatch("notes", "Near mint")).toEqual({
		notes: "Near mint",
	});
});

test("formFieldToPatch: notes empty → null", () => {
	expect(formFieldToPatch("notes", "")).toEqual({ notes: null });
});

test("formFieldToPatch: variant non-empty → variant value", () => {
	expect(formFieldToPatch("variant", "Holo")).toEqual({ variant: "Holo" });
});

test("formFieldToPatch: variant empty → null", () => {
	expect(formFieldToPatch("variant", "")).toEqual({ variant: null });
});

test("formFieldToPatch: gradingCompany with company + grade ctx → grading object", () => {
	expect(
		formFieldToPatch("gradingCompany", "PSA", {
			gradingCompany: "PSA",
			grade: "10",
			gradingCert: "",
		}),
	).toEqual({ grading: { company: "PSA", grade: 10, cert: null } });
});

test("formFieldToPatch: gradingCompany empty company → clears grading", () => {
	expect(formFieldToPatch("gradingCompany", "", {})).toEqual({ grading: null });
});

test("formFieldToPatch: grade with grading ctx → grading object", () => {
	expect(
		formFieldToPatch("grade", "9", {
			gradingCompany: "BGS",
			grade: "9",
			gradingCert: "X1",
		}),
	).toEqual({ grading: { company: "BGS", grade: 9, cert: "X1" } });
});

test("formFieldToPatch: grade with empty grade → defaults to 0", () => {
	expect(
		formFieldToPatch("grade", "", {
			gradingCompany: "PSA",
			grade: "",
			gradingCert: "",
		}),
	).toEqual({ grading: { company: "PSA", grade: 0, cert: null } });
});

test("formFieldToPatch: grade with missing company → clears grading", () => {
	expect(formFieldToPatch("grade", "9", {})).toEqual({ grading: null });
});

test("itemToForm maps quantity (string), source, storageLocation", () => {
	const f = itemToForm(
		item({ quantity: 7, source: "eBay", storageLocation: "Box 1" }),
	);
	expect(f.quantity).toBe("7");
	expect(f.source).toBe("eBay");
	expect(f.storageLocation).toBe("Box 1");
});

test("itemToForm: quantity defaults to '1'; null provenance → empty strings", () => {
	const f = itemToForm(item());
	expect(f.quantity).toBe("1");
	expect(f.source).toBe("");
	expect(f.storageLocation).toBe("");
});

test("formToPatch maps quantity (clamped >=1) and trims provenance to null", () => {
	const base = itemToForm(item());
	const patch = formToPatch({
		...base,
		quantity: "10",
		source: "  ",
		storageLocation: "Box 1",
	});
	expect(patch.quantity).toBe(10);
	expect(patch.source).toBeNull();
	expect(patch.storageLocation).toBe("Box 1");
	expect(formToPatch({ ...base, quantity: "0" }).quantity).toBe(1);
});

test("formFieldToPatch: quantity / source / storageLocation", () => {
	expect(formFieldToPatch("quantity", "5")).toEqual({ quantity: 5 });
	expect(formFieldToPatch("source", "")).toEqual({ source: null });
	expect(formFieldToPatch("storageLocation", "Box 9")).toEqual({
		storageLocation: "Box 9",
	});
});

// --- v5: language + gradingCert ---

test("itemToForm: language maps to language field", () => {
	const f = itemToForm(item({ language: "ja" }));
	expect(f.language).toBe("ja");
});

test("itemToForm: null/missing language defaults to 'en'", () => {
	const f = itemToForm(item());
	expect(f.language).toBe("en");
});

test("itemToForm: graded item with cert populates gradingCert", () => {
	const f = itemToForm(
		item({ grading: { company: "PSA", grade: 10, cert: "CERT123" } }),
	);
	expect(f.gradingCert).toBe("CERT123");
});

test("itemToForm: graded item with null cert → empty gradingCert string", () => {
	const f = itemToForm(
		item({ grading: { company: "PSA", grade: 10, cert: null } }),
	);
	expect(f.gradingCert).toBe("");
});

test("formToPatch: language included in patch output", () => {
	const base = itemToForm(item());
	const patch = formToPatch({ ...base, language: "de" });
	expect(patch.language).toBe("de");
});

test("formFieldToPatch: language → language patch", () => {
	expect(formFieldToPatch("language", "fr")).toEqual({ language: "fr" });
});

test("formFieldToPatch: gradingCert in ctx folds into grading cert", () => {
	expect(
		formFieldToPatch("gradingCert", "CERT42", {
			gradingCompany: "PSA",
			grade: "10",
			gradingCert: "CERT42",
		}),
	).toEqual({ grading: { company: "PSA", grade: 10, cert: "CERT42" } });
});

test("formFieldToPatch: empty gradingCert → cert: null in grading", () => {
	expect(
		formFieldToPatch("gradingCert", "", {
			gradingCompany: "PSA",
			grade: "9",
			gradingCert: "",
		}),
	).toEqual({ grading: { company: "PSA", grade: 9, cert: null } });
});
