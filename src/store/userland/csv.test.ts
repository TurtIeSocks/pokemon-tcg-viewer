import { expect, test } from "bun:test";
import {
	applyMapping,
	CSV_COLUMNS,
	csvFilename,
	csvToImport,
	detectColumns,
	parseCsv,
	stacksToCsv,
} from "./csv";
import type { Stack } from "./types";

function stack(over: Partial<Stack>): Stack {
	return {
		id: "1",
		cardId: "base1-4",
		quantity: 1,
		acquiredAt: 0,
		createdAt: 0,
		label: null,
		pricePaid: null,
		variant: null,
		notes: null,
		condition: null,
		grading: null,
		source: null,
		storageLocation: null,
		...over,
	};
}
const resolve = (id: string) =>
	id === "base1-4"
		? { name: "Charizard", setId: "base1", setName: "Base", number: "4" }
		: undefined;

test("header row matches CSV_COLUMNS", () => {
	const csv = stacksToCsv([], "stack", resolve);
	expect(csv.trim()).toBe(CSV_COLUMNS.join(","));
});

test("per-stack mode emits one row with quantity N", () => {
	const csv = stacksToCsv(
		[stack({ quantity: 5, pricePaid: 2.5 })],
		"stack",
		resolve,
	);
	const lines = csv.trim().split("\n");
	expect(lines).toHaveLength(2);
	expect(lines[1]).toContain("base1-4");
	expect(lines[1]).toContain(",5,"); // quantity
	expect(lines[1]).toContain("2.5"); // per-unit price
});

test("per-copy mode explodes quantity into N rows of 1", () => {
	const csv = stacksToCsv([stack({ quantity: 3 })], "copy", resolve);
	expect(csv.trim().split("\n")).toHaveLength(4); // header + 3
});

test("fields with comma/quote/newline are escaped", () => {
	const csv = stacksToCsv([stack({ notes: 'a, "b"\nc' })], "stack", resolve);
	expect(csv).toContain('"a, ""b""\nc"');
});

test("nulls render as empty cells; acquired_at as YYYY-MM-DD", () => {
	const csv = stacksToCsv(
		[stack({ acquiredAt: new Date(2024, 2, 1).getTime() })],
		"stack",
		resolve,
	);
	const row = csv.trim().split("\n")[1];
	expect(row).toContain("2024-03-01");
});

test("csvFilename includes the date and mode", () => {
	expect(csvFilename(new Date("2026-06-04T00:00:00Z"), "copy")).toBe(
		"cardstack-collection-2026-06-04-copy.csv",
	);
});

const importResolver = {
	exists: (id: string) => id === "base1-4",
	bySetNumber: (setId: string, number: string) =>
		setId === "base1" && number === "4" ? "base1-4" : undefined,
	bySetNameNumber: () => undefined,
};

test("parseCsv reads a header + rows into objects", () => {
	const { rows } = parseCsv("card_id,quantity\nbase1-4,3\n");
	expect(rows[0]).toEqual({ card_id: "base1-4", quantity: "3" });
});

test("csvToImport matches by card_id and builds a NewStack", () => {
	const { matched, unmatched } = csvToImport(
		[
			{
				card_id: "base1-4",
				quantity: "3",
				condition: "NM",
				price_paid_unit: "2.5",
				acquired_at: "2024-03-01",
			},
		],
		importResolver,
	);
	expect(unmatched).toHaveLength(0);
	expect(matched[0]).toMatchObject({
		cardId: "base1-4",
		quantity: 3,
		condition: "NM",
		pricePaid: 2.5,
	});
});

test("csvToImport falls back to set_id + number", () => {
	const { matched } = csvToImport(
		[{ set_id: "base1", number: "4", quantity: "1" }],
		importResolver,
	);
	expect(matched[0].cardId).toBe("base1-4");
});

test("csvToImport reports unmatched rows", () => {
	const { matched, unmatched } = csvToImport(
		[{ card_id: "nope", quantity: "1" }],
		importResolver,
	);
	expect(matched).toHaveLength(0);
	expect(unmatched).toHaveLength(1);
});

test("round-trip: export → parse → import preserves cardId + quantity", () => {
	const csv = stacksToCsv(
		[
			{
				id: "1",
				cardId: "base1-4",
				quantity: 4,
				acquiredAt: 0,
				createdAt: 0,
				label: null,
				pricePaid: null,
				variant: null,
				notes: null,
				condition: null,
				grading: null,
				source: null,
				storageLocation: null,
			},
		],
		"stack",
	);
	const { rows } = parseCsv(csv);
	const { matched } = csvToImport(rows, importResolver);
	expect(matched[0]).toMatchObject({ cardId: "base1-4", quantity: 4 });
});

test("detectColumns maps common foreign headers to canonical fields", () => {
	const map = detectColumns(["Name", "Set", "Card Number", "Qty", "Condition"]);
	expect(map.card_name).toBe("Name");
	expect(map.set_name).toBe("Set");
	expect(map.number).toBe("Card Number");
	expect(map.quantity).toBe("Qty");
	expect(map.condition).toBe("Condition");
});

test("applyMapping rewrites a raw row to canonical keys", () => {
	const map = detectColumns(["Name", "Set", "Card Number", "Qty"]);
	const row = applyMapping(
		{ Name: "Charizard", Set: "Base", "Card Number": "4", Qty: "3" },
		map,
	);
	expect(row.card_name).toBe("Charizard");
	expect(row.set_name).toBe("Base");
	expect(row.number).toBe("4");
	expect(row.quantity).toBe("3");
});

test("detectColumns does not map one header to two fields", () => {
	const map = detectColumns(["name"]);
	expect(map.card_name).toBe("name");
	expect(map.label).toBeUndefined();
});

test("csvToImport matches by set_name + number (normalized)", () => {
	const r = {
		exists: (id: string) => id === "base1-4",
		bySetNumber: () => undefined,
		bySetNameNumber: (setName: string, number: string) =>
			setName.trim().toLowerCase() === "base" && number === "4"
				? "base1-4"
				: undefined,
	};
	const { matched } = csvToImport(
		[{ set_name: "Base", number: "4", quantity: "2" }],
		r,
	);
	expect(matched[0]).toMatchObject({ cardId: "base1-4", quantity: 2 });
});
