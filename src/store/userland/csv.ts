import type { Stack } from "./types";

/** Canonical Cardstack CSV column order (v1). */
export const CSV_COLUMNS = [
	"card_id",
	"card_name",
	"set_id",
	"set_name",
	"number",
	"variant",
	"quantity",
	"condition",
	"grading_company",
	"grading_grade",
	"price_paid_unit",
	"acquired_at",
	"source",
	"storage_location",
	"label",
	"notes",
] as const;

export type CsvMode = "stack" | "copy";
export interface CsvCardInfo {
	name: string;
	setId: string;
	setName: string;
	number: string;
}
export type ResolveCardInfo = (cardId: string) => CsvCardInfo | undefined;

/** ms epoch → YYYY-MM-DD using LOCAL components (matches the form's inputDayToMs so round-trips are stable). */
function ymd(ms: number): string {
	const d = new Date(ms);
	const p = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** RFC-4180 escape: wrap in quotes + double inner quotes when the value has a comma, quote, or newline. */
function esc(v: string): string {
	return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function rowValues(
	s: Stack,
	info?: CsvCardInfo,
): Record<(typeof CSV_COLUMNS)[number], string> {
	return {
		card_id: s.cardId,
		card_name: info?.name ?? "",
		set_id: info?.setId ?? "",
		set_name: info?.setName ?? "",
		number: info?.number ?? "",
		variant: s.variant ?? "",
		quantity: String(s.quantity),
		condition: s.condition ?? "",
		grading_company: s.grading?.company ?? "",
		grading_grade: s.grading == null ? "" : String(s.grading.grade),
		price_paid_unit: s.pricePaid == null ? "" : String(s.pricePaid),
		acquired_at: ymd(s.acquiredAt),
		source: s.source ?? "",
		storage_location: s.storageLocation ?? "",
		label: s.label ?? "",
		notes: s.notes ?? "",
	};
}

/** Serialize stacks to a CSV string. "copy" mode explodes quantity into rows of 1. */
export function stacksToCsv(
	stacks: Stack[],
	mode: CsvMode,
	resolve?: ResolveCardInfo,
): string {
	const lines = [CSV_COLUMNS.join(",")];
	for (const s of stacks) {
		const info = resolve?.(s.cardId);
		if (mode === "copy") {
			for (let i = 0; i < s.quantity; i++) {
				const v = rowValues({ ...s, quantity: 1 }, info);
				lines.push(CSV_COLUMNS.map((c) => esc(v[c])).join(","));
			}
		} else {
			const v = rowValues(s, info);
			lines.push(CSV_COLUMNS.map((c) => esc(v[c])).join(","));
		}
	}
	return `${lines.join("\n")}\n`;
}

/** Suggested CSV download filename, e.g. cardstack-collection-2026-06-04-stack.csv. */
export function csvFilename(now: Date, mode: CsvMode): string {
	return `cardstack-collection-${now.toISOString().slice(0, 10)}-${mode}.csv`;
}

/** Trigger a browser download of a CSV string. DOM-only; not unit-tested. */
export function downloadCsv(csv: string, filename: string): void {
	const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(url);
}
