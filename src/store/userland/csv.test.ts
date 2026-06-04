import { expect, test } from "bun:test";
import { CSV_COLUMNS, stacksToCsv } from "./csv";
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
