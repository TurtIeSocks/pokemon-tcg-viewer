import { expect, test } from "bun:test";
import {
	applyMapping,
	CSV_COLUMNS,
	csvFilename,
	csvToImport,
	detectColumns,
	matchRow,
	normalizeSetName,
	parseCsv,
	rowToNewStack,
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
		source: null,
		storageLocation: null,
		isPrimary: false,
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
		[stack({ quantity: 5, pricePaid: 250 })], // 250 cents = $2.50
		"stack",
		resolve,
	);
	const lines = csv.trim().split("\n");
	expect(lines).toHaveLength(2);
	expect(lines[1]).toContain("base1-4");
	expect(lines[1]).toContain(",5,"); // quantity
	expect(lines[1]).toContain("2.5"); // per-unit price exported in dollars
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
		pricePaid: 250, // "2.5" dollars parsed to cents
		currency: "USD",
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
	const csv = stacksToCsv([stack({ cardId: "base1-4", quantity: 4 })], "stack");
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

test("normalizeSetName collapses noise so 'Base' and 'Base Set' match", () => {
	expect(normalizeSetName("Base Set")).toBe(normalizeSetName("Base"));
	expect(normalizeSetName("Sword & Shield")).toBe("sword and shield");
	expect(normalizeSetName("XY: Evolutions")).toBe("xy evolutions");
});

test("matchRow + rowToNewStack expose the per-row import pieces", () => {
	expect(matchRow({ card_id: "base1-4" }, importResolver)).toBe("base1-4");
	expect(matchRow({ card_id: "nope" }, importResolver)).toBeNull();
	expect(
		rowToNewStack("base1-4", { quantity: "3", condition: "NM" }),
	).toMatchObject({ cardId: "base1-4", quantity: 3, condition: "NM" });
});

// --- v5: language + grading_cert CSV columns ---

test("CSV_COLUMNS includes language and grading_cert", () => {
	expect(CSV_COLUMNS).toContain("language");
	expect(CSV_COLUMNS).toContain("grading_cert");
});

test("header row contains language and grading_cert", () => {
	const csv = stacksToCsv([], "stack", resolve);
	const header = csv.trim();
	expect(header).toContain("language");
	expect(header).toContain("grading_cert");
});

test("stacksToCsv exports language and grading_cert", () => {
	const csv = stacksToCsv(
		[
			stack({
				language: "ja",
				grading: { company: "PSA", grade: 10, cert: "12345" },
			}),
		],
		"stack",
		resolve,
	);
	const lines = csv.trim().split("\n");
	const headers = lines[0].split(",");
	const row = lines[1].split(",");
	const langIdx = headers.indexOf("language");
	const certIdx = headers.indexOf("grading_cert");
	expect(row[langIdx]).toBe("ja");
	expect(row[certIdx]).toBe("12345");
});

test("rowToNewStack: language field imports correctly; missing defaults to 'en'", () => {
	const withLang = rowToNewStack("base1-4", { language: "ja" });
	expect(withLang.language).toBe("ja");
	const defaultLang = rowToNewStack("base1-4", {});
	expect(defaultLang.language).toBe("en");
});

test("rowToNewStack: grading_cert is imported into grading.cert", () => {
	const withCert = rowToNewStack("base1-4", {
		grading_company: "PSA",
		grading_grade: "10",
		grading_cert: "ABCDE",
	});
	expect(withCert.grading?.cert).toBe("ABCDE");
});

test("rowToNewStack: empty grading_cert → null", () => {
	const noCert = rowToNewStack("base1-4", {
		grading_company: "PSA",
		grading_grade: "10",
		grading_cert: "",
	});
	expect(noCert.grading?.cert).toBeNull();
});

test("detectColumns maps 'Language' to language", () => {
	const map = detectColumns(["Language"]);
	expect(map.language).toBe("Language");
});

test("detectColumns maps cert aliases to grading_cert", () => {
	expect(detectColumns(["cert"]).grading_cert).toBe("cert");
	expect(detectColumns(["certification"]).grading_cert).toBe("certification");
	expect(detectColumns(["cert_number"]).grading_cert).toBe("cert_number");
	expect(detectColumns(["serial"]).grading_cert).toBe("serial");
});

test("round-trip: language and grading_cert survive export → parse → import", () => {
	const s = stack({
		language: "fr",
		grading: { company: "CGC", grade: 9.5, cert: "CERT99" },
	});
	const csv = stacksToCsv([s], "stack", resolve);
	const { rows } = parseCsv(csv);
	const ns = rowToNewStack("base1-4", rows[0]);
	expect(ns.language).toBe("fr");
	expect(ns.grading?.cert).toBe("CERT99");
});

// --- currency: exponent-aware CSV export/import ---

test("stacksToCsv exports price_paid_unit at the stack's currency exponent (JPY, 0-decimal)", () => {
	const csv = stacksToCsv(
		[stack({ pricePaid: 350, currency: "JPY" })],
		"stack",
		resolve,
	);
	const lines = csv.trim().split("\n");
	const headers = lines[0].split(",");
	const row = lines[1].split(",");
	const priceIdx = headers.indexOf("price_paid_unit");
	const currencyIdx = headers.indexOf("currency");
	expect(row[priceIdx]).toBe("350"); // not "3.5"
	expect(row[currencyIdx]).toBe("JPY");
});

test("rowToNewStack: pricePaid parses at the row's currency exponent (JPY)", () => {
	const ns = rowToNewStack("base1-4", {
		price_paid_unit: "350",
		currency: "JPY",
	});
	expect(ns.pricePaid).toBe(350); // not 35000
	expect(ns.currency).toBe("JPY");
});

test("round-trip: JPY price_paid_unit survives export → parse → import at 350 (not 35000)", () => {
	const s = stack({ pricePaid: 350, currency: "JPY" });
	const csv = stacksToCsv([s], "stack", resolve);
	const { rows } = parseCsv(csv);
	const ns = rowToNewStack("base1-4", rows[0]);
	expect(ns.pricePaid).toBe(350);
	expect(ns.currency).toBe("JPY");
});
