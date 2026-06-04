import type {
	Stack,
	StackPatch,
	EditableStackFields,
} from "../../store/userland/types";
import type { StackFormValues } from "./stack-form-schema";

/** Converts a UTC epoch-ms timestamp to a YYYY-MM-DD string using local time. */
export function dayMsToInput(ms: number): string {
	const d = new Date(ms);
	const p = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
/** Parses a YYYY-MM-DD string to a local-midnight epoch-ms value. */
export function inputDayToMs(s: string): number {
	const [y, m, d] = s.split("-").map(Number);
	return new Date(y, m - 1, d).getTime(); // local midnight
}

/** Converts a store Stack into the flat string-keyed form values shape. */
export function itemToForm(i: Stack): StackFormValues {
	return {
		label: i.label ?? "",
		acquiredAt: dayMsToInput(i.acquiredAt),
		pricePaid: i.pricePaid == null ? "" : String(i.pricePaid),
		variant: i.variant ?? "",
		notes: i.notes ?? "",
		state: i.grading ? "graded" : "raw",
		condition: i.condition ?? "",
		gradingCompany:
			(i.grading?.company as StackFormValues["gradingCompany"]) ?? "",
		grade: i.grading?.grade == null ? "" : String(i.grading.grade),
	};
}

/**
 * Converts a complete set of form values to the full editable fields patch.
 * Handles the raw/graded split in one place; used by the draft→Save form.
 */
export function formToPatch(values: StackFormValues): Partial<EditableStackFields> {
	return {
		label: values.label.trim() === "" ? null : values.label.trim(),
		acquiredAt: inputDayToMs(values.acquiredAt),
		pricePaid: values.pricePaid === "" ? null : Number(values.pricePaid),
		variant: values.variant === "" ? null : values.variant,
		notes: values.notes === "" ? null : values.notes,
		condition:
			values.state === "raw" && values.condition !== ""
				? (values.condition as Stack["condition"])
				: null,
		grading:
			values.state === "graded" && values.gradingCompany !== ""
				? {
						company: values.gradingCompany,
						grade: values.grade === "" ? 0 : Number(values.grade),
					}
				: null,
	};
}

/** Map a single changed field to a store patch. Caller supplies the form's current
 *  grading sub-values when persisting gradingCompany/grade (see notes in StackEditForm). */
export function formFieldToPatch(
	field: keyof StackFormValues,
	value: string,
	ctx?: { gradingCompany?: string; grade?: string },
): StackPatch {
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
				condition: value === "" ? null : (value as Stack["condition"]),
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
