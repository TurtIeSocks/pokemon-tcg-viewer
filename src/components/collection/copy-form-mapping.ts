import type { CollectionItem, CopyPatch } from "../../store/userland/types";
import type { CopyFormValues } from "./copy-form-schema";

export function dayMsToInput(ms: number): string {
	const d = new Date(ms);
	const p = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function inputDayToMs(s: string): number {
	const [y, m, d] = s.split("-").map(Number);
	return new Date(y, m - 1, d).getTime(); // local midnight
}

export function itemToForm(i: CollectionItem): CopyFormValues {
	return {
		acquiredAt: dayMsToInput(i.acquiredAt),
		pricePaid: i.pricePaid == null ? "" : String(i.pricePaid),
		variant: i.variant ?? "",
		notes: i.notes ?? "",
		state: i.grading ? "graded" : "raw",
		condition: i.condition ?? "",
		gradingCompany:
			(i.grading?.company as CopyFormValues["gradingCompany"]) ?? "",
		grade: i.grading?.grade == null ? "" : String(i.grading.grade),
	};
}

/** Map a single changed field to a store patch. Caller supplies the form's current
 *  grading sub-values when persisting gradingCompany/grade (see notes in CopyEditForm). */
export function formFieldToPatch(
	field: keyof CopyFormValues,
	value: string,
	ctx?: { gradingCompany?: string; grade?: string },
): CopyPatch {
	switch (field) {
		case "acquiredAt":
			return { acquiredAt: inputDayToMs(value) };
		case "pricePaid":
			return { pricePaid: value === "" ? null : Number(value) };
		case "variant":
			return { variant: value === "" ? null : value };
		case "notes":
			return { notes: value === "" ? null : value };
		case "condition":
			return {
				condition: value === "" ? null : (value as CollectionItem["condition"]),
			};
		case "state":
			return value === "raw" ? { grading: null } : { condition: null };
		case "gradingCompany":
		case "grade": {
			const company =
				(field === "gradingCompany" ? value : ctx?.gradingCompany) ?? "";
			const gradeStr = (field === "grade" ? value : ctx?.grade) ?? "";
			if (company === "") return { grading: null };
			return {
				grading: { company, grade: gradeStr === "" ? 0 : Number(gradeStr) },
			};
		}
		default:
			return {};
	}
}
