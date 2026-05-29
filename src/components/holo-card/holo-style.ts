import { getRarityClass } from "./rarity";

/**
 * Pokémon TCG series (lowercased `set.series`) whose classic Rare Holo cards
 * used the vintage **cosmos / galaxy** holofoil — the starfield sheen — rather
 * than a flat rainbow sheet. This is the era lever for the procedural fallback.
 *
 * ── HOW THIS INTERACTS WITH THE CDN PATH ──────────────────────────────────────
 * Modern SWSH / SV / PGO cards resolve a REAL per-card foil+mask from the CDN
 * (see useFoilAssets) and never reach this table. So this only decides the look
 * of OLDER sets, which have no CDN assets.
 *
 * ── USER-EDITABLE ─────────────────────────────────────────────────────────────
 * Add / remove series here to tune which eras render as cosmos vs the default
 * `holo-basic` (rainbow-scanline). Values are the pokemontcg.io `series` strings,
 * lowercased. If unsure, leave a series out — it falls back to holo-basic.
 */
export const COSMOS_SERIES: ReadonlySet<string> = new Set([
	"base",
	"gym",
	"neo",
	"e-card",
	"ex",
	"pop",
	"diamond & pearl",
	"platinum",
	"heartgold & soulsilver",
	"call of legends",
	"black & white",
	"xy",
	"sun & moon",
	"np", // Nintendo Black Star Promos — vintage cosmos foil
]);

/**
 * Specific set ids that use cosmos foil regardless of their `series` — for
 * modern-era sets that reprint/use the vintage galaxy foil. e.g. Celebrations
 * (cel25) sits under the "Sword & Shield" series but its holos are cosmos.
 * Lowercased set ids. USER-EDITABLE.
 */
export const COSMOS_SETS: ReadonlySet<string> = new Set([
	"cel25", // Celebrations
]);

/**
 * Interpret TCGplayer price-variant keys as a holo signal:
 *   • has "holofoil"        → true  (holo printing)
 *   • has "normal", no holo → false (non-holo printing — should not foil)
 *   • no usable data        → undefined (unknown — keep the rarity heuristic)
 *
 * The API exposes no explicit holo flag, so the printing variants are the proxy.
 * `undefined` must NEVER be treated as non-holo, or real holos with missing
 * TCGplayer data (lots of vintage/foreign cards) would be wrongly flattened.
 */
export function variantsToHolo(variants?: string[]): boolean | undefined {
	if (!variants || variants.length === 0) return undefined;
	if (variants.includes("holofoil")) return true;
	if (variants.includes("normal")) return false;
	return undefined; // e.g. reverseHolofoil-only — ambiguous, defer to rarity
}

/**
 * Pick the holo CSS class from rarity + set series + (optional) holo signal +
 * set id.
 *   • holo === false → no-foil (a known non-holo printing, e.g. basep-8) — this
 *     overrides the rarity heuristic so non-holo promos/rares stay flat.
 *   • "Classic Collection" (Celebrations vintage reprints) → cosmos.
 *   • otherwise: classic holos (→ `holo-basic`) reroute to `holo-cosmos` for the
 *     vintage galaxy-foil eras (by series) or specific cosmos sets (by id);
 *     everything else is rarity-driven.
 */
export function getHoloClass(
	rarity?: string,
	series?: string,
	holo?: boolean,
	setId?: string,
): string {
	if (holo === false) return "no-foil";
	if (rarity?.toLowerCase() === "classic collection") return "holo-cosmos";
	const cls = getRarityClass(rarity);
	if (
		cls === "holo-basic" &&
		((series && COSMOS_SERIES.has(series.toLowerCase())) ||
			(setId && COSMOS_SETS.has(setId.toLowerCase())))
	) {
		return "holo-cosmos";
	}
	return cls;
}
