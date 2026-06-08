// src/components/profile/avatar-presets.ts

/** A named gradient option for the collector avatar (a tiny serialisable value, DB-ready). */
export interface AvatarPreset {
	id: string;
	name: string;
	/** A CSS background value (gradient). */
	gradient: string;
}

/** The default preset id; matches the legacy sidebar footer gradient. */
export const DEFAULT_AVATAR_PRESET_ID = "dusk";

/** Built-in avatar gradients in the violet/accent family. */
export const AVATAR_PRESETS: AvatarPreset[] = [
	{
		id: "dusk",
		name: "Dusk",
		gradient:
			"linear-gradient(135deg, oklch(0.5 0.12 290), oklch(0.4 0.1 320))",
	},
	{
		id: "violet",
		name: "Violet",
		gradient:
			"linear-gradient(135deg, oklch(0.7 0.19 295), oklch(0.5 0.16 290))",
	},
	{
		id: "ocean",
		name: "Ocean",
		gradient:
			"linear-gradient(135deg, oklch(0.62 0.13 230), oklch(0.45 0.12 260))",
	},
	{
		id: "ember",
		name: "Ember",
		gradient:
			"linear-gradient(135deg, oklch(0.68 0.17 35), oklch(0.5 0.16 12))",
	},
	{
		id: "meadow",
		name: "Meadow",
		gradient:
			"linear-gradient(135deg, oklch(0.7 0.15 150), oklch(0.5 0.13 175))",
	},
	{
		id: "gold",
		name: "Gold",
		gradient:
			"linear-gradient(135deg, oklch(0.78 0.13 85), oklch(0.6 0.12 60))",
	},
];

/** Look up a preset by id; falls back to the default for unknown/empty ids. */
export function getAvatarPreset(id: string): AvatarPreset {
	return (
		AVATAR_PRESETS.find((p) => p.id === id) ??
		AVATAR_PRESETS.find((p) => p.id === DEFAULT_AVATAR_PRESET_ID) ??
		AVATAR_PRESETS[0]
	);
}

/** First letters of the first and last word, uppercased (1-2 chars; "" when blank). */
export function initialsFrom(displayName: string): string {
	const words = displayName.trim().split(/\s+/).filter(Boolean);
	if (words.length === 0) return "";
	if (words.length === 1) return words[0][0].toUpperCase();
	return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}
