// src/store/userland/backup.ts
import type { UserDataSnapshot } from "./types";

/** Type guard: true when v is a non-null object. */
function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null;
}

/**
 * Type guard: validates that v has the minimum shape of a UserDataSnapshot
 * (schemaVersion=1, collection/binders arrays with required id fields).
 */
export function isValidSnapshot(v: unknown): v is UserDataSnapshot {
	if (!isRecord(v)) return false;
	if (v.schemaVersion !== 1) return false;
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

/** Parse and validate a JSON string as a UserDataSnapshot; throws a user-readable error on failure. */
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
	return data;
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
