// src/store/userland/backup.ts
import { DEFAULT_AVATAR_PRESET_ID } from "../../components/profile/avatar-presets";
import { type CardLookup, remapPtcgCardId, remapPtcgSetId } from "./id-remap";
import type { Stack, UserDataSnapshot } from "./types";

/** Type guard: true when v is a non-null object. */
function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null;
}

/** Snapshot shape accepted on import, before upgrade to the current version. */
interface RawSnapshot {
	schemaVersion: number;
	exportedAt?: unknown;
	collection: Record<string, unknown>[];
	binders: Record<string, unknown>[];
	profile?: unknown;
}

/** Schema versions this build can read (and upgrade from). */
export const SUPPORTED_VERSIONS = new Set([1, 2, 3, 4, 5, 6]);

/**
 * Type guard: validates that v has the minimum shape of a supported snapshot
 * (schemaVersion in {1,2,3,4}; collection/binders arrays with required id fields).
 */
export function isValidSnapshot(v: unknown): v is RawSnapshot {
	if (!isRecord(v)) return false;
	if (
		typeof v.schemaVersion !== "number" ||
		!SUPPORTED_VERSIONS.has(v.schemaVersion)
	)
		return false;
	if (!Array.isArray(v.collection) || !Array.isArray(v.binders)) return false;
	const itemsOk = v.collection.every(
		(i) =>
			isRecord(i) && typeof i.id === "string" && typeof i.cardId === "string",
	);
	const bindersOk = v.binders.every(
		(b) =>
			isRecord(b) && typeof b.id === "string" && typeof b.name === "string",
	);
	return itemsOk && bindersOk;
}

/** Backfill a possibly-partial profile from a backup; null when absent/invalid. Every field null-disciplined. */
function upgradeProfile(raw: unknown): UserDataSnapshot["profile"] {
	if (!isRecord(raw) || typeof raw.id !== "string") return null;
	return {
		id: raw.id,
		displayName:
			typeof raw.displayName === "string" ? raw.displayName : "Collector",
		bio: typeof raw.bio === "string" ? raw.bio : null,
		avatarPreset:
			typeof raw.avatarPreset === "string"
				? raw.avatarPreset
				: DEFAULT_AVATAR_PRESET_ID,
		favoriteSetId:
			typeof raw.favoriteSetId === "string" ? raw.favoriteSetId : null,
		createdAt: typeof raw.createdAt === "number" ? raw.createdAt : 0,
		updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : 0,
		deletedAt: typeof raw.deletedAt === "number" ? raw.deletedAt : null,
	};
}

/** Upgrade any supported snapshot to the current v6 shape (corpus-id remap; backfills all prior fields). */
export function upgrade(
	snap: RawSnapshot,
	lookup?: CardLookup,
): UserDataSnapshot {
	// Pre-v4 snapshots stored pricePaid in whole units (dollars); v4+ stores minor
	// units (cents). Only rescale when importing from an older version — a v4+
	// backup's prices are already cents and must pass through untouched.
	const rescaleToCents = snap.schemaVersion < 4;
	const collection = snap.collection.map((c) => {
		// Older/hand-edited backups may omit fields Stack requires non-null. Backfill
		// every one so import can't inject a malformed Stack (isValidSnapshot only
		// guarantees id + cardId are strings).
		const createdAt =
			typeof c.createdAt === "number" ? c.createdAt : Date.now();
		const rawPrice = typeof c.pricePaid === "number" ? c.pricePaid : null;
		const rawGrading = c.grading as
			| { company: string; grade: number; cert?: string | null }
			| null
			| undefined;
		return {
			...c,
			quantity:
				typeof c.quantity === "number" && c.quantity >= 1 ? c.quantity : 1,
			createdAt,
			updatedAt: typeof c.updatedAt === "number" ? c.updatedAt : createdAt,
			acquiredAt: typeof c.acquiredAt === "number" ? c.acquiredAt : createdAt,
			deletedAt: typeof c.deletedAt === "number" ? c.deletedAt : null,
			label: (c.label as string | null | undefined) ?? null,
			pricePaid:
				rawPrice == null
					? null
					: rescaleToCents
						? Math.round(rawPrice * 100)
						: rawPrice,
			currency: typeof c.currency === "string" ? c.currency : "USD",
			language: typeof c.language === "string" ? c.language : "en",
			variant: (c.variant as string | null | undefined) ?? null,
			notes: (c.notes as string | null | undefined) ?? null,
			condition: (c.condition as Stack["condition"] | undefined) ?? null,
			grading: rawGrading
				? {
						company: rawGrading.company,
						grade: rawGrading.grade,
						cert: rawGrading.cert ?? null,
					}
				: null,
			source: (c.source as string | null | undefined) ?? null,
			storageLocation: (c.storageLocation as string | null | undefined) ?? null,
			isPrimary: typeof c.isPrimary === "boolean" ? c.isPrimary : false,
		};
	}) as unknown as UserDataSnapshot["collection"];
	const binders = snap.binders.map((b) => ({
		...b,
		deletedAt: typeof b.deletedAt === "number" ? b.deletedAt : null,
	})) as unknown as UserDataSnapshot["binders"];
	const result: UserDataSnapshot = {
		schemaVersion: 6,
		exportedAt: typeof snap.exportedAt === "number" ? snap.exportedAt : 0,
		collection,
		binders,
		profile: upgradeProfile(snap.profile),
	};
	// v5 → v6: remap ptcg corpus ids to tcgdex ids (only when a lookup is provided;
	// callers without a corpus pass undefined and ids are left as-is).
	if (snap.schemaVersion === 5 && lookup) {
		for (const s of result.collection)
			s.cardId = remapPtcgCardId(s.cardId, lookup);
		for (const b of result.binders) {
			b.includeCardIds = b.includeCardIds.map((id) =>
				remapPtcgCardId(id, lookup),
			);
			b.excludeCardIds = b.excludeCardIds.map((id) =>
				remapPtcgCardId(id, lookup),
			);
			for (const r of b.rules)
				if (r.query.setId) r.query.setId = remapPtcgSetId(r.query.setId);
		}
		if (result.profile?.favoriteSetId)
			result.profile.favoriteSetId = remapPtcgSetId(
				result.profile.favoriteSetId,
			);
	}
	return result;
}

/** Parse, validate, and upgrade a JSON string to the current snapshot; throws a user-readable error on failure. */
export function parseSnapshot(json: string): UserDataSnapshot {
	let data: unknown;
	try {
		data = JSON.parse(json);
	} catch {
		throw new Error("That file isn't valid JSON.");
	}
	if (!isValidSnapshot(data)) {
		throw new Error("Unrecognized or unsupported backup format.");
	}
	return upgrade(data);
}

/** Build the suggested download filename using the current date (ISO YYYY-MM-DD suffix). */
export function snapshotFilename(now: Date): string {
	return `pokemon-tcg-collection-${now.toISOString().slice(0, 10)}.json`;
}

/** Triggers a browser download of the snapshot. DOM-only; not unit-tested. */
export function downloadSnapshot(snapshot: UserDataSnapshot): void {
	const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
		type: "application/json",
	});
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = snapshotFilename(new Date());
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(url);
}
