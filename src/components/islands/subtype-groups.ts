import { m } from "@/paraglide/messages";

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
	Stage1: "Stage",
	"Stage 2": "Stage",
	Stage2: "Stage",
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

// Display order of the groups + their on-screen labels. Thunks, not plain
// strings — see {@link NavDestination.label} in command-palette-data.ts.
const GROUP_ORDER: { key: SubtypeGroup; label: () => string }[] = [
	{ key: "Stage", label: () => m.subtype_group_stage() },
	{ key: "Mechanic", label: () => m.subtype_group_mechanic() },
	{ key: "Trainer", label: () => m.subtype_group_trainer() },
	{ key: "Energy", label: () => m.home_supertype_energy() },
	{ key: "Other", label: () => m.subtype_group_other() },
];

// Stage renders in evolution order, not alphabetical.
const STAGE_ORDER = [
	"Basic",
	"Baby",
	"Level-Up",
	"Stage 1",
	"Stage1",
	"Stage 2",
	"Stage2",
	"MEGA",
	"BREAK",
	"V-UNION",
	"Restored",
];

// STAGE_ORDER should list every Stage member; an unmapped one ranks last, never first.
const stageRank = (s: string): number => {
	const i = STAGE_ORDER.indexOf(s);
	return i === -1 ? Number.POSITIVE_INFINITY : i;
};

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
				? (a, b) => stageRank(a) - stageRank(b)
				: (a, b) => a.localeCompare(b),
		);
		return [{ label: label(), items }];
	});
}
