import { createStore, del, get, set, setMany } from "idb-keyval";

// Dedicated IDB store for the optional offline detail blob. Kept out of the
// persisted Zustand blob, exactly like the corpus.
const store = createStore("ptcg-corpus-detail", "blob");

export interface DetailMeta {
	/** Content version (sha256 of the canonical detail JSON) of the stored blob. */
	version: string;
	/** ms since epoch of the last successful sync. */
	syncedAt: number;
	/** Card count in the stored blob. */
	count: number;
	/** Whether offline detail is currently turned on. */
	enabled: boolean;
}

export function readDetailGz(): Promise<ArrayBuffer | undefined> {
	return get<ArrayBuffer>("gz", store);
}

export function readDetailMeta(): Promise<DetailMeta | undefined> {
	return get<DetailMeta>("meta", store);
}

export async function writeDetail(
	gz: ArrayBuffer,
	meta: DetailMeta,
): Promise<void> {
	// Atomic: one transaction so a crash can't leave gz without meta.
	await setMany(
		[
			["gz", gz],
			["meta", meta],
		],
		store,
	);
}

/** Flip the enabled flag without touching the blob (e.g. disable but keep bytes). */
export async function setDetailEnabled(enabled: boolean): Promise<void> {
	const meta = await readDetailMeta();
	if (meta) await set("meta", { ...meta, enabled }, store);
}

export async function clearDetail(): Promise<void> {
	await del("gz", store);
	await del("meta", store);
}
