import { describe, expect, test } from "bun:test";
import {
	buildFoilUrls,
	cdnSetId,
	getCssRarity,
	isReverseRarity,
	ptcgCardId,
} from "./foil-assets";

const CDN = "https://poke-holo.b-cdn.net";

describe("getCssRarity", () => {
	test("maps known API rarities to css rarities", () => {
		expect(getCssRarity("Rare Holo")).toBe("rare holo");
		expect(getCssRarity("Amazing Rare")).toBe("amazing rare");
		expect(getCssRarity("Rare Holo GX")).toBe("rare holo v");
		expect(getCssRarity("Illustration Rare")).toBe("illustration rare");
	});
	test("passes through reverse-holo variants verbatim (lowercased)", () => {
		expect(getCssRarity("Common Reverse Holo")).toBe("common reverse holo");
		expect(getCssRarity("Rare Reverse Holo")).toBe("rare reverse holo");
	});
	test("returns null for plain rarities with no foil", () => {
		expect(getCssRarity("Common")).toBeNull();
		expect(getCssRarity(undefined)).toBeNull();
	});

	test("TCGdex-flavored rarities resolve via the canonical effective rarity", () => {
		// The live per-card detail fetch serves TCGdex strings; the corpus serves
		// ptcg.io ones. Both must reach the same CDN foil.
		expect(getCssRarity("Holo Rare")).toBe("rare holo");
		expect(getCssRarity("Holo Rare V")).toBe("rare holo v");
		expect(getCssRarity("Holo Rare VSTAR")).toBe("rare holo vstar");
		expect(getCssRarity("Secret Rare")).toBe("rare secret");
		expect(getCssRarity("Shiny rare VMAX")).toBe("rare shiny vmax");
		expect(getCssRarity("Totally Unknown Tier")).toBeNull();
	});
});

describe("cdnSetId / ptcgCardId", () => {
	test("maps TCGdex-renamed sets to CDN vocabulary", () => {
		expect(cdnSetId("swsh10.5")).toBe("pgo");
		expect(cdnSetId("swsh4.5")).toBe("swsh45");
		expect(cdnSetId("swsh12.5")).toBe("swsh12pt5");
		// TCGdex files Silver Tempest TG under swsh12.5tg (not CZ!).
		expect(cdnSetId("swsh12.5tg")).toBe("swsh12");
		expect(cdnSetId("swsh7")).toBe("swsh7");
	});
	test("strips ptcg-style tg/gg/sv subset suffixes", () => {
		expect(cdnSetId("swsh9tg")).toBe("swsh9");
		expect(cdnSetId("swsh12pt5gg")).toBe("swsh12pt5");
		expect(cdnSetId("swsh45sv")).toBe("swsh45");
	});
	test("ptcgCardId unpads numeric numbers, keeps alphanumerics", () => {
		expect(ptcgCardId("swsh10.5", "072")).toBe("pgo-72"); // alt-art list hit
		expect(ptcgCardId("swsh7", "215")).toBe("swsh7-215");
		expect(ptcgCardId("swshp", "SWSH076")).toBe("swshp-SWSH076");
		expect(ptcgCardId("swsh9", "TG16")).toBe("swsh9-TG16");
	});
});

describe("isReverseRarity", () => {
	test("detects reverse-holo css rarities", () => {
		expect(isReverseRarity("common reverse holo")).toBe(true);
		expect(isReverseRarity("rare holo")).toBe(false);
		expect(isReverseRarity(null)).toBe(false);
	});
});

describe("buildFoilUrls", () => {
	test("returns null for non-CDN (pre-SWSH) sets — they fall back to procedural", () => {
		expect(buildFoilUrls("base1", "4", "rare holo")).toBeNull();
		expect(buildFoilUrls("neo1", "9", "rare holo")).toBeNull();
		expect(buildFoilUrls("ecard1", "1", "rare holo")).toBeNull();
	});

	test("SWSH Amazing Rare → etched swsecret, zero-padded number", () => {
		const u = buildFoilUrls("swsh4", "50", "amazing rare");
		expect(u).toEqual({
			foilUrl: `${CDN}/foils/swsh4/foils/upscaled/050_foil_etched_swsecret_2x.webp`,
			maskUrl: `${CDN}/foils/swsh4/masks/upscaled/050_foil_etched_swsecret_2x.webp`,
		});
	});

	test("SWSH Rare Holo → holo swholo", () => {
		const u = buildFoilUrls("swsh1", "20", "rare holo");
		expect(u?.foilUrl).toBe(
			`${CDN}/foils/swsh1/foils/upscaled/020_foil_holo_swholo_2x.webp`,
		);
	});

	test("SV set keeps its id (CDN hosts no SV-era assets; 404 → procedural)", () => {
		const u = buildFoilUrls("sv1", "100", "rare ultra");
		expect(u?.foilUrl).toBe(
			`${CDN}/foils/sv1/foils/upscaled/100_foil_etched_sunpillar_2x.webp`,
		);
	});

	test("TCGdex-renamed sets resolve to the real CDN set id", () => {
		// Pokémon GO — the CDN (and simey) know it as "pgo".
		expect(buildFoilUrls("swsh10.5", "024", "rare holo")?.maskUrl).toBe(
			`${CDN}/foils/pgo/masks/upscaled/024_foil_holo_swholo_2x.webp`,
		);
		// Shining Fates shiny vault (inline SV numbers) → swsh45.
		expect(buildFoilUrls("swsh4.5", "SV110", "rare shiny v")?.maskUrl).toBe(
			`${CDN}/foils/swsh45/masks/upscaled/sv110_foil_etched_sunpillar_2x.webp`,
		);
		// Crown Zenith → swsh12pt5.
		expect(buildFoilUrls("swsh12.5", "160", "rare secret")?.maskUrl).toBe(
			`${CDN}/foils/swsh12pt5/masks/upscaled/160_foil_etched_swsecret_2x.webp`,
		);
	});

	test("rainbow-alt without VMAX → sunpillar; with VMAX → swsecret", () => {
		expect(
			buildFoilUrls("swsh9", "100", "rare rainbow alt")?.foilUrl,
		).toContain("_foil_etched_sunpillar_2x.webp");
		expect(
			buildFoilUrls("swsh9", "100", "rare rainbow alt", ["VMAX"])?.foilUrl,
		).toContain("_foil_etched_swsecret_2x.webp");
	});

	test("reverse holo on a SWSH set → default holo reverse", () => {
		expect(buildFoilUrls("swsh1", "5", "common reverse holo")?.foilUrl).toBe(
			`${CDN}/foils/swsh1/foils/upscaled/005_foil_holo_reverse_2x.webp`,
		);
	});
});
