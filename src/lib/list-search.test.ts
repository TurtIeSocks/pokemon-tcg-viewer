import { expect, test } from "bun:test";
import { listSearchToUrl, validateListSearch } from "./list-search";

test("owned validates + serializes", () => {
	expect(validateListSearch({}).owned).toBe("all");
	expect(validateListSearch({ owned: "owned" }).owned).toBe("owned");
	expect(validateListSearch({ owned: "junk" }).owned).toBe("all");
	expect(listSearchToUrl({ owned: "missing" }).owned).toBe("missing");
	expect(listSearchToUrl({ owned: "all" }).owned).toBeUndefined();
});

test("yearMin/yearMax: null → omitted from URL", () => {
	expect(listSearchToUrl({ yearMin: null }).yearMin).toBeUndefined();
	expect(listSearchToUrl({ yearMax: null }).yearMax).toBeUndefined();
});

test("yearMin/yearMax: number → string in URL", () => {
	expect(listSearchToUrl({ yearMin: 2020 }).yearMin).toBe("2020");
	expect(listSearchToUrl({ yearMax: 2023 }).yearMax).toBe("2023");
});

test("yearMin/yearMax: validate round-trips number", () => {
	expect(
		validateListSearch({ yearMin: "2020", yearMax: "2023" }),
	).toMatchObject({
		yearMin: 2020,
		yearMax: 2023,
	});
});

test("yearMin/yearMax: accepts the numeric form TanStack's parser produces", () => {
	// `?yearMin=2020` is JSON-parsed to the *number* 2020 on a cold load — the
	// validator must accept that, not only the string form an in-page merge sends.
	expect(validateListSearch({ yearMin: 2020, yearMax: 2024 })).toMatchObject({
		yearMin: 2020,
		yearMax: 2024,
	});
});

test("yearMin/yearMax: rejects non-string/number shapes", () => {
	expect(validateListSearch({ yearMin: null }).yearMin).toBeNull();
	expect(validateListSearch({ yearMin: true }).yearMin).toBeNull();
	expect(validateListSearch({ yearMax: ["2020"] }).yearMax).toBeNull();
});

test("yearMin/yearMax: validate treats empty/NaN as null", () => {
	expect(validateListSearch({}).yearMin).toBeNull();
	expect(validateListSearch({}).yearMax).toBeNull();
	expect(validateListSearch({ yearMin: "" }).yearMin).toBeNull();
	expect(validateListSearch({ yearMax: "abc" }).yearMax).toBeNull();
});

test("yearMin/yearMax: full round-trip serialize → parse", () => {
	const serialized = listSearchToUrl({ yearMin: 1999, yearMax: 2006 });
	const parsed = validateListSearch(serialized);
	expect(parsed.yearMin).toBe(1999);
	expect(parsed.yearMax).toBe(2006);
});

test("yearMin/yearMax: rejects non-finite values (Infinity, overflow)", () => {
	expect(validateListSearch({ yearMin: "Infinity" }).yearMin).toBeNull();
	expect(validateListSearch({ yearMax: "-Infinity" }).yearMax).toBeNull();
	// Number("1e999") overflows to Infinity — must also be rejected.
	expect(validateListSearch({ yearMin: "1e999" }).yearMin).toBeNull();
});

test("exact: defaults to false", () => {
	expect(validateListSearch({}).exact).toBe(false);
});

test("exact: validates from URL string and boolean", () => {
	expect(validateListSearch({ exact: "true" }).exact).toBe(true);
	expect(validateListSearch({ exact: true }).exact).toBe(true);
	expect(validateListSearch({ exact: "false" }).exact).toBe(false);
	expect(validateListSearch({ exact: "junk" }).exact).toBe(false);
});

test("exact: true → 'true' in URL, false → omitted (stays default-stripped)", () => {
	expect(listSearchToUrl({ exact: true }).exact).toBe("true");
	expect(listSearchToUrl({ exact: false }).exact).toBeUndefined();
});

test("exact: full round-trip serialize → parse", () => {
	expect(validateListSearch(listSearchToUrl({ exact: true })).exact).toBe(true);
});
