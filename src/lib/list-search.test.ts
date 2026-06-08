import { expect, test } from "bun:test";
import {
	LIST_SEARCH_DEFAULTS,
	listSearchToUrl,
	validateListSearch,
} from "./list-search";

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

test("pokemon: defaults to null", () => {
	expect(LIST_SEARCH_DEFAULTS.pokemon).toBeNull();
});

test("pokemon: validates a dex number from number or string", () => {
	expect(validateListSearch({ pokemon: 112 }).pokemon).toBe(112);
	expect(validateListSearch({ pokemon: "112" }).pokemon).toBe(112);
});

test("pokemon: rejects out-of-range / junk → null", () => {
	expect(validateListSearch({ pokemon: 0 }).pokemon).toBeNull();
	expect(validateListSearch({ pokemon: 9999 }).pokemon).toBeNull();
	expect(validateListSearch({ pokemon: "abc" }).pokemon).toBeNull();
	expect(validateListSearch({ pokemon: 1.5 }).pokemon).toBeNull();
	expect(validateListSearch({}).pokemon).toBeNull();
});

test("pokemon: serializes to URL string, omits when null", () => {
	expect(listSearchToUrl({ pokemon: 112 }).pokemon).toBe("112");
	expect(listSearchToUrl({ pokemon: null }).pokemon).toBeUndefined();
});

test("pokemon: full round-trip serialize → parse", () => {
	expect(validateListSearch(listSearchToUrl({ pokemon: 6 })).pokemon).toBe(6);
});

test("mode: defaults to 'fuzzy'", () => {
	expect(validateListSearch({}).mode).toBe("fuzzy");
});

test("mode: validates the three valid values from URL string", () => {
	expect(validateListSearch({ mode: "exact" }).mode).toBe("exact");
	expect(validateListSearch({ mode: "contains" }).mode).toBe("contains");
	expect(validateListSearch({ mode: "fuzzy" }).mode).toBe("fuzzy");
});

test("mode: unknown value falls back to 'fuzzy'", () => {
	expect(validateListSearch({ mode: "true" }).mode).toBe("fuzzy");
	expect(validateListSearch({ mode: "junk" }).mode).toBe("fuzzy");
	expect(validateListSearch({ mode: true }).mode).toBe("fuzzy");
});

test("mode: 'fuzzy' → omitted from URL (default-stripped); others → serialized", () => {
	expect(listSearchToUrl({ mode: "fuzzy" }).mode).toBeUndefined();
	expect(listSearchToUrl({ mode: "exact" }).mode).toBe("exact");
	expect(listSearchToUrl({ mode: "contains" }).mode).toBe("contains");
});

test("mode: full round-trip serialize → parse", () => {
	expect(validateListSearch(listSearchToUrl({ mode: "exact" })).mode).toBe(
		"exact",
	);
	expect(validateListSearch(listSearchToUrl({ mode: "contains" })).mode).toBe(
		"contains",
	);
});
