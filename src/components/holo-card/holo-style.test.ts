import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import {
	COSMOS_SERIES,
	COSMOS_SETS,
	getHoloClass,
	variantsToHolo,
} from "./holo-style";

describe("getHoloClass", () => {
	let warnSpy: ReturnType<typeof spyOn>;
	beforeEach(() => {
		warnSpy = spyOn(console, "warn").mockImplementation(() => {});
	});
	afterEach(() => warnSpy.mockRestore());

	test("vintage classic holo → cosmos (galaxy foil), not the rainbow scanline", () => {
		expect(getHoloClass("Rare Holo", "Base")).toBe("holo-cosmos");
		expect(getHoloClass("Rare Holo", "Neo")).toBe("holo-cosmos");
		expect(getHoloClass("Rare Holo", "HeartGold & SoulSilver")).toBe(
			"holo-cosmos",
		);
	});

	test("series matching is case-insensitive", () => {
		expect(getHoloClass("Rare Holo", "base")).toBe("holo-cosmos");
	});

	test("non-cosmos / modern series keep the rarity-driven class", () => {
		// Modern holos resolve via the CDN path, so procedural stays holo-basic.
		expect(getHoloClass("Rare Holo", "Sword & Shield")).toBe("holo-basic");
	});

	test("no series → rarity-driven class (no era reroute)", () => {
		expect(getHoloClass("Rare Holo")).toBe("holo-basic");
	});

	test("non-classic rarities are unaffected by era", () => {
		expect(getHoloClass("Rare Holo VMAX", "Base")).toBe("holo-vmax");
		expect(getHoloClass("Rare Rainbow", "Base")).toBe("rainbow");
		expect(getHoloClass("Common", "Base")).toBe("no-foil");
	});

	test("COSMOS_SERIES holds lowercased keys", () => {
		expect(COSMOS_SERIES.has("base")).toBe(true);
		expect(COSMOS_SERIES.has("Base")).toBe(false);
	});

	test("holo=false downgrades to no-foil, overriding rarity (basep-8 case)", () => {
		// basep-8 (non-holo promo) and basep-9 (holo) share rarity "Promo".
		expect(getHoloClass("Promo", "Base", false)).toBe("no-foil");
		expect(getHoloClass("Promo", "Base", true)).toBe("holo-cosmos");
		expect(getHoloClass("Promo", "Base", undefined)).toBe("holo-cosmos");
	});

	test("holo=false even overrides an explicit holo rarity", () => {
		expect(getHoloClass("Rare Holo", "Sword & Shield", false)).toBe("no-foil");
	});

	test("NP Black Star Promos route to cosmos when holo", () => {
		expect(getHoloClass("Promo", "NP", true)).toBe("holo-cosmos");
	});

	test("Celebrations set (cel25) → cosmos despite SWSH series", () => {
		expect(getHoloClass("Rare Holo", "Sword & Shield", true)).toBe(
			"holo-basic",
		);
		expect(getHoloClass("Rare Holo", "Sword & Shield", true, "cel25")).toBe(
			"holo-cosmos",
		);
	});

	test("Classic Collection → cosmos (vintage reprints)", () => {
		expect(getHoloClass("Classic Collection", "Sword & Shield", true)).toBe(
			"holo-cosmos",
		);
	});

	test("Double Rare → full-card holo-v, not art-window scanline", () => {
		expect(getHoloClass("Double Rare", "Scarlet & Violet", true)).toBe(
			"holo-v",
		);
	});

	test("Shiny Ultra Rare → rainbow (was unmapped → holo-basic)", () => {
		expect(getHoloClass("Shiny Ultra Rare", "Scarlet & Violet", true)).toBe(
			"rainbow",
		);
	});

	test("COSMOS_SETS holds lowercased set ids", () => {
		expect(COSMOS_SETS.has("cel25")).toBe(true);
	});
});

describe("variantsToHolo", () => {
	test("holofoil → true, normal-only → false", () => {
		expect(variantsToHolo(["holofoil"])).toBe(true);
		expect(variantsToHolo(["normal"])).toBe(false);
	});
	test("normal + reverseHolofoil (base printing non-holo) → false", () => {
		expect(variantsToHolo(["normal", "reverseHolofoil"])).toBe(false);
	});
	test("holofoil wins when both present", () => {
		expect(variantsToHolo(["holofoil", "reverseHolofoil"])).toBe(true);
	});
	test("TCGdex 'holo' → true, and wins over a co-present 'normal' (dual-print)", () => {
		expect(variantsToHolo(["holo"])).toBe(true);
		// TCGdex flags both printings on a dual-print holo; the holo one is rendered.
		expect(variantsToHolo(["normal", "holo"])).toBe(true);
		expect(variantsToHolo(["holo", "reverse"])).toBe(true);
	});
	test("no data or ambiguous → undefined (defer to rarity)", () => {
		expect(variantsToHolo(undefined)).toBeUndefined();
		expect(variantsToHolo([])).toBeUndefined();
		expect(variantsToHolo(["reverseHolofoil"])).toBeUndefined();
	});
});
