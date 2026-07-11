import Papa from "papaparse";
import { printingFromVariantText } from "../../lib/card-variants";
import { dayMsToInput } from "../../utils/day";
import { inputToMinorUnits, minorUnitsToInput } from "./money";
import type { CardCondition, NewStack, Stack } from "./types";

/** Canonical Cardstack CSV column order (v1). price_paid_unit is in MAJOR units (dollars); currency added alongside it. */
export const CSV_COLUMNS = [
	"card_id",
	"card_name",
	"set_id",
	"set_name",
	"number",
	"language",
	"variant",
	"quantity",
	"condition",
	"grading_company",
	"grading_grade",
	"grading_cert",
	"price_paid_unit",
	"currency",
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
		language: s.language,
		variant: s.variant ?? "",
		quantity: String(s.quantity),
		condition: s.condition ?? "",
		grading_company: s.grading?.company ?? "",
		grading_grade: s.grading == null ? "" : String(s.grading.grade),
		grading_cert: s.grading?.cert ?? "",
		// Stored in minor units; CSV is human-facing + round-trippable, so export
		// major units scaled by the stack's own currency exponent.
		price_paid_unit: minorUnitsToInput(s.pricePaid, s.currency),
		currency: s.pricePaid == null ? "" : s.currency,
		acquired_at: dayMsToInput(s.acquiredAt),
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

// --- Column mapping (universal import) ---

export type CanonicalField = (typeof CSV_COLUMNS)[number];
export type ColumnMap = Partial<Record<CanonicalField, string>>;

const ALIASES: Record<CanonicalField, string[]> = {
	card_id: ["card_id", "id", "cardstack_id"],
	card_name: ["card_name", "name", "card"],
	set_id: ["set_id", "set_code"],
	set_name: ["set_name", "set", "expansion", "series"],
	number: ["number", "card_number", "no", "collector_number", "card_no"],
	language: ["language", "lang"],
	variant: ["variant", "printing", "foil", "finish", "edition"],
	quantity: ["quantity", "qty", "count", "amount", "have", "haves", "owned"],
	condition: ["condition", "cond"],
	grading_company: ["grading_company", "grader", "grading"],
	grading_grade: ["grading_grade", "grade"],
	grading_cert: [
		"grading_cert",
		"cert",
		"certification",
		"cert_number",
		"serial",
	],
	price_paid_unit: ["price_paid_unit", "price", "price_paid", "paid", "cost"],
	currency: ["currency", "curr", "ccy"],
	acquired_at: ["acquired_at", "acquired", "date", "purchase_date"],
	source: ["source", "seller", "acquired_from"],
	storage_location: [
		"storage_location",
		"location",
		"binder",
		"box",
		"storage",
	],
	label: ["label", "title"],
	notes: ["notes", "note", "comment", "comments"],
};

function normalizeHeader(h: string): string {
	return h
		.trim()
		.toLowerCase()
		.replace(/[\s\-.]+/g, "_")
		.replace(/[()]/g, "");
}

/** Auto-map source headers to canonical fields by alias; never maps one header to two fields. */
export function detectColumns(headers: string[]): ColumnMap {
	const norm = headers.map((h) => ({ raw: h, n: normalizeHeader(h) }));
	const used = new Set<string>();
	const map: ColumnMap = {};
	for (const field of CSV_COLUMNS) {
		for (const alias of ALIASES[field]) {
			const hit = norm.find((h) => h.n === alias && !used.has(h.raw));
			if (hit) {
				map[field] = hit.raw;
				used.add(hit.raw);
				break;
			}
		}
	}
	return map;
}

/** Rewrite a raw CSV row into canonical-keyed values using a column map. */
export function applyMapping(
	row: Record<string, string>,
	map: ColumnMap,
): Record<CanonicalField, string> {
	const out = {} as Record<CanonicalField, string>;
	for (const field of CSV_COLUMNS) {
		const src = map[field];
		out[field] = src ? (row[src] ?? "") : "";
	}
	return out;
}

/** Normalize a set name for fuzzy matching: lowercase, &→and, strip punctuation + filler words (the/set/expansion). */
export function normalizeSetName(s: string): string {
	return s
		.trim()
		.toLowerCase()
		.replace(/&/g, " and ")
		.replace(/[^a-z0-9]+/g, " ")
		.replace(/\b(the|set|expansion)\b/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

// --- Import ---

/** Resolves a CSV row to a corpus cardId. Built from the corpus index in the UI; faked in tests. */
export interface ImportResolver {
	exists(cardId: string): boolean;
	bySetNumber(setId: string, number: string): string | undefined;
	bySetNameNumber(setName: string, number: string): string | undefined;
}
export interface CsvImportResult {
	matched: NewStack[];
	unmatched: { row: Record<string, string>; reason: string }[];
}

const CONDITIONS = new Set(["NM", "LP", "MP", "HP", "DMG"]);

/** YYYY-MM-DD → local-midnight ms (mirrors the form's inputDayToMs); null when malformed. */
function ymdToMs(s: string): number | null {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
	const [y, m, d] = s.split("-").map(Number);
	const t = new Date(y, m - 1, d).getTime();
	return Number.isNaN(t) ? null : t;
}

/** Parse a CSV string into header-keyed row objects (trims headers, skips blank lines). */
export function parseCsv(text: string): {
	rows: Record<string, string>[];
	errors: string[];
} {
	const out = Papa.parse<Record<string, string>>(text, {
		header: true,
		skipEmptyLines: true,
		transformHeader: (h) => h.trim(),
	});
	return { rows: out.data, errors: out.errors.map((e) => e.message) };
}

function num(v: string | undefined): number | null {
	if (v == null || v.trim() === "") return null;
	const n = Number(v);
	return Number.isFinite(n) ? n : null;
}

/** Resolve a canonical-keyed CSV row to a corpus cardId (card_id → set_id+number → fuzzy set_name+number), or null. */
export function matchRow(
	row: Record<string, string>,
	r: ImportResolver,
): string | null {
	const id = row.card_id?.trim();
	if (id && r.exists(id)) return id;
	const number = row.number?.trim();
	if (!number) return null;
	const setId = row.set_id?.trim();
	if (setId) {
		const m = r.bySetNumber(setId, number);
		if (m) return m;
	}
	const setName = row.set_name?.trim();
	if (setName) {
		const m = r.bySetNameNumber(setName, number);
		if (m) return m;
	}
	return null;
}

/** Build a NewStack from a matched cardId + a canonical-keyed CSV row. */
export function rowToNewStack(
	cardId: string,
	row: Record<string, string>,
): NewStack {
	const qty = num(row.quantity);
	const company = row.grading_company?.trim();
	const grade = num(row.grading_grade);
	const cert = row.grading_cert?.trim() || null;
	const cond = row.condition?.trim();
	const acquired = row.acquired_at ? ymdToMs(row.acquired_at) : null;
	return {
		cardId,
		quantity: qty && qty >= 1 ? Math.floor(qty) : 1,
		...(acquired != null ? { acquiredAt: acquired } : {}),
		// CSV price is in major units; store minor units scaled by the row's own
		// currency (defaults USD when blank).
		pricePaid: inputToMinorUnits(
			row.price_paid_unit ?? "",
			row.currency?.trim() || "USD",
		),
		currency: row.currency?.trim() || "USD",
		language: row.language?.trim() || "en",
		// Raw source text stays in `variant` for display; recognized finish
		// tokens also synthesize a structured printing for exact pricing.
		variant: row.variant?.trim() || null,
		printing: printingFromVariantText(row.variant ?? ""),
		notes: row.notes?.trim() || null,
		condition: cond && CONDITIONS.has(cond) ? (cond as CardCondition) : null,
		grading: company ? { company, grade: grade ?? 0, cert } : null,
		source: row.source?.trim() || null,
		storageLocation: row.storage_location?.trim() || null,
		label: row.label?.trim() || null,
	};
}

/** Map parsed CSV rows to NewStacks via the resolver; collect unmatched rows. */
export function csvToImport(
	rows: Record<string, string>[],
	resolve: ImportResolver,
): CsvImportResult {
	const matched: NewStack[] = [];
	const unmatched: CsvImportResult["unmatched"] = [];
	for (const row of rows) {
		const cardId = matchRow(row, resolve);
		if (!cardId) {
			unmatched.push({ row, reason: "No matching card" });
			continue;
		}
		matched.push(rowToNewStack(cardId, row));
	}
	return { matched, unmatched };
}
