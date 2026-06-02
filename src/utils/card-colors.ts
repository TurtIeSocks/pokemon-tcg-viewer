const TYPE_COLORS: Record<string, string> = {
	Colorless: "#A8A878",
	Darkness: "#705848",
	Dragon: "#7038F8",
	Fairy: "#EE99AC",
	Fighting: "#C03028",
	Fire: "#F08030",
	Grass: "#78C850",
	Lightning: "#F8D030",
	Metal: "#B8B8D0",
	Psychic: "#F85888",
	Water: "#6890F0",
};

/** Fallback accent for Trainer/Energy cards with no energy types. */
export const NEUTRAL_ACCENT = "#c9a86a";

/** Energy-type → swatch hex. Unknown types fall back to colorless. */
export function getTypeColor(type: string): string {
	return TYPE_COLORS[type] ?? "#A8A878";
}

/** Rarity → tier hex for badges. Empty/unknown → neutral grey. */
export function getRarityColor(rarity: string): string {
	if (!rarity) return "#9ca3af";
	const lower = rarity.toLowerCase();
	if (lower.includes("secret") || lower.includes("rainbow")) return "#fbbf24";
	if (lower.includes("ultra")) return "#a855f7";
	if (lower.includes("holo") || lower.includes("rare")) return "#3b82f6";
	if (lower.includes("uncommon")) return "#22c55e";
	return "#9ca3af";
}

/** Primary accent color for a card based on its energy types. */
export function getCardAccent(types?: string[]): string {
	if (!types || types.length === 0) return NEUTRAL_ACCENT;
	return getTypeColor(types[0]);
}

// --- internal helpers for getReadableAccent ---

function hexToRgb(hex: string): [number, number, number] {
	const n = hex.replace("#", "");
	return [
		Number.parseInt(n.slice(0, 2), 16),
		Number.parseInt(n.slice(2, 4), 16),
		Number.parseInt(n.slice(4, 6), 16),
	];
}

function toLinear(c: number): number {
	const s = c / 255;
	return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(r: number, g: number, b: number): number {
	return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function contrastVsDark(r: number, g: number, b: number): number {
	// dark bg #0d0d0f has luminance ≈ 0.002
	const bgLum = 0.2126 * toLinear(13) + 0.7152 * toLinear(13) + 0.0722 * toLinear(15);
	const fgLum = relativeLuminance(r, g, b);
	const lighter = Math.max(fgLum, bgLum);
	const darker = Math.min(fgLum, bgLum);
	return (lighter + 0.05) / (darker + 0.05);
}

function toHex2(n: number): string {
	return Math.round(n).toString(16).padStart(2, "0");
}

/**
 * Lightens `hex` toward white in small steps until WCAG contrast ≥ 4.5
 * against the near-black panel background `#0d0d0f`. Pure, deterministic.
 * Colors already meeting the threshold are returned unchanged.
 */
export function getReadableAccent(hex: string): string {
	let [r, g, b] = hexToRgb(hex);
	const STEP = 0.04; // mix ratio toward white per iteration
	for (let i = 0; i < 200; i++) {
		if (contrastVsDark(r, g, b) >= 4.5) break;
		r = r + (255 - r) * STEP;
		g = g + (255 - g) * STEP;
		b = b + (255 - b) * STEP;
	}
	return `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`;
}
