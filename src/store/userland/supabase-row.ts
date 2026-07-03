// src/store/userland/supabase-row.ts
//
// Pure row↔domain mappers — the SINGLE conversion boundary between the
// camelCase domain types and the snake_case Postgres rows that supabase-js
// returns/sends. No network, no side-effects, fully unit-testable.
//
// Responsibilities:
//   • camelCase ↔ snake_case
//   • ms-epoch numbers ↔ ISO timestamptz strings
//   • grading { company, grade, cert } ↔ (grading_company, grading_grade, grading_cert)
//     — both-or-neither for company/grade enforced by DB constraint; cert is independent
//   • rules ↔ jsonb (supabase-js returns parsed objects, pass through)
//   • printing ↔ printing (jsonb; supabase-js returns parsed value, pass through)
//   • includeCardIds / excludeCardIds ↔ text[]
//   • language + pricePaid: passthrough (same types, just rename)
//
// Null discipline: null in, null out; never undefined.
// Profile id remap ("me" → uid) is the CLAIM's responsibility — mapper uses id as-is.

import type { CardPrinting } from "../../lib/card-variants";
import type { Binder, BinderRule, Profile, Stack } from "./types";

// ── Row shapes ────────────────────────────────────────────────────────────────
// These mirror the Postgres column names returned by supabase-js.
// Note: user_id is intentionally absent — the DB stamps it from auth.uid(); app
// never reads or writes it via the mapper.

export interface StackRow {
	id: string;
	// user_id omitted: stamped by DB default auth.uid(); not needed client-side
	card_id: string;
	quantity: number;
	acquired_at: string; // timestamptz ISO
	created_at: string;
	updated_at: string;
	deleted_at: string | null;
	label: string | null;
	price_paid: number | null;
	currency: string;
	language: string;
	variant: string | null;
	printing: CardPrinting | null;
	notes: string | null;
	condition: string | null;
	grading_company: string | null;
	grading_grade: number | null;
	grading_cert: string | null;
	source: string | null;
	storage_location: string | null;
	is_primary: boolean;
}

export interface BinderRow {
	id: string;
	// user_id omitted
	name: string;
	description: string | null;
	rules: BinderRule[]; // jsonb; supabase-js returns parsed value
	include_card_ids: string[];
	exclude_card_ids: string[];
	created_at: string;
	updated_at: string;
	deleted_at: string | null;
}

export interface ProfileRow {
	id: string; // IS the auth uid; mapper uses as-is
	display_name: string;
	bio: string | null;
	avatar_preset: string;
	favorite_set_id: string | null;
	display_language: string; // ISO 639-1 catalog render language (default "en")
	display_currency: string; // ISO 4217 display/portfolio currency (default "USD")
	created_at: string;
	updated_at: string;
	deleted_at: string | null;
}

// ── Timestamp helpers ─────────────────────────────────────────────────────────

function msToIso(ms: number): string {
	return new Date(ms).toISOString();
}

function isoToMs(iso: string): number {
	return new Date(iso).getTime();
}

function msOrNullToIso(ms: number | null): string | null {
	return ms === null ? null : msToIso(ms);
}

function isoOrNullToMs(iso: string | null): number | null {
	return iso === null ? null : isoToMs(iso);
}

// ── Stack mappers ─────────────────────────────────────────────────────────────

/** Convert a domain Stack to a Postgres row ready for insert/update. */
export function stackToRow(stack: Stack): StackRow {
	return {
		id: stack.id,
		card_id: stack.cardId,
		quantity: stack.quantity,
		acquired_at: msToIso(stack.acquiredAt),
		created_at: msToIso(stack.createdAt),
		updated_at: msToIso(stack.updatedAt),
		deleted_at: msOrNullToIso(stack.deletedAt),
		label: stack.label,
		price_paid: stack.pricePaid,
		currency: stack.currency,
		language: stack.language,
		variant: stack.variant,
		printing: stack.printing,
		notes: stack.notes,
		condition: stack.condition,
		grading_company: stack.grading?.company ?? null,
		grading_grade: stack.grading?.grade ?? null,
		grading_cert: stack.grading?.cert ?? null,
		source: stack.source,
		storage_location: stack.storageLocation,
		is_primary: stack.isPrimary,
	};
}

/** Convert a Postgres row returned by supabase-js to a domain Stack. */
export function rowToStack(row: StackRow): Stack {
	// Reconstruct grading object: both-or-neither for company/grade; cert independent
	const grading =
		row.grading_company !== null && row.grading_grade !== null
			? {
					company: row.grading_company,
					grade: row.grading_grade,
					cert: row.grading_cert,
				}
			: null;

	return {
		id: row.id,
		cardId: row.card_id,
		quantity: row.quantity,
		acquiredAt: isoToMs(row.acquired_at),
		createdAt: isoToMs(row.created_at),
		updatedAt: isoToMs(row.updated_at),
		deletedAt: isoOrNullToMs(row.deleted_at),
		label: row.label,
		pricePaid: row.price_paid,
		currency: row.currency,
		language: row.language,
		variant: row.variant,
		printing: row.printing ?? null,
		notes: row.notes,
		condition: row.condition as Stack["condition"],
		grading,
		source: row.source,
		storageLocation: row.storage_location,
		isPrimary: row.is_primary,
	};
}

// ── Binder mappers ────────────────────────────────────────────────────────────

/** Convert a domain Binder to a Postgres row. */
export function binderToRow(binder: Binder): BinderRow {
	return {
		id: binder.id,
		name: binder.name,
		description: binder.description,
		rules: binder.rules, // jsonb: supabase-js handles serialization
		include_card_ids: binder.includeCardIds,
		exclude_card_ids: binder.excludeCardIds,
		created_at: msToIso(binder.createdAt),
		updated_at: msToIso(binder.updatedAt),
		deleted_at: msOrNullToIso(binder.deletedAt),
	};
}

/** Convert a Postgres row to a domain Binder. */
export function rowToBinder(row: BinderRow): Binder {
	return {
		id: row.id,
		name: row.name,
		description: row.description,
		rules: row.rules,
		includeCardIds: row.include_card_ids,
		excludeCardIds: row.exclude_card_ids,
		createdAt: isoToMs(row.created_at),
		updatedAt: isoToMs(row.updated_at),
		deletedAt: isoOrNullToMs(row.deleted_at),
	};
}

// ── Profile mappers ───────────────────────────────────────────────────────────

/** Convert a domain Profile to a Postgres row. */
export function profileToRow(profile: Profile): ProfileRow {
	return {
		id: profile.id, // pass through as-is; claim owns the "me" → uid remap
		display_name: profile.displayName,
		bio: profile.bio,
		avatar_preset: profile.avatarPreset,
		favorite_set_id: profile.favoriteSetId,
		display_language: profile.displayLanguage,
		display_currency: profile.displayCurrency,
		created_at: msToIso(profile.createdAt),
		updated_at: msToIso(profile.updatedAt),
		deleted_at: msOrNullToIso(profile.deletedAt),
	};
}

/** Convert a Postgres row to a domain Profile. */
export function rowToProfile(row: ProfileRow): Profile {
	return {
		id: row.id,
		displayName: row.display_name,
		bio: row.bio,
		avatarPreset: row.avatar_preset,
		favoriteSetId: row.favorite_set_id,
		// Additive column; rows written before it existed read back as "en".
		displayLanguage:
			typeof row.display_language === "string" ? row.display_language : "en",
		displayCurrency:
			typeof row.display_currency === "string" ? row.display_currency : "USD",
		createdAt: isoToMs(row.created_at),
		updatedAt: isoToMs(row.updated_at),
		deletedAt: isoOrNullToMs(row.deleted_at),
	};
}
