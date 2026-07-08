/**
 * Canonical rarity order, least → most rare. Pokémon TCG has no numeric rarity
 * rank in the data, so this is a hand-curated ladder covering every rarity the
 * corpus uses (the keys of `RARITY_EFFECTIVE` in components/holo-card/rarity.ts;
 * a test asserts full coverage). Western (pokemontcg.io) names lead each tier,
 * with the TCGdex/JP and TCG-Pocket equivalents slotted alongside. The exact
 * intra-tier order is a judgement call — the base ladder (Common → Uncommon →
 * Rare → holos → ultras → secrets) is what matters.
 */
export const RARITY_ORDER: readonly string[] = [
	// Unrarified + base ladder (Pocket "Diamonds" are its commons ladder).
	"None",
	"Common",
	"One Diamond",
	"Uncommon",
	"Two Diamond",
	"Rare",
	"Three Diamond",
	// Basic holos.
	"Rare Holo",
	"Holo Rare",
	"Black White Rare",
	"Rare Holo Cosmos",
	"Reverse Holo",
	// Older special rares (LV.X / Prime / BREAK / LEGEND / Star / Prism / Shining).
	"Rare Holo LV.X",
	"Rare Prime",
	"Rare BREAK",
	"LEGEND",
	"Rare Holo LEGEND",
	"Rare Holo Star",
	"Rare Prism Star",
	"Prism Rare",
	"Rare Shining",
	"Shining",
	"Kagayaku",
	// Radiant / Amazing.
	"Radiant Rare",
	"Amazing Rare",
	// EX / GX / V family + Double/Triple/MEGA full-card holos.
	"Rare Holo EX",
	"Rare Holo GX",
	"Rare Holo V",
	"Holo Rare V",
	"Rare Holo VUNION",
	"Rare Holo VMAX",
	"Holo Rare VMAX",
	"Rare Holo VSTAR",
	"Holo Rare VSTAR",
	"Double Rare",
	"Four Diamond",
	"MEGA_ATTACK_RARE",
	"Triple Rare",
	// ACE SPEC.
	"Rare ACE",
	"ACE SPEC Rare",
	"ACE Rare",
	// Ultra rares (full art).
	"Rare Ultra",
	"Ultra Rare",
	"Super Rare",
	"Super Rare Holo",
	"One Star",
	// Trainer Gallery / Illustration / Art rares.
	"Trainer Gallery Rare Holo",
	"Illustration Rare",
	"Art Rare",
	"Trainer Rare",
	"Character Rare",
	// Shinies.
	"Rare Shiny",
	"Shiny Rare",
	"Rare Shiny GX",
	"Shiny Rare V",
	"Shiny Rare VMAX",
	"One Shiny",
	"Two Shiny",
	"Shiny Ultra Rare",
	"Shiny Secret Rare",
	// Special Illustration / rainbow-alt.
	"Special Illustration Rare",
	"Special Art Rare",
	"Two Star",
	// Rainbow / Hyper.
	"Rare Rainbow",
	"Hyper Rare",
	"Mega Hyper Rare",
	"Character Super Rare",
	"Three Star",
	// Secret / Crown (top of the ladder).
	"Rare Secret",
	"Secret Rare",
	"Crown Rare",
	"Classic Collection",
	// Promo — no fixed slot; keep last so it sorts after the graded ladder.
	"Promo",
];

// Case-insensitive rank lookup. The Asian region carries raw TCGdex rarity in
// sentence case ("Double rare") vs the ptcg.io title case here — fold case (no
// two entries differ only by case), matching components/holo-card/rarity.ts.
const RANK_BY_RARITY = new Map(
	RARITY_ORDER.map((r, i) => [r.toLowerCase(), i]),
);

/** Rank of a rarity in {@link RARITY_ORDER}; unknown/empty sorts last. */
export function rarityRank(rarity?: string | null): number {
	if (!rarity) return RARITY_ORDER.length;
	return RANK_BY_RARITY.get(rarity.toLowerCase()) ?? RARITY_ORDER.length;
}

/** Compare two rarities by rank, then name (stable order for same-rank/unknowns). */
export function compareRarity(a: string, b: string): number {
	return rarityRank(a) - rarityRank(b) || a.localeCompare(b);
}
