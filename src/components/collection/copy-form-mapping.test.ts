import { expect, test } from "bun:test";
import type { CollectionItem } from "../../store/userland/types";
import {
	formFieldToPatch,
	inputDayToMs,
	itemToForm,
} from "./copy-form-mapping";

function item(over: Partial<CollectionItem> = {}): CollectionItem {
	return {
		id: "1",
		cardId: "c",
		acquiredAt: inputDayToMs("2024-03-01"),
		createdAt: 0,
		pricePaid: null,
		variant: null,
		notes: null,
		condition: null,
		grading: null,
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
	const f = itemToForm(item({ grading: { company: "PSA", grade: 10 } }));
	expect(f.state).toBe("graded");
	expect(f.gradingCompany).toBe("PSA");
	expect(f.grade).toBe("10");
});

test("formFieldToPatch: price '' clears, '5' → 5", () => {
	expect(formFieldToPatch("pricePaid", "")).toEqual({ pricePaid: null });
	expect(formFieldToPatch("pricePaid", "5")).toEqual({ pricePaid: 5 });
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
