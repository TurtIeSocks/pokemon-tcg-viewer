export type SubtypeGroup =
	| "Stage"
	| "Mechanic"
	| "Trainer"
	| "Energy"
	| "Other";

// Seeded from TCGdex's typed-field axes (stage→Stage, suffix→Mechanic,
// trainerType→Trainer, energyType→Energy). The values are pokemontcg.io's
// canon subtype vocab. Extend as new vocab appears; unmapped → "Other".
// "Basic" collides (Basic Pokémon vs Basic Energy); facets are per-page, so on
// a Pokémon page "Basic" is a Stage — default it there.
export const SUBTYPE_GROUP: Record<string, SubtypeGroup> = {
	Basic: "Stage",
	"Stage 1": "Stage",
	"Stage 2": "Stage",
	BREAK: "Stage",
	Restored: "Stage",
	MEGA: "Stage",
	"Level-Up": "Stage",
	Baby: "Stage",
	"V-UNION": "Stage",
	ex: "Mechanic",
	EX: "Mechanic",
	GX: "Mechanic",
	V: "Mechanic",
	VMAX: "Mechanic",
	VSTAR: "Mechanic",
	Tera: "Mechanic",
	Radiant: "Mechanic",
	"TAG TEAM": "Mechanic",
	Prime: "Mechanic",
	LEGEND: "Mechanic",
	Star: "Mechanic",
	Shining: "Mechanic",
	Amazing: "Mechanic",
	Ancient: "Mechanic",
	Future: "Mechanic",
	"Single Strike": "Mechanic",
	"Rapid Strike": "Mechanic",
	"Fusion Strike": "Mechanic",
	Item: "Trainer",
	Supporter: "Trainer",
	Stadium: "Trainer",
	"Pokémon Tool": "Trainer",
	"Technical Machine": "Trainer",
	"ACE SPEC": "Trainer",
	Special: "Energy",
};

// Display order of the groups + their on-screen labels.
const GROUP_ORDER: { key: SubtypeGroup; label: string }[] = [
	{ key: "Stage", label: "Stage" },
	{ key: "Mechanic", label: "Pokémon Mechanic" },
	{ key: "Trainer", label: "Trainer" },
	{ key: "Energy", label: "Energy" },
	{ key: "Other", label: "Other" },
];

// Stage renders in evolution order, not alphabetical.
const STAGE_ORDER = [
	"Basic",
	"Baby",
	"Level-Up",
	"Stage 1",
	"Stage 2",
	"MEGA",
	"BREAK",
	"V-UNION",
	"Restored",
];

export function groupSubtypes(
	options: string[],
): { label: string; items: string[] }[] {
	const buckets = new Map<SubtypeGroup, string[]>();
	for (const o of options) {
		const g = SUBTYPE_GROUP[o] ?? "Other";
		const arr = buckets.get(g) ?? [];
		arr.push(o);
		buckets.set(g, arr);
	}
	return GROUP_ORDER.flatMap(({ key, label }) => {
		const items = buckets.get(key);
		if (!items?.length) return [];
		items.sort(
			key === "Stage"
				? (a, b) => STAGE_ORDER.indexOf(a) - STAGE_ORDER.indexOf(b)
				: (a, b) => a.localeCompare(b),
		);
		return [{ label, items }];
	});
}
