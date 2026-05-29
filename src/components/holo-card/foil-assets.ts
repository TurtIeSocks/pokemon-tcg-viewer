/**
 * Per-card foil + mask URL resolution — ported 1:1 from pokemon-holo-cards
 * (dist/index.mjs `getCssRarity` / `buildFoilUrls`), which in turn mirrors
 * simeydotme/pokemon-cards-css's CardProxy.foilMaskImage().
 *
 * These resolve the REAL scanned holo foil + its alpha mask for a card, hosted
 * on the poke-holo CDN. Assets exist only for modern sets (SWSH / SV / PGO);
 * everything older returns null and falls back to the procedural era styles in
 * rarity-styles.css. The mask is the authoritative "foil placement" — it is the
 * actual holographic region of that exact card, so when present we drop the
 * approximate clip-path windows entirely.
 *
 * CDN textures hosted by poke-holo.b-cdn.net (see pokemon-holo-cards credits).
 */

const CDN = "https://poke-holo.b-cdn.net";

/**
 * pokemontcg.io rarity string (lowercased) → the "css rarity" that drives the
 * foil etch/style pick below. Reverse-holo variants are handled before this map
 * (they keep their full "<x> reverse holo" string). Verbatim from the reference.
 */
const RARITY_MAP: Record<string, string> = {
	"rare holo": "rare holo",
	"rare holo v": "rare holo v",
	"rare holo vmax": "rare holo vmax",
	"rare holo vstar": "rare holo vstar",
	"rare holo vunion": "rare holo vunion",
	"rare holo cosmos": "rare holo cosmos",
	"rare ultra": "rare ultra",
	"rare rainbow": "rare rainbow",
	"rare secret": "rare secret",
	"amazing rare": "amazing rare",
	"radiant rare": "radiant rare",
	"rare rainbow alt": "rare rainbow alt",
	"rare shiny": "rare shiny",
	"rare shiny v": "rare shiny v",
	"rare shiny vmax": "rare shiny vmax",
	"trainer gallery rare holo": "trainer gallery rare holo",
	"common reverse holo": "common reverse holo",
	"uncommon reverse holo": "uncommon reverse holo",
	"rare reverse holo": "rare reverse holo",
	"double rare": "double rare",
	"ultra rare": "rare ultra",
	"illustration rare": "illustration rare",
	"special illustration rare": "rare rainbow alt",
	"hyper rare": "hyper rare",
	"shiny rare": "rare shiny v",
	"shiny ultra rare": "rare shiny vmax",
	"ace spec rare": "rare ultra",
	"rare holo ex": "rare holo v",
	"basic v": "rare holo v",
	"rare holo gx": "rare holo v",
	"rare shiny gx": "rare shiny vmax",
	"rare prism star": "rare ultra",
	"rare holo lv.x": "rare holo v",
	"rare prime": "rare prime",
	legend: "rare holo",
	"rare break": "rare holo",
	"rare ace": "rare ultra",
	"black white rare": "rare holo",
	"rare holo star": "rare holo",
	"rare shining": "rare holo",
	"mega hyper rare": "hyper rare",
	"classic collection": "rare ultra",
};

/** Normalize an API rarity to its css-rarity, or null if it has no CDN foil. */
export function getCssRarity(rarity?: string): string | null {
	if (!rarity) return null;
	const lower = rarity.toLowerCase();
	if (lower.endsWith(" reverse holo")) return lower;
	return RARITY_MAP[lower] ?? null;
}

/** True for any reverse-holo css rarity (these get a mask but no --foil). */
export function isReverseRarity(cssRarity: string | null): boolean {
	return !!cssRarity?.endsWith("reverse holo");
}

export interface FoilUrls {
	foilUrl: string;
	maskUrl: string;
}

/**
 * Build the CDN foil + mask URLs for a card, or null when the set has no CDN
 * assets (anything that isn't SWSH / SV / PGO). Verbatim port of the reference
 * etch/style decision table.
 */
export function buildFoilUrls(
	setId: string,
	cardNumber: string,
	cssRarity: string,
	subtypes?: string[],
): FoilUrls | null {
	const rawSet = setId.toLowerCase();
	const fSet = rawSet.replace(/(tg|gg|sv)/, "");
	if (
		!fSet.startsWith("swsh") &&
		!rawSet.startsWith("sv") &&
		rawSet !== "pgo"
	) {
		return null;
	}

	const fRarity = cssRarity.toLowerCase();
	const fNumber = cardNumber.toLowerCase().replace("swsh", "").padStart(3, "0");
	const isTg = !!cardNumber.match(/^[tg]g/i);
	const isShinyVault = cardNumber.toLowerCase().startsWith("sv");
	const hasVmax = !!subtypes?.some((s) => s.toLowerCase() === "vmax");

	let etch = "holo";
	let style = "reverse";

	if (fRarity === "rare holo") style = "swholo";
	if (fRarity === "double rare") {
		etch = "holo";
		style = "sunpillar";
	}
	if (fRarity === "rare holo cosmos") style = "cosmos";
	if (fRarity === "radiant rare") {
		etch = "etched";
		style = "radiantholo";
	}
	if (
		fRarity === "rare holo v" ||
		fRarity === "rare holo vunion" ||
		fRarity === "basic v"
	) {
		etch = "holo";
		style = "sunpillar";
	}
	if (
		fRarity === "rare holo vmax" ||
		fRarity === "rare ultra" ||
		fRarity === "rare holo vstar"
	) {
		etch = "etched";
		style = "sunpillar";
	}
	if (
		fRarity === "amazing rare" ||
		fRarity === "rare rainbow" ||
		fRarity === "rare secret"
	) {
		etch = "etched";
		style = "swsecret";
	}
	if (fRarity === "hyper rare") {
		etch = "etched";
		style = "swsecret";
	}
	if (fRarity === "rare rainbow alt") {
		etch = "etched";
		style = hasVmax ? "swsecret" : "sunpillar";
	}
	if (fRarity === "trainer gallery rare holo") {
		etch = "holo";
		style = "rainbow";
	}
	if (fRarity === "rare shiny v") {
		etch = "etched";
		style = "sunpillar";
	}
	if (fRarity === "rare shiny vmax") {
		etch = "etched";
		style = "swsecret";
	}
	if (isShinyVault) {
		etch = "etched";
		style = "sunpillar";
		if (fRarity === "rare shiny vmax" || fRarity === "rare holo vmax") {
			style = "swsecret";
		}
	}
	if (isTg) {
		etch = "holo";
		style = "rainbow";
		if (fRarity.includes("rare holo v") || fRarity.includes("rare ultra")) {
			etch = "etched";
			style = "sunpillar";
		}
		if (fRarity.includes("rare secret")) {
			etch = "etched";
			style = "swsecret";
		}
	}

	const suffix = `${fNumber}_foil_${etch}_${style}_2x.webp`;
	return {
		foilUrl: `${CDN}/foils/${fSet}/foils/upscaled/${suffix}`,
		maskUrl: `${CDN}/foils/${fSet}/masks/upscaled/${suffix}`,
	};
}
