// src/store/userland/types.ts

/** Raw (ungraded) condition, TCGplayer scale. */
export type CardCondition = "NM" | "LP" | "MP" | "HP" | "DMG";

/** Third-party grading label for a physical copy. */
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
	isPrimary?: boolean; // user-designated sort key copy; absent = not primary
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
export type CopyPatch = Partial<
	EditableCopyFields & Pick<CollectionItem, "isPrimary">
>;

/** A serialized search/filter query that defines the dynamic membership of a Binder rule. */
export interface SerializedQuery {
	text: string | null;
	setId: string | null;
	dexNumber: number | null;
	types: string[];
	rarities: string[];
	supertypes: string[];
	subtypes: string[];
	yearMin: number | null;
	yearMax: number | null;
}

/** A single dynamic rule inside a Binder; cards matching the query are included. */
export interface BinderRule {
	id: string;
	query: SerializedQuery;
}

/** A user-defined card binder with hybrid membership: dynamic rules + explicit include/exclude lists. */
export interface Binder {
	id: string;
	name: string;
	description: string | null;
	rules: BinderRule[];
	includeCardIds: string[];
	excludeCardIds: string[];
	createdAt: number;
	updatedAt: number;
}

/** create() input. Repo assigns id/createdAt/updatedAt; fills description=null, rules=[], includeCardIds=[], excludeCardIds=[]. */
export type NewBinder = {
	name: string;
	description?: string | null;
};

/** update() patch for a binder; omitted keys are left untouched. */
export type BinderPatch = Partial<
	Pick<Binder, "name" | "description" | "rules" | "includeCardIds" | "excludeCardIds">
>;

/** Import/export envelope. */
export interface UserDataSnapshot {
	schemaVersion: 1;
	exportedAt: number;
	collection: CollectionItem[];
	binders: Binder[];
}
