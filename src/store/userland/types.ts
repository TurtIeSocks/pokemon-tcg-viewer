// src/store/userland/types.ts
import type { CardPrinting } from "../../lib/card-variants";
import type { SearchMode } from "../corpus/fuzzy";

/** Raw (ungraded) condition, TCGplayer scale. */
export type CardCondition = "NM" | "LP" | "MP" | "HP" | "DMG";

/** Third-party grading label for a physical stack. */
export interface CardGrading {
	company: string; // "PSA" | "BGS" | "CGC" | "TAG" | "SGC" | … (UI offers a common set)
	grade: number; // e.g. 9.5, 10
	cert: string | null; // slab cert/serial; null = unrecorded
}

/** One physical stack a user owns. Dead value is null; every key is always present. */
export interface Stack {
	id: string; // stack uuidv7 = future DB PK (time-ordered; minted client-side)
	cardId: string; // corpus card id (FK)
	quantity: number; // ≥ 1; count of identical cards in this stack (legacy records normalize to 1)
	acquiredAt: number; // ms epoch; default = add time; editable
	createdAt: number; // ms epoch; record creation; immutable
	updatedAt: number; // ms epoch; bumped on every edit (last-write-wins key for sync)
	deletedAt: number | null; // ms epoch tombstone; null = live. Reserved for the sync adapter — local deletes are hard.
	label: string | null; // user-given name; null = derive from metadata
	pricePaid: number | null; // PER-UNIT price in MINOR UNITS (e.g. cents); null = unknown (≠ 0 = free). Total cost = quantity × pricePaid.
	currency: string; // ISO 4217 code for pricePaid (defaults "USD")
	language: string; // ISO 639-1, default 'en'; distinguishes physical copies of a cardId
	variant: string | null; // printing key, seeded from corpus card.variants
	printing: CardPrinting | null; // exact TCGdex printing; null = coarse/legacy/unknown
	notes: string | null;
	condition: CardCondition | null; // raw state
	grading: CardGrading | null; // null, or a COMPLETE { company, grade }
	source: string | null; // seller / where acquired
	storageLocation: string | null; // binder / box location
	isPrimary: boolean; // user-designated sort-key stack
}

/** The user-editable fields of a stack. */
export type EditableStackFields = Pick<
	Stack,
	| "label"
	| "quantity"
	| "acquiredAt"
	| "pricePaid"
	| "currency"
	| "language"
	| "variant"
	| "printing"
	| "notes"
	| "condition"
	| "grading"
	| "source"
	| "storageLocation"
>;

/** add() input: cardId + any editable fields; repo assigns id/createdAt, defaults acquiredAt, null-fills the rest. */
export type NewStack = {
	cardId: string;
	isPrimary?: boolean; // seed the first stack of a card as primary at insert; defaults false
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
	deletedAt: number | null; // ms epoch tombstone; null = live. Reserved for the sync adapter.
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
	displayLanguage: string; // ISO 639-1; catalog render language; always present (default "en")
	displayCurrency: string; // ISO 4217; portfolio/display currency; always present (default "USD")
	hideValue: boolean; // hide all monetary surfaces; always present (default false)
	createdAt: number; // ms epoch; set on first save
	updatedAt: number; // ms epoch; bumped each save
	deletedAt: number | null; // ms epoch tombstone; null = live. Reserved for the sync adapter.
}

/** update() patch: omitted keys untouched; null clears nullable fields. */
export type ProfilePatch = Partial<
	Pick<
		Profile,
		| "displayName"
		| "bio"
		| "avatarPreset"
		| "favoriteSetId"
		| "displayLanguage"
		| "displayCurrency"
		| "hideValue"
	>
>;

/**
 * Import/export envelope. v5 = language + grading cert; v4 = pricePaid in minor
 * units (cents) + per-stack currency + deletedAt tombstones; v3 added Profile;
 * v2 added Stack.quantity + provenance. Older backups upgrade on import (see
 * backup.ts `upgrade`).
 */
export interface UserDataSnapshot {
	schemaVersion: 5 | 6;
	exportedAt: number;
	collection: Stack[];
	binders: Binder[];
	profile: Profile | null;
}
