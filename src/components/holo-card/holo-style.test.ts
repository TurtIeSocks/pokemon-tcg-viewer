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

	test("holo=false does NOT override an explicit holo rarity (CoL data-gap guard)", () => {
		// TCGdex lists whole holo sets (Call of Legends) as normal-only — a data
		// gap, not a real non-holo printing. A rarity that itself says "Holo" is
		// ground truth, so a normal-only variant must not flatten it.
		expect(getHoloClass("Rare Holo", "Sword & Shield", false)).toBe(
			"holo-basic",
		);
		expect(getHoloClass("Rare Holo", "Base", false)).toBe("holo-cosmos");
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
			frame: null,
			className: "holo-vmax",
		});
	});

	test("common → null effective rarity (glare only), no-foil class", () => {
		expect(holoPresentation({ rarity: "Common" }).effectiveRarity).toBeNull();
		expect(holoPresentation({ rarity: "Common" }).className).toBe("no-foil");
	});

	test("normal-only printing of an upgradable rarity → glare only", () => {
		// A non-committal rarity we upgraded (Promo/Rare) with a genuine
		// normal-only printing downgrades to glare-only (basep-8 style). An
		// explicit "Rare Holo" is NOT downgradable — see the CoL guard test.
		expect(
			holoPresentation({ rarity: "Promo", series: "Base", holo: false })
				.effectiveRarity,
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
			frame: null,
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
		// …and an explicit "Rare Holo" rarity is always-foil too — a normal-only
		// TCGdex printing (the CoL data gap) must not flatten it.
		expect(
			holoPresentation({ rarity: "Rare Holo", holo: false }).effectiveRarity,
		).toBe("rare holo");
	});

	test("Celebrations main set: full-face cosmos, incl. plain Rare + holo", () => {
		// cel25-5 Pikachu (Rare Holo) — mirror confetti covers the whole face.
		const pikachu = holoPresentation({
			rarity: "Rare Holo",
			series: "Sword & Shield",
			setId: "cel25",
			cardNumber: "5",
			holo: true,
		});
		expect(pikachu.effectiveRarity).toBe("rare holo cosmos");
		expect(pikachu.frame).toBe("fullface");
		// cel25-2 Reshiram (plain "Rare" but printed holo) — must not be
		// glare-only.
		const reshiram = holoPresentation({
			rarity: "Rare",
			series: "Sword & Shield",
			setId: "cel25",
			cardNumber: "2",
			holo: true,
		});
		expect(reshiram.effectiveRarity).toBe("rare holo cosmos");
		expect(reshiram.frame).toBe("fullface");
		// V cards keep their own family, still full-face frame (no clip anyway).
		expect(
			holoPresentation({
				rarity: "Rare Holo V",
				setId: "cel25",
				cardNumber: "16",
				holo: true,
			}).effectiveRarity,
		).toBe("rare holo v");
	});

	test("SV Black Star Promos: ex → full-card etch, rest → full-face mirror", () => {
		// svp-004 Mimikyu ex — SV ex treatment (full-card sunpillar family).
		const mimikyu = holoPresentation({
			rarity: "Promo",
			series: "Scarlet & Violet",
			setId: "svp",
			cardNumber: "004",
			subtypes: ["Basic", "ex"],
			holo: true,
		});
		expect(mimikyu.effectiveRarity).toBe("rare holo v");
		expect(mimikyu.frame).toBe("fullface");
		// svp-013 Miraidon — regular promo, mirror foil across the whole face.
		const miraidon = holoPresentation({
			rarity: "Promo",
			series: "Scarlet & Violet",
			setId: "svp",
			cardNumber: "013",
			subtypes: ["Basic"],
			holo: true,
		});
		expect(miraidon.effectiveRarity).toBe("rare holo");
		expect(miraidon.frame).toBe("fullface");
	});

	test("Classic Collection: vintage window, except full-bleed originals", () => {
		// cel25-8A Dark Gyarados — WotC-frame reprint → vintage clip knobs.
		const gyarados = holoPresentation({
			rarity: "Classic Collection",
			series: "Sword & Shield",
			setId: "cel25",
			cardNumber: "8A",
		});
		expect(gyarados.effectiveRarity).toBe("rare holo cosmos");
		expect(gyarados.frame).toBe("vintage");
		// cel25-60A Tapu Lele GX — full-art original → full-face foil.
		expect(
			holoPresentation({
				rarity: "Classic Collection",
				setId: "cel25",
				cardNumber: "60A",
			}).frame,
		).toBe("fullface");
	});

	test("explicit 'Rare Holo' rarity is never downgraded by a normal-only variant", () => {
		// Call of Legends: 33 cards are rarity "Rare Holo" but TCGdex lists only
		// ['normal'] (a data gap). The explicit holo rarity must win.
		expect(
			holoPresentation({
				rarity: "Rare Holo",
				series: "Call of Legends",
				setId: "col1",
				cardNumber: "1",
				subtypes: ["Stage 1"],
				holo: false, // variantsToHolo(['normal'])
			}).effectiveRarity,
		).toBe("rare holo cosmos");
		// …but a non-committal rarity (Promo) still downgrades on holo=false.
		expect(
			holoPresentation({
				rarity: "Promo",
				series: "Base",
				setId: "basep",
				cardNumber: "8",
				holo: false,
			}).effectiveRarity,
		).toBeNull();
	});

	test("Black & White era gets its own (shortest) frame", () => {
		expect(
			holoPresentation({
				rarity: "Rare Holo",
				series: "Black & White",
				setId: "bw1",
				cardNumber: "26",
				subtypes: ["Basic"],
			}).frame,
		).toBe("bw");
	});

	test("XY era: art-window Pokémon holos get the xy frame", () => {
		// xy1-26 Delphox (Stage 2) — cosmos galaxy foil in the XY art window.
		const p = holoPresentation({
			rarity: "Rare Holo",
			series: "XY",
			setId: "xy1",
			cardNumber: "26",
			subtypes: ["Stage 2"],
			holo: false, // TCGdex lists XY holos as normal-only (data gap)
		});
		expect(p.frame).toBe("xy");
		expect(p.effectiveRarity).toBe("rare holo cosmos");
	});

	test("XY era: full-art EX / Mega route to fullface + sunpillar etch", () => {
		for (const rarity of ["Rare Holo EX", "Rare Ultra"]) {
			const p = holoPresentation({
				rarity,
				series: "XY",
				setId: "xy1",
				cardNumber: "1",
				subtypes: ["Basic", "EX"],
				holo: false,
			});
			expect(p.frame).toBe("fullface");
			expect(p.effectiveRarity).toBe("rare holo v");
		}
	});

	test("XY era: gold secrets + BREAK route to fullface + gold foil", () => {
		// 'Rare BREAK' isn't /holo/ and the printing is normal-only, so the
		// downgrade would flatten it — the XY full-art path must beat that.
		for (const [rarity, setId, number, subtypes] of [
			["Rare Secret", "xy2", "107", ["MEGA", "EX"]],
			["Rare BREAK", "xy8", "12", ["BREAK"]],
		] as const) {
			const p = holoPresentation({
				rarity,
				series: "XY",
				setId,
				cardNumber: number,
				subtypes: [...subtypes],
				holo: false,
			});
			expect(p.frame).toBe("fullface");
			expect(p.effectiveRarity).toBe("rare secret");
		}
	});

	test("SM era: art-window Pokémon holos get the sm frame", () => {
		// sm1-20 Tsareena (Stage 2) — cosmos galaxy foil in the SM art window.
		const p = holoPresentation({
			rarity: "Rare Holo",
			series: "Sun & Moon",
			setId: "sm1",
			cardNumber: "20",
			subtypes: ["Stage 2"],
			holo: false, // TCGdex lists most SM holos as normal-only (data gap)
		});
		expect(p.frame).toBe("sm");
		expect(p.effectiveRarity).toBe("rare holo cosmos");
	});

	test("SM era: regular GX is a full-face sunpillar etch, not art-window", () => {
		// sm1-35 Lapras GX — physically an etched full-face foil.
		const p = holoPresentation({
			rarity: "Rare Holo GX",
			series: "Sun & Moon",
			setId: "sm1",
			cardNumber: "35",
			subtypes: ["Basic", "GX"],
			holo: false,
		});
		expect(p.frame).toBe("fullface");
		expect(p.effectiveRarity).toBe("rare holo v");
	});

	test("SM era: Prism Star is revived from no-foil (fullface ultra)", () => {
		// 'Rare Prism Star' carries no /holo/ and the printing is normal-only,
		// so the old "rare holo" mapping downgraded it to no-foil (sm5-77
		// Darkrai rendered flat). "rare ultra" isn't downgradable.
		const p = holoPresentation({
			rarity: "Rare Prism Star",
			series: "Sun & Moon",
			setId: "sm5",
			cardNumber: "77",
			subtypes: ["Basic", "Prism Star"],
			holo: false,
		});
		expect(p.frame).toBe("fullface");
		expect(p.effectiveRarity).toBe("rare ultra");
	});

	test("SM era: Hidden Fates shiny vault foils the full card", () => {
		// sma SV1 — sparkle covers the whole white card, no art window.
		const p = holoPresentation({
			rarity: "Rare Shiny",
			series: "Sun & Moon",
			setId: "sma",
			cardNumber: "SV1",
			subtypes: ["Basic"],
		});
		expect(p.frame).toBe("fullface");
		expect(p.effectiveRarity).toBe("rare shiny");
	});

	test("Black White Rare → full-face sunpillar etch (Zekrom/Reshiram ex)", () => {
		// sv10.5w-173 Reshiram ex — a full-bleed etched full-art, not an
		// art-window holo. No CDN mask (poke-holo has no sv10.5).
		const p = holoPresentation({
			rarity: "Black White Rare",
			series: "Scarlet & Violet",
			setId: "sv10.5w",
			cardNumber: "173",
			subtypes: ["Basic", "ex"],
			holo: true,
		});
		expect(p.frame).toBe("fullface");
		expect(p.effectiveRarity).toBe("rare holo v");
	});

	test("HGSS era gets its own (taller) frame, distinct from DP", () => {
		// hgss1-1 Arcanine — taller window than DP.
		expect(
			holoPresentation({
				rarity: "Rare Holo",
				series: "HeartGold & SoulSilver",
				setId: "hgss1",
				cardNumber: "1",
				subtypes: ["Stage 1"],
			}).frame,
		).toBe("hgss");
		// JP LEGEND line shares it.
		expect(
			holoPresentation({ rarity: "Holo Rare", series: "LEGEND" }).frame,
		).toBe("hgss");
	});

	test("reverse printing suffixes the base rarity (CardProxy isReverse)", () => {
		expect(holoPresentation({ rarity: "Common", reverse: true })).toEqual({
			effectiveRarity: "common reverse holo",
			trainerGallery: false,
			frame: null,
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

	test("POP: plain 'Rare'/'Common' with a holo printing → cosmos foil", () => {
		// pop3-1 Blastoise — rarity "Rare" (not "Rare Holo") but variants
		// include "holo"; must not render glare-only.
		const p = holoPresentation({
			rarity: "Rare",
			series: "POP",
			setId: "pop3",
			cardNumber: "1",
			subtypes: ["Stage 2"],
			holo: true,
		});
		expect(p.effectiveRarity).toBe("rare holo cosmos");
		// No holo printing → stays glare-only.
		expect(
			holoPresentation({
				rarity: "Rare",
				series: "POP",
				setId: "pop3",
				cardNumber: "9",
				holo: false,
			}).effectiveRarity,
		).toBeNull();
	});

	test("POP spans two frame eras (1-5 EX, 6-9 DP); DP/Platinum → dp frame", () => {
		expect(
			holoPresentation({ rarity: "Rare", setId: "pop3", holo: true }).frame,
		).toBe("ex");
		expect(
			holoPresentation({ rarity: "Rare", setId: "pop6", holo: true }).frame,
		).toBe("dp");
		expect(
			holoPresentation({ rarity: "Rare", setId: "pop9", holo: true }).frame,
		).toBe("dp");
		expect(
			holoPresentation({ rarity: "Rare Holo", series: "Diamond & Pearl" })
				.frame,
		).toBe("dp");
		expect(
			holoPresentation({ rarity: "Rare Holo", series: "Platinum" }).frame,
		).toBe("dp");
	});

	test("EX era gets its own frame (bottom-left stage badge)", () => {
		// ex1-5 Delcatty — Stage 1 with the badge hanging off the window's
		// bottom-left; JP ADV/PCG share the frame.
		const p = holoPresentation({
			rarity: "Rare Holo",
			series: "EX",
			setId: "ex1",
			cardNumber: "5",
			subtypes: ["Stage 1"],
		});
		expect(p.frame).toBe("ex");
		expect(p.effectiveRarity).toBe("rare holo cosmos");
		expect(holoPresentation({ rarity: "Holo Rare", series: "ADV" }).frame).toBe(
			"ex",
		);
		expect(holoPresentation({ rarity: "Holo Rare", series: "PCG" }).frame).toBe(
			"ex",
		);
	});

	test("e-Card era gets its own frame (rounded window + dot-code strips)", () => {
		// ecard3-1 Aerodactyl — reverse foil must dodge the e-reader strips.
		const std = holoPresentation({
			rarity: "Rare Holo",
			series: "E-Card",
			setId: "ecard3",
			cardNumber: "1",
		});
		expect(std.frame).toBe("ecard");
		expect(std.effectiveRarity).toBe("rare holo cosmos"); // era still cosmos
		const rev = holoPresentation({
			rarity: "Rare",
			series: "E-Card",
			setId: "ecard3",
			cardNumber: "1",
			reverse: true,
		});
		expect(rev.frame).toBe("ecard");
		expect(rev.effectiveRarity).toBe("rare reverse holo");
		// JP e series routes the same way.
		expect(
			holoPresentation({ rarity: "Holo Rare", series: "ポケモンカードe" })
				.frame,
		).toBe("ecard");
	});

	test("Legendary Collection: own TCGdex serie → cosmos + vintage frame", () => {
		const p = holoPresentation({
			rarity: "Rare Holo",
			series: "Legendary Collection",
			setId: "lc",
			cardNumber: "3",
			holo: true,
		});
		expect(p.effectiveRarity).toBe("rare holo cosmos");
		expect(p.frame).toBe("vintage");
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
