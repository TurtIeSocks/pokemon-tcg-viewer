import { createStore, del, get, setMany } from "idb-keyval";

// Dedicated IDB store for the daily price blob. Kept out of the persisted
// Zustand blob, exactly like the corpus + i18n blobs. A single global blob
// (not per-language), so fixed keys — no per-lang keying like i18n-store.
const store = createStore("ptcg-corpus-prices", "blob");

export interface PricesStoreMeta {
	/** Build date (YYYY-MM-DD UTC) of the stored blob; the staleness key. */
	date: string;
	/** ms since epoch of the last successful sync. */
	syncedAt: number;
	/** Priced-card count in the stored blob. */
	count: number;
}

const GZ_KEY = "gz";
const META_KEY = "meta";

export function readPricesGz(): Promise<ArrayBuffer | undefined> {
	return get<ArrayBuffer>(GZ_KEY, store);
}

export function readPricesMeta(): Promise<PricesStoreMeta | undefined> {
	return get<PricesStoreMeta>(META_KEY, store);
}

export async function writePrices(
	gz: ArrayBuffer,
	meta: PricesStoreMeta,
): Promise<void> {
	// Atomic: one transaction so a crash can't leave gz without meta.
	await setMany(
		[
			[GZ_KEY, gz],
			[META_KEY, meta],
		],
		store,
	);
}

export async function clearPrices(): Promise<void> {
	await del(GZ_KEY, store);
	await del(META_KEY, store);
}
