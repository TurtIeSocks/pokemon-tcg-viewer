import {
	inputToMinorUnits,
	minorUnitsToInput,
} from "../../store/userland/money";
import type {
	EditableStackFields,
	Stack,
	StackPatch,
} from "../../store/userland/types";
import { dayMsToInput, inputDayToMs } from "../../utils/day";
import type { StackFormValues } from "./stack-form-schema";

// dayMsToInput / inputDayToMs are defined in src/utils/day.ts (imported above for
// internal use); re-exported here so existing importers of this module keep working.
export { dayMsToInput, inputDayToMs };

/** Converts a store Stack into the flat string-keyed form values shape. */
export function itemToForm(i: Stack): StackFormValues {
	return {
		label: i.label ?? "",
		quantity: String(i.quantity),
		acquiredAt: dayMsToInput(i.acquiredAt),
		pricePaid: minorUnitsToInput(i.pricePaid),
		language: i.language ?? "en",
		variant: i.variant ?? "",
		notes: i.notes ?? "",
		source: i.source ?? "",
		storageLocation: i.storageLocation ?? "",
		state: i.grading ? "graded" : "raw",
		condition: i.condition ?? "",
		gradingCompany:
			(i.grading?.company as StackFormValues["gradingCompany"]) ?? "",
		grade: i.grading?.grade == null ? "" : String(i.grading.grade),
		gradingCert: i.grading?.cert ?? "",
	};
}

/**
 * Converts a complete set of form values to the editable fields patch. Handles
 * the raw/graded split in one place; used by the draft→Save form. Omits
 * `currency`: the form has no currency input yet, so editing a stack must never
 * clobber its currency (new stacks default to USD via the repo's fillStack).
 */
export function formToPatch(
	values: StackFormValues,
): Omit<EditableStackFields, "currency"> {
	return {
		label: values.label.trim() === "" ? null : values.label.trim(),
		quantity: Math.max(1, Math.floor(Number(values.quantity)) || 1),
		acquiredAt: inputDayToMs(values.acquiredAt),
		pricePaid: inputToMinorUnits(values.pricePaid),
		language: values.language || "en",
		variant: values.variant === "" ? null : values.variant,
		// PLACEHOLDER: a later task upgrades this to resolve the real printing
		// from the selected variant; for now the form doesn't collect it.
		printing: null,
		notes: values.notes === "" ? null : values.notes,
		source: values.source.trim() === "" ? null : values.source.trim(),
		storageLocation:
			values.storageLocation.trim() === ""
				? null
				: values.storageLocation.trim(),
		condition:
			values.state === "raw" && values.condition !== ""
				? (values.condition as Stack["condition"])
				: null,
		grading:
			values.state === "graded" && values.gradingCompany !== ""
				? {
						company: values.gradingCompany,
						grade: values.grade === "" ? 0 : Number(values.grade),
						cert: values.gradingCert.trim() || null,
					}
				: null,
	};
}

/** Map a single changed field to a store patch. Caller supplies the form's current
 *  grading sub-values when persisting gradingCompany/grade/gradingCert (see notes in StackEditForm). */
export function formFieldToPatch(
	field: keyof StackFormValues,
	value: string,
	ctx?: { gradingCompany?: string; grade?: string; gradingCert?: string },
): StackPatch {
	switch (field) {
		case "quantity":
			return { quantity: Math.max(1, Math.floor(Number(value)) || 1) };
		case "acquiredAt":
			return { acquiredAt: inputDayToMs(value) };
		case "pricePaid":
			return { pricePaid: inputToMinorUnits(value) };
		case "language":
			return { language: value || "en" };
		case "source":
			return { source: value.trim() === "" ? null : value.trim() };
		case "storageLocation":
			return {
				storageLocation: value.trim() === "" ? null : value.trim(),
			};
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
		case "grade":
		case "gradingCert": {
			const company =
				(field === "gradingCompany" ? value : ctx?.gradingCompany) ?? "";
			const gradeStr = (field === "grade" ? value : ctx?.grade) ?? "";
			const certStr =
				(field === "gradingCert" ? value : ctx?.gradingCert) ?? "";
			if (company === "") return { grading: null };
			return {
				grading: {
					company,
					grade: gradeStr === "" ? 0 : Number(gradeStr),
					cert: certStr.trim() || null,
				},
			};
		}
		default:
			return {};
	}
}
