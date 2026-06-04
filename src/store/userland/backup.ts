// src/store/userland/backup.ts
import type { UserDataSnapshot } from "./types";

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
}

/** Schema versions this build can read (and upgrade from). */
const SUPPORTED_VERSIONS = new Set([1, 2]);

/**
 * Type guard: validates that v has the minimum shape of a supported snapshot
 * (schemaVersion in {1,2}; collection/binders arrays with required id fields).
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

/** Upgrade any supported snapshot to the current v2 shape (backfills quantity=1, null provenance). */
function upgrade(snap: RawSnapshot): UserDataSnapshot {
	const collection = snap.collection.map((c) => ({
		...c,
		quantity:
			typeof c.quantity === "number" && c.quantity >= 1 ? c.quantity : 1,
		source: (c.source as string | null | undefined) ?? null,
		storageLocation: (c.storageLocation as string | null | undefined) ?? null,
	})) as unknown as UserDataSnapshot["collection"];
	return {
		schemaVersion: 2,
		exportedAt: typeof snap.exportedAt === "number" ? snap.exportedAt : 0,
		collection,
		binders: snap.binders as unknown as UserDataSnapshot["binders"],
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
