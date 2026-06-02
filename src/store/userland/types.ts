// src/store/userland/types.ts

/** Raw (ungraded) condition, TCGplayer scale. */
export type CardCondition = "NM" | "LP" | "MP" | "HP" | "DMG";

export interface CardGrading {
	company: string; // "PSA" | "BGS" | "CGC" | "TAG" | "SGC" | … (UI offers a common set)
	grade: number; // e.g. 9.5, 10
}

/** One physical copy a user owns. Dead value is null; every key is always present. */
export interface CollectionItem {
	id: string; // copy uuid = future DB PK
	cardId: string; // corpus card id (FK)
	acquiredAt: number; // ms epoch; default = add time; editable
	createdAt: number; // ms epoch; record creation; immutable
	pricePaid: number | null; // null = unknown (≠ 0 = free)
	variant: string | null; // printing key, seeded from corpus card.variants
	notes: string | null;
	condition: CardCondition | null; // raw state
	grading: CardGrading | null; // null, or a COMPLETE { company, grade }
}

/** The user-editable fields of a copy. */
export type EditableCopyFields = Pick<
	CollectionItem,
	"acquiredAt" | "pricePaid" | "variant" | "notes" | "condition" | "grading"
>;

/** add() input: cardId + any editable fields; repo assigns id/createdAt, defaults acquiredAt, null-fills the rest. */
export type NewCollectionItem = {
	cardId: string;
} & Partial<EditableCopyFields>;

/** update() patch: field: null clears; omitted key leaves untouched. */
export type CopyPatch = Partial<EditableCopyFields>;

export type GoalTarget =
	| { kind: "set"; setId: string }
	| { kind: "series"; series: string }
	| { kind: "card"; cardId: string };

export interface Goal {
	id: string;
	name: string;
	description: string | null;
	targets: GoalTarget[];
	createdAt: number;
	updatedAt: number;
}

/** create() input. Repo assigns id/createdAt/updatedAt; fills description=null, targets=[]. */
export type NewGoal = {
	name: string;
	description?: string | null;
	targets?: GoalTarget[];
};

export type GoalPatch = Partial<Pick<Goal, "name" | "description" | "targets">>;

/** Import/export envelope. */
export interface UserDataSnapshot {
	schemaVersion: 1;
	exportedAt: number;
	collection: CollectionItem[];
	goals: Goal[];
}
