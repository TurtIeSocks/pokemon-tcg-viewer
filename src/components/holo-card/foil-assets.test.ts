import { describe, expect, test } from "bun:test";
import { buildFoilUrls, getCssRarity, isReverseRarity } from "./foil-assets";

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

	test("SV set: strips sv prefix from set, builds foil", () => {
		const u = buildFoilUrls("sv1", "100", "rare ultra");
		expect(u?.foilUrl).toBe(
			`${CDN}/foils/1/foils/upscaled/100_foil_etched_sunpillar_2x.webp`,
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
