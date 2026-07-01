import { createStore, del, get, setMany } from "idb-keyval";

// Dedicated IDB store for the per-language name overlays. Kept out of the
// persisted Zustand blob, exactly like the corpus + detail blobs. Keyed per
// language (`gz:{lang}`, `meta:{lang}`) so each overlay is independently
// downloadable, versioned, and evictable.
const store = createStore("ptcg-corpus-i18n", "blob");

export interface I18nMeta {
	/** Content version (sha256 of the canonical names JSON) of the stored blob. */
	version: string;
	/** ms since epoch of the last successful sync. */
	syncedAt: number;
	/** Card count in the stored blob. */
	count: number;
}

const gzKey = (lang: string) => `gz:${lang}`;
const metaKey = (lang: string) => `meta:${lang}`;

export function readI18nGz(lang: string): Promise<ArrayBuffer | undefined> {
	return get<ArrayBuffer>(gzKey(lang), store);
}

export function readI18nMeta(lang: string): Promise<I18nMeta | undefined> {
	return get<I18nMeta>(metaKey(lang), store);
}

export async function writeI18n(
	lang: string,
	gz: ArrayBuffer,
	meta: I18nMeta,
): Promise<void> {
	// Atomic: one transaction so a crash can't leave gz without meta.
	await setMany(
		[
			[gzKey(lang), gz],
			[metaKey(lang), meta],
		],
		store,
	);
}

export async function clearI18n(lang: string): Promise<void> {
	await del(gzKey(lang), store);
	await del(metaKey(lang), store);
}
