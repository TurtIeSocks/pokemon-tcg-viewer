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
