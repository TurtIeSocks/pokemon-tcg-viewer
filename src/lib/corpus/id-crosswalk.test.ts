import { expect, test } from "bun:test";
import {
	ptcgImageUrl,
	ptcgSetToTcgdex,
	tcgdexCardToPtcg,
	tcgdexSetToPtcg,
} from "./id-crosswalk";

test("set translation: verbatim sets are identity", () => {
	expect(ptcgSetToTcgdex("swsh3")).toBe("swsh3");
	expect(ptcgSetToTcgdex("base1")).toBe("base1");
});

test("set translation: divergent sets use the table both ways", () => {
	expect(ptcgSetToTcgdex("sv1")).toBe("sv01");
	expect(ptcgSetToTcgdex("base6")).toBe("lc");
	expect(tcgdexSetToPtcg("sv01")).toBe("sv1");
	expect(tcgdexSetToPtcg("lc")).toBe("base6");
});

test("tcgdexCardToPtcg: reverse setId + strip leading zeros on number", () => {
	expect(tcgdexCardToPtcg("sv01-001")).toBe("sv1-1");
	expect(tcgdexCardToPtcg("swsh3-136")).toBe("swsh3-136"); // verbatim
	expect(tcgdexCardToPtcg("2019sm-12")).toBe("mcd19-12");
});

test("ptcgImageUrl builds hires + small CDN urls", () => {
	expect(ptcgImageUrl("base1", "4")).toEqual({
		large: "https://images.pokemontcg.io/base1/4_hires.png",
		small: "https://images.pokemontcg.io/base1/4.png",
	});
});

test("reverse crosswalk collision: swsh4.5 maps to swsh45 (not swsh45sv)", () => {
	// swsh45 and swsh45sv both map to swsh4.5 in the PTCG→TCGdex table.
	// The reverse map must resolve swsh4.5 → swsh45 (the primary print run),
	// not swsh45sv (a special variant), so image fallback URLs are correct.
	expect(tcgdexCardToPtcg("swsh4.5-1")).toBe("swsh45-1");
});

test("reverse crosswalk collision: cel25 maps to cel25 (not cel25c)", () => {
	// cel25 and cel25c both map to the TCGdex id "cel25".
	// The reverse map must resolve cel25 → cel25 (not cel25c).
	expect(tcgdexCardToPtcg("cel25-1")).toBe("cel25-1");
});
