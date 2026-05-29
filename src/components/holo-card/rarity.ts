/**
 * pokemontcg.io rarity strings → our internal CSS class. Keep the keys
 * verbatim from the API; treat the value as a stable identifier referenced
 * in rarity-styles.css.
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
} as const;

export function getRarityClass(rarity?: string): string {
	if (!rarity) return "no-foil";
	const cls = RARITY_CLASS[rarity as keyof typeof RARITY_CLASS];
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
