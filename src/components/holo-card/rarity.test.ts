import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { getRarityClass } from "./rarity";

describe("getRarityClass", () => {
	let warnSpy: ReturnType<typeof spyOn>;

	beforeEach(() => {
		warnSpy = spyOn(console, "warn").mockImplementation(() => {});
	});

	afterEach(() => {
		warnSpy.mockRestore();
	});

	test("returns 'no-foil' when rarity is undefined", () => {
		expect(getRarityClass(undefined)).toBe("no-foil");
		expect(warnSpy).not.toHaveBeenCalled();
	});

	test("maps known rarities to their CSS class", () => {
		expect(getRarityClass("Rare Holo")).toBe("holo-basic");
		expect(getRarityClass("Rare Holo VMAX")).toBe("holo-vmax");
		expect(getRarityClass("Reverse Holo")).toBe("reverse-holo");
		expect(getRarityClass("Radiant Rare")).toBe("radiant");
		expect(warnSpy).not.toHaveBeenCalled();
	});

	test("falls back to 'holo-basic' and warns for unknown rarities", () => {
		expect(getRarityClass("Some Future Mythic Tier")).toBe("holo-basic");
		expect(warnSpy).toHaveBeenCalledTimes(1);
		expect(warnSpy.mock.calls[0][0]).toContain("Some Future Mythic Tier");
	});

	test("returns 'no-foil' for plain Common/Uncommon (no foil expected)", () => {
		expect(getRarityClass("Common")).toBe("no-foil");
		expect(getRarityClass("Uncommon")).toBe("no-foil");
		expect(getRarityClass("Rare")).toBe("no-foil");
		expect(warnSpy).not.toHaveBeenCalled();
	});

	test("matches case-insensitively so raw TCGdex casing resolves", () => {
		// The Asian region carries raw TCGdex rarity ("Double rare"), sentence case
		// vs the ptcg.io title-case key ("Double Rare"). It must map to the same
		// foil class, not fall to the generic fallback.
		expect(getRarityClass("Double rare")).toBe(getRarityClass("Double Rare"));
		expect(getRarityClass("Double rare")).toBe("double-rare");
		expect(getRarityClass("common")).toBe("no-foil");
		expect(warnSpy).not.toHaveBeenCalled();
	});

	test("maps Japanese/TCGdex-native rarities without warning", () => {
		// Enumerated from the built ja corpus (~2.9k cards across these tiers were
		// hitting the generic-holo fallback + warn spam). Representative subset:
		expect(getRarityClass("Super Rare")).toBe("ultra");
		expect(getRarityClass("Holo Rare")).toBe("holo-basic");
		expect(getRarityClass("Art Rare")).toBe("trainer-gallery");
		// SAR ≈ Special Illustration Rare ≈ simey's rainbow-alt (alt-art secret).
		expect(getRarityClass("Special Art Rare")).toBe("rainbow-alt");
		expect(getRarityClass("Character Rare")).toBe("trainer-gallery");
		expect(getRarityClass("Secret Rare")).toBe("gold-secret");
		// Shiny secrets carry the gold-glitter shiny-vmax foil, not plain rainbow.
		expect(getRarityClass("Shiny Secret Rare")).toBe("shiny-vmax");
		// SV/ME hyper rares are GOLD monochrome etched secrets (The Trainer
		// Court / Bulbapedia), not the SWSH pastel rainbow — gold-glitter family.
		expect(getRarityClass("Hyper Rare")).toBe("gold-secret");
		expect(getRarityClass("Mega Hyper Rare")).toBe("gold-secret");
		expect(getRarityClass("Kagayaku")).toBe("shining");
		expect(warnSpy).not.toHaveBeenCalled();
	});

	test("treats the 'None' rarity sentinel as no-foil, silently", () => {
		// TCGdex emits the literal string "None" for unrarified cards (427 in the ja
		// corpus). Distinct from undefined; must not spam the unknown-rarity warn.
		expect(getRarityClass("None")).toBe("no-foil");
		expect(warnSpy).not.toHaveBeenCalled();
	});
});
