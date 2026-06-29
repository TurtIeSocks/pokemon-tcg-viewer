import { expect, test } from "bun:test";
import { remapPtcgCardId, remapPtcgSetId } from "./id-remap";

// lookup mimics the corpus: tcgdex "{setId}:{numericLocalId}" -> tcgdex card id
const lookup = (setId: string, num: number) =>
	(
		({ "sv01:1": "sv01-001", "swsh3:136": "swsh3-136" }) as Record<
			string,
			string
		>
	)[`${setId}:${num}`] ?? null;

test("remapPtcgCardId: set table + numeric match into corpus", () => {
	expect(remapPtcgCardId("sv1-1", lookup)).toBe("sv01-001");
	expect(remapPtcgCardId("swsh3-136", lookup)).toBe("swsh3-136");
});

test("remapPtcgCardId: unmappable returns the original id", () => {
	expect(remapPtcgCardId("zzz-999", lookup)).toBe("zzz-999");
});

test("remapPtcgSetId translates set ids", () => {
	expect(remapPtcgSetId("sv1")).toBe("sv01");
	expect(remapPtcgSetId("swsh3")).toBe("swsh3");
});
