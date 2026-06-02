/** SVG path `d` strings for energy-type glyphs, centered in a 20×20 viewBox. */
export const ENERGY_GLYPHS: Record<string, string> = {
	// 5-point star
	Colorless: "M10 2 l1.9 5.8H18l-4.9 3.6 1.9 5.8L10 14l-5 3.2 1.9-5.8L2 8h6.1z",
	// crescent moon
	Darkness: "M10 3a7 7 0 1 0 7 7 5 5 0 1 1-7-7z",
	// angular diamond / twin-triangle
	Dragon: "M10 2 L16 8 10 11 4 8z M10 11 L16 12 10 18 4 12z",
	// 4-point sparkle
	Fairy: "M10 2 L11 9 18 10 11 11 10 18 9 11 2 10 9 9z",
	// fist / punching shape
	Fighting: "M7 14 V9 H9 V7 H11 V9 H13 V11 H15 V14 H13 V11 H11 V14z",
	// simple flame
	Fire: "M10 18 C4 18 5 12 8 10 7 13 9 13 9 11 10 14 12 13 12 11 15 13 16 18 10 18z",
	// leaf
	Grass: "M10 17 C10 17 3 13 4 7 4 7 10 4 14 9 L10 17z M10 17 L10 10",
	// lightning bolt
	Lightning: "M11 2 L6 11 10 11 9 18 14 9 10 9z",
	// hex / gear simplified
	Metal:
		"M10 4 L12.5 5.5 12.5 8.5 10 10 7.5 8.5 7.5 5.5z M10 10 L12.5 11.5 12.5 14.5 10 16 7.5 14.5 7.5 11.5z",
	// swirl / eye
	Psychic:
		"M10 5 a5 5 0 1 1 0 10 a5 5 0 1 1 0-10z M10 7.5 a2.5 2.5 0 1 0 0 5 a2.5 2.5 0 0 0 0-5z",
	// droplet
	Water: "M10 3 C10 3 4 11 4 14 a6 6 0 0 0 12 0 C16 11 10 3 10 3z",
};

/** Fallback glyph for unknown energy types (Colorless star). */
export const ENERGY_GLYPH_FALLBACK: string = ENERGY_GLYPHS.Colorless;
