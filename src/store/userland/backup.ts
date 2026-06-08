// src/store/userland/backup.ts
import { DEFAULT_AVATAR_PRESET_ID } from "../../components/profile/avatar-presets";
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
const SUPPORTED_VERSIONS = new Set([1, 2, 3]);

/**
 * Type guard: validates that v has the minimum shape of a supported snapshot
 * (schemaVersion in {1,2,3}; collection/binders arrays with required id fields).
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
	};
}

/** Upgrade any supported snapshot to the current v3 shape (backfills quantity=1, null provenance, null profile). */
function upgrade(snap: RawSnapshot): UserDataSnapshot {
	const collection = snap.collection.map((c) => {
		// Older/hand-edited backups may omit fields Stack requires non-null. Backfill
		// every one so import can't inject a malformed Stack (isValidSnapshot only
		// guarantees id + cardId are strings).
		const createdAt =
			typeof c.createdAt === "number" ? c.createdAt : Date.now();
		return {
			...c,
			quantity:
				typeof c.quantity === "number" && c.quantity >= 1 ? c.quantity : 1,
			createdAt,
			acquiredAt: typeof c.acquiredAt === "number" ? c.acquiredAt : createdAt,
			pricePaid: typeof c.pricePaid === "number" ? c.pricePaid : null,
			variant: (c.variant as string | null | undefined) ?? null,
			notes: (c.notes as string | null | undefined) ?? null,
			condition: (c.condition as Stack["condition"] | undefined) ?? null,
			grading: (c.grading as Stack["grading"] | undefined) ?? null,
			source: (c.source as string | null | undefined) ?? null,
			storageLocation: (c.storageLocation as string | null | undefined) ?? null,
		};
	}) as unknown as UserDataSnapshot["collection"];
	return {
		schemaVersion: 3,
		exportedAt: typeof snap.exportedAt === "number" ? snap.exportedAt : 0,
		collection,
		binders: snap.binders as unknown as UserDataSnapshot["binders"],
		profile: upgradeProfile(snap.profile),
	};
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
