import { createStore, del, get, set } from "idb-keyval";

// Dedicated IDB store — kept OUT of the persisted Zustand blob, which
// re-serializes its whole state on every change. The corpus is written once
// per version and read once on startup.
const store = createStore("ptcg-corpus", "blob");

export interface CorpusMeta {
	/** ETag returned by /corpus, used for conditional GET. */
	etag: string;
	/** Content version (same value, without quotes). */
	version: string;
	/** ms since epoch of the last successful fetch. */
	fetchedAt: number;
}

export function readGz(): Promise<ArrayBuffer | undefined> {
	return get<ArrayBuffer>("gz", store);
}

export function readMeta(): Promise<CorpusMeta | undefined> {
	return get<CorpusMeta>("meta", store);
}

export async function writeCorpus(
	gz: ArrayBuffer,
	meta: CorpusMeta,
): Promise<void> {
	await set("gz", gz, store);
	await set("meta", meta, store);
}

export async function clearCorpus(): Promise<void> {
	await del("gz", store);
	await del("meta", store);
}
