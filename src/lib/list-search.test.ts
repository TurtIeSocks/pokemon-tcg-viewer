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

test("pokemon: defaults to an empty array", () => {
	expect(LIST_SEARCH_DEFAULTS.pokemon).toEqual([]);
});

test("pokemon: validates dex numbers from a CSV string, array, or number", () => {
	expect(validateListSearch({ pokemon: "112" }).pokemon).toEqual([112]);
	expect(validateListSearch({ pokemon: 112 }).pokemon).toEqual([112]);
	expect(validateListSearch({ pokemon: "25,6" }).pokemon).toEqual([25, 6]);
	expect(validateListSearch({ pokemon: [25, 6] }).pokemon).toEqual([25, 6]);
});

test("pokemon: drops out-of-range / non-integer / junk entries", () => {
	expect(validateListSearch({ pokemon: "0" }).pokemon).toEqual([]);
	expect(validateListSearch({ pokemon: "9999" }).pokemon).toEqual([]);
	expect(validateListSearch({ pokemon: "abc" }).pokemon).toEqual([]);
	expect(validateListSearch({ pokemon: "1.5" }).pokemon).toEqual([]);
	// Mixed CSV: keeps the two valid dex numbers, drops junk/out-of-range/zero.
	expect(validateListSearch({ pokemon: "25,foo,9999,0,6" }).pokemon).toEqual([
		25, 6,
	]);
	expect(validateListSearch({}).pokemon).toEqual([]);
});

test("pokemon: serializes to a CSV of dex numbers, omits when empty", () => {
	expect(listSearchToUrl({ pokemon: [112] }).pokemon).toBe("112");
	expect(listSearchToUrl({ pokemon: [25, 6] }).pokemon).toBe("25,6");
	expect(listSearchToUrl({ pokemon: [] }).pokemon).toBeUndefined();
});

test("pokemon: full round-trip serialize → parse (CSV of dex numbers)", () => {
	expect(
		validateListSearch(listSearchToUrl({ pokemon: [25, 6] })).pokemon,
	).toEqual([25, 6]);
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

test("sort: defaults to 'default' and dir to 'asc'", () => {
	expect(LIST_SEARCH_DEFAULTS.sort).toBe("default");
	expect(LIST_SEARCH_DEFAULTS.dir).toBe("asc");
});
test("sort: validates the modes from the URL, else 'default'", () => {
	expect(validateListSearch({ sort: "name" }).sort).toBe("name");
	expect(validateListSearch({ sort: "dex" }).sort).toBe("dex");
	expect(validateListSearch({ sort: "number" }).sort).toBe("number");
	expect(validateListSearch({ sort: "released" }).sort).toBe("released");
	expect(validateListSearch({ sort: "junk" }).sort).toBe("default");
});
test("dir: validates 'desc', else 'asc'", () => {
	expect(validateListSearch({ dir: "desc" }).dir).toBe("desc");
	expect(validateListSearch({ dir: "nonsense" }).dir).toBe("asc");
});
test("sort/dir: defaults stripped from URL; non-defaults serialized", () => {
	expect(listSearchToUrl({ sort: "default" }).sort).toBeUndefined();
	expect(listSearchToUrl({ sort: "name" }).sort).toBe("name");
	expect(listSearchToUrl({ dir: "asc" }).dir).toBeUndefined();
	expect(listSearchToUrl({ dir: "desc" }).dir).toBe("desc");
});
test("sort: full round-trip serialize → parse", () => {
	expect(validateListSearch(listSearchToUrl({ sort: "released" })).sort).toBe(
		"released",
	);
});
test("lang: defaults to null (use viewer default)", () => {
	expect(validateListSearch({}).lang).toBeNull();
});
test("lang: validates a supported language, else null", () => {
	expect(validateListSearch({ lang: "fr" }).lang).toBe("fr");
	expect(validateListSearch({ lang: "pt" }).lang).toBe("pt");
	expect(validateListSearch({ lang: "ru" }).lang).toBeNull(); // unsupported → default
	expect(validateListSearch({ lang: "junk" }).lang).toBeNull();
});
test("lang: null stripped from URL; a concrete override serialized", () => {
	expect(listSearchToUrl({ lang: null }).lang).toBeUndefined();
	expect(listSearchToUrl({ lang: "de" }).lang).toBe("de");
});
test("lang: full round-trip serialize → parse", () => {
	expect(validateListSearch(listSearchToUrl({ lang: "es" })).lang).toBe("es");
});
