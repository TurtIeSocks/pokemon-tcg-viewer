import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import {
	COSMOS_SERIES,
	COSMOS_SETS,
	getHoloClass,
	holoPresentation,
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

	test("Shiny Ultra Rare → shiny-vmax (SV shiny vault, gold-glitter foil)", () => {
		expect(getHoloClass("Shiny Ultra Rare", "Scarlet & Violet", true)).toBe(
			"shiny-vmax",
		);
	});

	test("COSMOS_SETS holds lowercased set ids", () => {
		expect(COSMOS_SETS.has("cel25")).toBe(true);
	});
});

describe("holoPresentation (CardProxy pipeline)", () => {
	let warnSpy: ReturnType<typeof spyOn>;
	beforeEach(() => {
		warnSpy = spyOn(console, "warn").mockImplementation(() => {});
	});
	afterEach(() => warnSpy.mockRestore());

	test("plain rarity → effective simey rarity in data-rarity vocabulary", () => {
		expect(
			holoPresentation({ rarity: "Rare Holo VMAX", series: "Sword & Shield" }),
		).toEqual({
			effectiveRarity: "rare holo vmax",
			trainerGallery: false,
			className: "holo-vmax",
		});
	});

	test("common → null effective rarity (glare only), no-foil class", () => {
		expect(holoPresentation({ rarity: "Common" }).effectiveRarity).toBeNull();
		expect(holoPresentation({ rarity: "Common" }).className).toBe("no-foil");
	});

	test("known non-holo printing → glare only regardless of rarity", () => {
		expect(
			holoPresentation({ rarity: "Rare Holo", holo: false }).effectiveRarity,
		).toBeNull();
	});

	test("trainer gallery number strips the TG prefix and flags the attr", () => {
		const p = holoPresentation({
			rarity: "Trainer Gallery Rare Holo",
			setId: "swsh12tg",
			cardNumber: "TG05",
		});
		expect(p.effectiveRarity).toBe("rare holo");
		expect(p.trainerGallery).toBe(true);
	});

	test("TG 'Rare Holo V' + VMAX subtype remaps to vmax (simey CardProxy)", () => {
		const p = holoPresentation({
			rarity: "Rare Holo V",
			setId: "swsh12tg",
			cardNumber: "TG20",
			subtypes: ["VMAX"],
		});
		expect(p.effectiveRarity).toBe("rare holo vmax");
		expect(p.trainerGallery).toBe(true);
	});

	test("shiny vault number (sv…) upgrades holo V/VMAX to shiny families", () => {
		expect(
			holoPresentation({
				rarity: "Rare Holo V",
				setId: "swsh45sv",
				cardNumber: "SV110",
			}).effectiveRarity,
		).toBe("rare shiny v");
		expect(
			holoPresentation({
				rarity: "Rare Holo VMAX",
				setId: "swsh45sv",
				cardNumber: "SV122",
			}).effectiveRarity,
		).toBe("rare shiny vmax");
	});

	test("swshp promo: subtype drives the family; promos.json overrides style", () => {
		// SWSH076/077 are the Special Delivery secret promos.
		expect(
			holoPresentation({
				rarity: "Promo",
				setId: "swshp",
				cardNumber: "SWSH076",
			}),
		).toEqual({
			effectiveRarity: "rare secret",
			trainerGallery: true,
			className: "gold-secret",
		});
		// swshp-SWSH001 is SwHolo in promos.json → "rare holo".
		expect(
			holoPresentation({
				rarity: "Promo",
				setId: "swshp",
				cardNumber: "SWSH001",
				subtypes: ["Basic", "V"],
			}).effectiveRarity,
		).toBe("rare holo");
		// A V promo without a promos.json entry keeps the V family.
		expect(
			holoPresentation({
				rarity: "Promo",
				setId: "swshp",
				cardNumber: "SWSH300",
				subtypes: ["Basic", "V"],
			}).effectiveRarity,
		).toBe("rare holo v");
	});

	test("alternate-art VMAX (alt-arts list) → rare rainbow alt", () => {
		// swsh7-218 (Evolving Skies alt-art VMAX) is in alternate-arts.json.
		expect(
			holoPresentation({
				rarity: "Rare Rainbow",
				setId: "swsh7",
				cardNumber: "218",
				subtypes: ["VMAX"],
			}).effectiveRarity,
		).toBe("rare rainbow alt");
	});

	test("Special Illustration Rare → rare rainbow alt (not trainer gallery)", () => {
		expect(
			holoPresentation({ rarity: "Special Illustration Rare" }).effectiveRarity,
		).toBe("rare rainbow alt");
	});

	test("noisy 'normal' variant flag cannot flatten always-foil families", () => {
		// TCGdex flags shiny-vault and V-promo printings "normal"; those cards
		// are always physically foil, so holo=false must not downgrade them.
		expect(
			holoPresentation({
				rarity: "Rare Shiny",
				setId: "swsh4.5",
				cardNumber: "SV110",
				subtypes: ["Basic", "V"],
				holo: false,
			}).effectiveRarity,
		).toBe("rare shiny v");
		expect(
			holoPresentation({
				rarity: "Promo",
				setId: "swshp",
				cardNumber: "SWSH179",
				subtypes: ["Basic", "V"],
				holo: false,
			}).effectiveRarity,
		).toBe("rare holo v");
		// …but the classic-holo families still honor it (basep-8 style).
		expect(
			holoPresentation({ rarity: "Rare Holo", holo: false }).effectiveRarity,
		).toBeNull();
	});

	test("reverse printing suffixes the base rarity (CardProxy isReverse)", () => {
		expect(holoPresentation({ rarity: "Common", reverse: true })).toEqual({
			effectiveRarity: "common reverse holo",
			trainerGallery: false,
			className: "reverse-holo",
		});
		// A reverse printing is always physically foil — the noisy "normal"
		// variant flag must not flatten it.
		expect(
			holoPresentation({ rarity: "Rare", reverse: true, holo: false })
				.effectiveRarity,
		).toBe("rare reverse holo");
		// Missing rarity still produces a valid reverse family.
		expect(holoPresentation({ reverse: true }).effectiveRarity).toBe(
			"common reverse holo",
		);
	});

	test("vintage Rare Holo → rare holo cosmos via era table", () => {
		expect(
			holoPresentation({ rarity: "Rare Holo", series: "Neo" }).effectiveRarity,
		).toBe("rare holo cosmos");
	});

	test("Japanese vintage series route to cosmos (TCGdex serie names)", () => {
		// PMCG1 リザードン and friends — the Asian corpus joins series by the
		// Japanese display name, not the Western one.
		expect(
			holoPresentation({
				rarity: "Holo Rare",
				series: "ポケットモンスターカードゲーム",
			}).effectiveRarity,
		).toBe("rare holo cosmos");
		expect(
			holoPresentation({ rarity: "Holo Rare", series: "ポケモンカード★neo" })
				.effectiveRarity,
		).toBe("rare holo cosmos");
		expect(
			holoPresentation({ rarity: "Holo Rare", series: "ADV" }).effectiveRarity,
		).toBe("rare holo cosmos");
		// Modern JP stays rarity-driven.
		expect(
			holoPresentation({ rarity: "Holo Rare", series: "剣と盾" })
				.effectiveRarity,
		).toBe("rare holo");
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
