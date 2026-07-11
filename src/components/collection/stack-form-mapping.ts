import {
	type CardPrinting,
	type CardVariant,
	variantLabel,
} from "../../lib/card-variants";
import {
	inputToMinorUnits,
	minorUnitsToInput,
} from "../../store/userland/money";
import type {
	EditableStackFields,
	Stack,
	StackPatch,
} from "../../store/userland/types";
import { finishForPrinting } from "../../store/userland/valuation";
import { dayMsToInput, inputDayToMs } from "../../utils/day";
import type { StackFormValues } from "./stack-form-schema";

// dayMsToInput / inputDayToMs are defined in src/utils/day.ts (imported above for
// internal use); re-exported here so existing importers of this module keep working.
export { dayMsToInput, inputDayToMs };

/**
 * Resolve the printing picker's initial variantId for a stored printing:
 * the stored variantId when it matches a detailed entry, else the first
 * detailed entry with the same finish (upgrades a CSV/legacy-synthesized
 * printing — empty or stale variantId — to the exact TCGdex one on the next
 * save), else "". Without a detailed list, keep the raw stored variantId.
 */
function initialVariantId(
	printing: CardPrinting | null,
	variantsDetailed?: CardVariant[],
): string {
	if (!variantsDetailed?.length) return printing?.variantId ?? "";
	if (!printing) return "";
	if (
		printing.variantId !== "" &&
		variantsDetailed.some((v) => v.variantId === printing.variantId)
	) {
		return printing.variantId;
	}
	const finish = finishForPrinting(printing);
	if (finish !== null) {
		const match = variantsDetailed.find((v) => finishForPrinting(v) === finish);
		if (match) return match.variantId;
	}
	return "";
}

/** Converts a store Stack into the flat string-keyed form values shape. */
export function itemToForm(
	i: Stack,
	variantsDetailed?: CardVariant[],
): StackFormValues {
	return {
		label: i.label ?? "",
		quantity: String(i.quantity),
		acquiredAt: dayMsToInput(i.acquiredAt),
		pricePaid: minorUnitsToInput(i.pricePaid, i.currency ?? "USD"),
		currency: i.currency ?? "USD",
		language: i.language ?? "en",
		variant: i.variant ?? "",
		variantId: initialVariantId(i.printing ?? null, variantsDetailed),
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
 * the raw/graded split in one place; used by the draft→Save form.
 */
export function formToPatch(
	values: StackFormValues,
	variantsDetailed?: CardVariant[],
	/** Edit-mode context: the stack's current printing + the variantId the form
	 *  opened with. Omitted in create mode (existing = null, initial = ""). */
	ctx?: { existingPrinting: CardPrinting | null; initialVariantId: string },
): EditableStackFields {
	// A picked detailed printing wins: it sets both the structured identity and
	// the display label. Otherwise fall back to the coarse free-text variant.
	const chosen = values.variantId
		? variantsDetailed?.find((v) => v.variantId === values.variantId)
		: undefined;
	// Printing resolution: a matched pick wins; an active clear (the form opened
	// with a real variantId, now "") wipes; anything else PRESERVES the existing
	// printing — untouched edit saves, printings the picker can't represent, and
	// the old wipe bug (non-empty variantId with no variantsDetailed list).
	const printing = chosen
		? chosen
		: values.variantId === "" && (ctx?.initialVariantId ?? "") !== ""
			? null
			: (ctx?.existingPrinting ?? null);
	return {
		label: values.label.trim() === "" ? null : values.label.trim(),
		quantity: Math.max(1, Math.floor(Number(values.quantity)) || 1),
		acquiredAt: inputDayToMs(values.acquiredAt),
		pricePaid: inputToMinorUnits(values.pricePaid, values.currency || "USD"),
		currency: values.currency || "USD",
		language: values.language || "en",
		variant: chosen
			? variantLabel(chosen)
			: values.variant === ""
				? null
				: values.variant,
		printing,
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
	ctx?: {
		gradingCompany?: string;
		grade?: string;
		gradingCert?: string;
		currency?: string;
	},
): StackPatch {
	switch (field) {
		case "quantity":
			return { quantity: Math.max(1, Math.floor(Number(value)) || 1) };
		case "acquiredAt":
			return { acquiredAt: inputDayToMs(value) };
		case "pricePaid":
			return { pricePaid: inputToMinorUnits(value, ctx?.currency ?? "USD") };
		case "currency":
			return { currency: value || "USD" };
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
