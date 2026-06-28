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
