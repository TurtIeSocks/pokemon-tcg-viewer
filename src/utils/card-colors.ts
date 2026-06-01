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
