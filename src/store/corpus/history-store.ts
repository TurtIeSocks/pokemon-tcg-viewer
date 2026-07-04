import { createStore, del, get, set } from "idb-keyval";

// Dedicated IDB store for the per-set price-history overlays. Kept out of the
// persisted Zustand blob, exactly like the corpus + i18n + prices blobs. Keyed
// per set (`gz:{setId}`) so each set's history is independently downloadable
// and evictable — mirrors i18n-store's per-language keying.
const store = createStore("ptcg-corpus-prices-history", "blob");

const gzKey = (setId: string) => `gz:${setId}`;

export function readHistoryGz(setId: string): Promise<ArrayBuffer | undefined> {
	return get<ArrayBuffer>(gzKey(setId), store);
}

export async function writeHistory(
	setId: string,
	gz: ArrayBuffer,
): Promise<void> {
	await set(gzKey(setId), gz, store);
}

export async function clearHistory(setId: string): Promise<void> {
	await del(gzKey(setId), store);
}
