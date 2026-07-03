/**
 * Card rarity string → our internal CSS class. Keys are verbatim from the
 * source (pokemontcg.io for the Western corpus, raw TCGdex for the Asian
 * region); the value is a stable identifier referenced in rarity-styles.css.
 *
 * Plain Common / Uncommon / Rare have no foil — they map to "no-foil"
 * explicitly so they don't hit the warn-and-fallback path.
 */
const RARITY_CLASS = {
	Common: "no-foil",
	Uncommon: "no-foil",
	Rare: "no-foil",

	"Rare Holo": "holo-basic",
	"Rare Holo EX": "holo-basic",
	"Rare Holo GX": "holo-basic",
	"Rare Holo LV.X": "holo-basic",
	"Rare Holo V": "holo-v",
	"Rare Holo VMAX": "holo-vmax",
	"Rare Holo VSTAR": "holo-vstar",
	"Rare BREAK": "holo-basic",
	"Rare Prime": "holo-basic",
	"Rare ACE": "holo-basic",
	"Rare Shiny": "holo-basic",
	"Rare Shiny GX": "holo-basic",

	"Reverse Holo": "reverse-holo",
	"Amazing Rare": "amazing",
	"Radiant Rare": "radiant",
	"Trainer Gallery Rare Holo": "trainer-gallery",

	"Rare Rainbow": "rainbow",
	"Rare Secret": "gold-secret",
	"Rare Ultra": "ultra",
	"Rare Shining": "shining",

	"Hyper Rare": "rainbow",
	"Illustration Rare": "trainer-gallery",
	"Special Illustration Rare": "trainer-gallery",
	"Ultra Rare": "ultra",
	// Double Rare (SV ex) is a full-card sheen, NOT a classic art-window holo —
	// holo-basic would clip it to the centre. Use the full-card sunpillar (holo-v).
	"Double Rare": "holo-v",
	// SV Shiny Vault — sparkly full-art; closest procedural is the glitter rainbow.
	"Shiny Rare": "rainbow",
	"Shiny Ultra Rare": "rainbow",
	Promo: "holo-basic",
	LEGEND: "holo-basic",
	"Classic Collection": "holo-basic",

	// --- TCGdex-native (Asian region) rarities. Enumerated from the built ja
	// corpus; foil class picked to mirror the closest Western tier. Cosmetic
	// (foil texture only), so a sensible mapping beats the generic fallback and
	// silences the per-card warn. "None" is TCGdex's unrarified sentinel.
	None: "no-foil",
	"Holo Rare": "holo-basic",
	"Super Rare": "ultra", // JP SR — full-art
	"Super Rare Holo": "ultra",
	"Art Rare": "trainer-gallery", // JP AR ≈ Illustration Rare
	"Special Art Rare": "trainer-gallery", // JP SAR ≈ Special Illustration Rare
	"Character Rare": "trainer-gallery", // CHR — full-art character
	"Character Super Rare": "rainbow", // CSR — premium full-art character
	"Trainer Rare": "trainer-gallery",
	"Triple Rare": "holo-v", // RRR — full-card sheen like Double Rare
	"Prism Rare": "holo-basic", // Prism Star
	"ACE Rare": "holo-basic", // ACE SPEC, cf. "Rare ACE"
	"Secret Rare": "gold-secret", // cf. "Rare Secret"
	"Shiny Secret Rare": "rainbow",
	"Rare Holo LEGEND": "holo-basic", // cf. LEGEND
	Kagayaku: "shining", // 輝く — Shining Pokémon
	Shining: "shining",
	"Mega Hyper Rare": "rainbow", // cf. Hyper Rare
	"Black White Rare": "holo-basic",
} as const;

export const KNOWN_RARITIES: ReadonlySet<string> = new Set(
	Object.keys(RARITY_CLASS),
);

// Case-insensitive index. The Asian region carries raw TCGdex rarity (no
// pokemontcg.io overlay to normalize it), and TCGdex uses sentence case
// ("Double rare") where RARITY_CLASS is keyed in ptcg.io title case
// ("Double Rare"). No two keys differ only by case, so folding case is safe and
// lets a JP "Double rare" resolve to the same foil class as a Western one.
const RARITY_CLASS_LOWER: Record<string, string> = Object.fromEntries(
	Object.entries(RARITY_CLASS).map(([k, v]) => [k.toLowerCase(), v]),
);

export function getRarityClass(rarity?: string): string {
	if (!rarity) return "no-foil";
	const cls =
		RARITY_CLASS[rarity as keyof typeof RARITY_CLASS] ??
		RARITY_CLASS_LOWER[rarity.toLowerCase()];
	if (cls !== undefined) return cls;
	// Vite sets import.meta.env.DEV in dev / PROD in prod. Under `bun test`
	// neither is defined, so we check `PROD !== true` to fire the warning in
	// both dev-server and test runs while staying silent in `vite build`
	// output.
	if (import.meta.env.PROD !== true) {
		console.warn(
			`[holo-card] Unknown rarity "${rarity}" — using generic holo fallback`,
		);
	}
	return "holo-basic";
}
