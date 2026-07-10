/**
 * Card rarity string → canonical simey rarity. Keys are verbatim from the
 * source (pokemontcg.io for the Western corpus, raw TCGdex for the Asian
 * region); the value is the *effective rarity* in simeydotme/pokemon-cards-css
 * vocabulary — the exact `data-rarity` string its CSS selectors key on
 * (rarity-styles.css is a 1:1 port of those files).
 *
 * `null` = no foil recipe — the card still renders the base glare layer
 * (simey gives every card a pointer-tracking glare; commons/uncommons too).
 */
const RARITY_EFFECTIVE: Record<string, string | null> = {
	Common: null,
	Uncommon: null,
	Rare: null,
	None: null, // TCGdex's unrarified sentinel

	"Rare Holo": "rare holo",
	"Rare Holo Cosmos": "rare holo cosmos",
	"Rare Holo EX": "rare holo",
	// Regular (non-full-art) GX: physically an etched full-face foil, not an
	// art-window holo — the sunpillar V recipe is the closest match.
	"Rare Holo GX": "rare holo v",
	"Rare Holo LV.X": "rare holo",
	"Rare Holo V": "rare holo v",
	"Rare Holo VMAX": "rare holo vmax",
	"Rare Holo VSTAR": "rare holo vstar",
	"Rare Holo VUNION": "rare holo vunion",
	"Rare BREAK": "rare holo",
	"Rare Prime": "rare holo",
	// ACE SPEC cards are full-face pink/gold holo — full-card sheen, not the
	// art-window scanline.
	"Rare ACE": "rare ultra",
	"ACE SPEC Rare": "rare ultra",
	// Gold Star (EX era) — vintage holo; era routing sends these to cosmos.
	"Rare Holo Star": "rare holo",
	// Prism Star (SM era): full-face dark holo with rainbow rays — the ultra
	// recipe's iridescent hue-shift is the closest match ("rare holo" would
	// clip it to the art window AND the normal-only printing would flatten it
	// to no-foil, since "Rare Prism Star" carries no /holo/).
	"Rare Prism Star": "rare ultra",
	// TCGdex spelling variants of the V-family holos.
	"Holo Rare V": "rare holo v",
	"Holo Rare VMAX": "rare holo vmax",
	"Holo Rare VSTAR": "rare holo vstar",
	// Mega Evolution (2025+) data sentinel — full-card sheen like Double Rare.
	MEGA_ATTACK_RARE: "rare holo v",

	// SWSH Shiny Vault (baby shinies / shiny V / shiny VMAX). The sv-numbered
	// remap in holoPresentation() upgrades V/VMAX-subtyped cards.
	"Rare Shiny": "rare shiny",
	"Rare Shiny GX": "rare shiny vmax",
	"Shiny Rare V": "rare shiny v", // TCGdex spelling
	"Shiny Rare VMAX": "rare shiny vmax",

	"Reverse Holo": "reverse holo",
	"Amazing Rare": "amazing rare",
	"Radiant Rare": "radiant rare",
	"Trainer Gallery Rare Holo": "trainer gallery rare holo",

	"Rare Rainbow": "rare rainbow",
	"Rare Secret": "rare secret",
	"Rare Ultra": "rare ultra",
	"Rare Shining": "rare shining", // custom recipe (Neo) — no simey source

	"Hyper Rare": "rare rainbow",
	"Illustration Rare": "trainer gallery rare holo",
	// Special Illustration Rare ≈ SWSH alternate-art secret (simey rainbow-alt),
	// NOT the trainer-gallery sheen (that was the old, wrong bucket).
	"Special Illustration Rare": "rare rainbow alt",
	"Ultra Rare": "rare ultra",
	// Double Rare (SV ex) is a full-card sheen, NOT a classic art-window holo.
	"Double Rare": "rare holo v",
	// SV Shiny Vault — baby shinies; V/VMAX-subtyped ones are upgraded by the
	// shiny-vault remap in holoPresentation(). Shiny exes are "Shiny Ultra Rare".
	"Shiny Rare": "rare shiny",
	"Shiny Ultra Rare": "rare shiny vmax",
	Promo: "rare holo",
	LEGEND: "rare holo",
	// Celebrations vintage reprints — vintage galaxy foil.
	"Classic Collection": "rare holo cosmos",

	// --- TCGdex-native (Asian region) rarities, mapped to the closest simey
	// family (cosmetic only — a sensible mapping beats the generic fallback).
	"Holo Rare": "rare holo",
	"Super Rare": "rare ultra", // JP SR — full-art
	"Super Rare Holo": "rare ultra",
	"Art Rare": "trainer gallery rare holo", // JP AR ≈ Illustration Rare
	"Special Art Rare": "rare rainbow alt", // JP SAR ≈ Special Illustration Rare
	"Character Rare": "trainer gallery rare holo", // CHR — full-art character
	"Character Super Rare": "rare rainbow", // CSR — premium full-art character
	"Trainer Rare": "trainer gallery rare holo",
	"Triple Rare": "rare holo v", // RRR — full-card sheen like Double Rare
	"Prism Rare": "rare ultra", // Prism Star — cf. "Rare Prism Star"
	"ACE Rare": "rare holo", // ACE SPEC, cf. "Rare ACE"
	"Secret Rare": "rare secret", // cf. "Rare Secret"
	"Shiny Secret Rare": "rare shiny vmax",
	"Rare Holo LEGEND": "rare holo", // cf. LEGEND
	Kagayaku: "rare shining", // 輝く — Shining Pokémon
	Shining: "rare shining",
	"Mega Hyper Rare": "rare rainbow", // cf. Hyper Rare
	// Black White Rare — the 2 chase ex full-arts of Black Bolt (Zekrom, black)
	// + White Flare (Reshiram, white), 2025. Full-bleed etched full-arts, so the
	// sunpillar V etch (routed fullface in frameFor); "rare holo" wrongly clipped
	// them to an art window. No CDN mask exists (poke-holo has no sv10.5), so
	// they render procedurally.
	"Black White Rare": "rare holo v",

	// --- Pokémon TCG Pocket rarities (TCGdex tcgp sets). Diamonds are the
	// commons ladder; stars/shinies are the premium full-arts. Mapped to the
	// closest physical-foil family for a sensible on-screen read.
	"One Diamond": null,
	"Two Diamond": null,
	"Three Diamond": "rare holo",
	"Four Diamond": "rare holo v", // ex — full-card sheen
	"One Star": "rare ultra", // full art
	"Two Star": "rare rainbow alt", // special art
	"Three Star": "rare rainbow", // immersive
	"One Shiny": "rare shiny",
	"Two Shiny": "rare shiny v",
	"Crown Rare": "rare secret", // gold crown
};

export const KNOWN_RARITIES: ReadonlySet<string> = new Set(
	Object.keys(RARITY_EFFECTIVE),
);

// Case-insensitive index. The Asian region carries raw TCGdex rarity (no
// pokemontcg.io overlay to normalize it), and TCGdex uses sentence case
// ("Double rare") where the table is keyed in ptcg.io title case
// ("Double Rare"). No two keys differ only by case, so folding case is safe.
const RARITY_EFFECTIVE_LOWER: Record<string, string | null> =
	Object.fromEntries(
		Object.entries(RARITY_EFFECTIVE).map(([k, v]) => [k.toLowerCase(), v]),
	);

/**
 * Canonical simey rarity for a corpus rarity string, or null for
 * glare-only cards. Unknown rarities warn (dev/test) and fall back to the
 * generic "rare holo" sheen.
 */
export function getEffectiveRarity(rarity?: string): string | null {
	if (!rarity) return null;
	const lower = rarity.toLowerCase();
	if (lower in RARITY_EFFECTIVE_LOWER) {
		return (
			RARITY_EFFECTIVE[rarity as keyof typeof RARITY_EFFECTIVE] ??
			RARITY_EFFECTIVE_LOWER[lower] ??
			null
		);
	}
	// Vite sets import.meta.env.DEV in dev / PROD in prod. Under `bun test`
	// neither is defined, so we check `PROD !== true` to fire the warning in
	// both dev-server and test runs while staying silent in `vite build`.
	if (import.meta.env.PROD !== true) {
		console.warn(
			`[holo-card] Unknown rarity "${rarity}" — using generic holo fallback`,
		);
	}
	return "rare holo";
}

/**
 * Stable internal class name for an effective rarity. The CSS keys on
 * data-rarity (like simey); these classes exist for tests, debugging, and the
 * odd non-foil consumer — keep them in sync with the effective vocabulary.
 */
export function effectiveToClass(effective: string | null): string {
	if (!effective) return "no-foil";
	if (effective.endsWith("reverse holo")) return "reverse-holo";
	switch (effective) {
		case "rare holo":
			return "holo-basic";
		case "rare holo cosmos":
			return "holo-cosmos";
		case "rare holo v":
		case "rare holo vunion":
			return "holo-v";
		case "rare holo vmax":
			return "holo-vmax";
		case "rare holo vstar":
			return "holo-vstar";
		case "rare ultra":
			return "ultra";
		case "rare rainbow":
			return "rainbow";
		case "rare rainbow alt":
			return "rainbow-alt";
		case "rare secret":
			return "gold-secret";
		case "amazing rare":
			return "amazing";
		case "radiant rare":
			return "radiant";
		case "trainer gallery rare holo":
			return "trainer-gallery";
		case "rare shiny":
			return "shiny-rare";
		case "rare shiny v":
			return "shiny-v";
		case "rare shiny vmax":
			return "shiny-vmax";
		case "rare shining":
			return "shining";
		default:
			return "holo-basic";
	}
}

/** Back-compat: corpus rarity string → internal class. */
export function getRarityClass(rarity?: string): string {
	return effectiveToClass(getEffectiveRarity(rarity));
}
