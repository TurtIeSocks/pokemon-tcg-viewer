import { createStore, del, get, setMany } from "idb-keyval";
import type { Region } from "@/lib/languages";

// Dedicated IDB store — kept OUT of the persisted Zustand blob, which
// re-serializes its whole state on every change. The corpus is written once
// per version and read once on startup.
const store = createStore("ptcg-corpus", "blob");

// The store holds one blob per base-corpus region ("west" = the original
// English-language corpus, "asia" = the new Asian-region corpus). "west" is
// the default and MUST keep the bare "gz"/"meta" keys it has always used —
// that's the key the already-deployed client reads, and there is no
// client-side migration for it. Only non-default regions get a suffixed key.
function gzKey(region: Region): string {
	return region === "west" ? "gz" : `gz:${region}`;
}

function metaKey(region: Region): string {
	return region === "west" ? "meta" : `meta:${region}`;
}

export interface CorpusMeta {
	/** ETag returned by /corpus, used for conditional GET. */
	etag: string;
	/** Content version (same value, without quotes). */
	version: string;
	/** ms since epoch of the last successful fetch. */
	fetchedAt: number;
}

export function readGz(
	region: Region = "west",
): Promise<ArrayBuffer | undefined> {
	return get<ArrayBuffer>(gzKey(region), store);
}

export function readMeta(
	region: Region = "west",
): Promise<CorpusMeta | undefined> {
	return get<CorpusMeta>(metaKey(region), store);
}

export async function writeCorpus(
	gz: ArrayBuffer,
	meta: CorpusMeta,
	region: Region = "west",
): Promise<void> {
	// Atomic: one IDB transaction, so a crash can't leave gz without meta
	// (which would force an unnecessary full re-download on the next load).
	await setMany(
		[
			[gzKey(region), gz],
			[metaKey(region), meta],
		],
		store,
	);
}

export async function clearCorpus(region: Region = "west"): Promise<void> {
	await del(gzKey(region), store);
	await del(metaKey(region), store);
}
