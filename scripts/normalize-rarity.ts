// TCGdex rarity string → pokemontcg.io foil-table vocab. Only the values that
// diverge from the ptcg vocab the foil tables (rarity.ts) expect. Extend by
// auditing the built corpus (see the audit command in this task).
const RARITY_FIX: Record<string, string> = {
	"Holo Rare": "Rare Holo",
	"Hyper rare": "Hyper Rare",
	"Shiny rare": "Rare Shiny",
	"Shiny rare V": "Rare Shiny V",
	"Full Art Trainer": "Ultra Rare",
	"ACE SPEC Rare": "Rare Ultra",
	Crown: "Hyper Rare",
};

// The mechanic carried in TCGdex `suffix` maps a coarse rarity to its foil tier.
const SUFFIX_FOIL: { test: RegExp; rarity: string }[] = [
	{ test: /VMAX/i, rarity: "Rare Holo VMAX" },
	{ test: /VSTAR/i, rarity: "Rare Holo VSTAR" },
	{ test: /GX/i, rarity: "Rare Holo GX" },
	{ test: /\bV\b|V-UNION/i, rarity: "Rare Holo V" },
	{ test: /EX/i, rarity: "Rare Holo EX" },
];

const COARSE = new Set(["Rare", "Ultra Rare", "Secret Rare"]);

/**
 * Normalize a TCGdex rarity (for cards with NO ptcg overlay) to the vocab the
 * foil CSS tables are keyed on. Prefers an explicit fix; else, for a coarse
 * rarity, derives the foil tier from the card's mechanic `suffix`; else returns
 * the input unchanged.
 */
export function normalizeTcgdexRarity(
	rarity: string | undefined,
	suffix: string | undefined,
): string | undefined {
	if (!rarity) return rarity;
	if (RARITY_FIX[rarity]) return RARITY_FIX[rarity];
	if (suffix && COARSE.has(rarity)) {
		const hit = SUFFIX_FOIL.find((s) => s.test.test(suffix));
		if (hit) return hit.rarity;
	}
	return rarity;
}
