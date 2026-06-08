// src/store/userland/types.ts
import type { SearchMode } from "../corpus/fuzzy";

/** Raw (ungraded) condition, TCGplayer scale. */
export type CardCondition = "NM" | "LP" | "MP" | "HP" | "DMG";

/** Third-party grading label for a physical stack. */
export interface CardGrading {
	company: string; // "PSA" | "BGS" | "CGC" | "TAG" | "SGC" | … (UI offers a common set)
	grade: number; // e.g. 9.5, 10
}

/** One physical stack a user owns. Dead value is null; every key is always present. */
export interface Stack {
	id: string; // stack uuid = future DB PK
	cardId: string; // corpus card id (FK)
	quantity: number; // ≥ 1; count of identical cards in this stack (legacy records normalize to 1)
	acquiredAt: number; // ms epoch; default = add time; editable
	createdAt: number; // ms epoch; record creation; immutable
	label?: string | null; // user-given name; absent/null = derive from metadata (stacks persisted before this field lack the key)
	pricePaid: number | null; // PER-UNIT price; null = unknown (≠ 0 = free). Total cost = quantity × pricePaid.
	variant: string | null; // printing key, seeded from corpus card.variants
	notes: string | null;
	condition: CardCondition | null; // raw state
	grading: CardGrading | null; // null, or a COMPLETE { company, grade }
	source: string | null; // seller / where acquired
	storageLocation: string | null; // binder / box location
	isPrimary?: boolean; // user-designated sort key stack; absent = not primary
}

/** The user-editable fields of a stack. */
export type EditableStackFields = Pick<
	Stack,
	| "label"
	| "quantity"
	| "acquiredAt"
	| "pricePaid"
	| "variant"
	| "notes"
	| "condition"
	| "grading"
	| "source"
	| "storageLocation"
>;

/** add() input: cardId + any editable fields; repo assigns id/createdAt, defaults acquiredAt, null-fills the rest. */
export type NewStack = {
	cardId: string;
} & Partial<EditableStackFields>;

/** update() patch: field: null clears; omitted key leaves untouched. */
export type StackPatch = Partial<
	EditableStackFields & Pick<Stack, "isPrimary">
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
	/**
	 * Search mode for text matching: "exact" (whole name only), "contains"
	 * (prefix+substring), or "fuzzy" (default, adds typo tolerance). Rules
	 * persisted before this field existed lack the key; readers default to "fuzzy".
	 */
	mode: SearchMode;
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
	Pick<
		Binder,
		"name" | "description" | "rules" | "includeCardIds" | "excludeCardIds"
	>
>;

/** The local collector's profile. Singleton today; one row per auth user under a DB adapter. */
export interface Profile {
	id: string; // local: fixed "me"; DB: auth uid / PK
	displayName: string; // UI falls back to "Collector" when empty
	bio: string | null; // free text; null = unset
	avatarPreset: string; // key into AVATAR_PRESETS (gradient); never an uploaded image
	favoriteSetId: string | null; // corpus set id (FK); null = none picked
	createdAt: number; // ms epoch; set on first save
	updatedAt: number; // ms epoch; bumped each save
}

/** update() patch: omitted keys untouched; null clears nullable fields. */
export type ProfilePatch = Partial<
	Pick<Profile, "displayName" | "bio" | "avatarPreset" | "favoriteSetId">
>;

/** Import/export envelope. v2 added Stack.quantity + source + storageLocation; v1 backups upgrade on import. */
export interface UserDataSnapshot {
	schemaVersion: 2;
	exportedAt: number;
	collection: Stack[];
	binders: Binder[];
}
