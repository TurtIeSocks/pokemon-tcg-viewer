import { create } from "zustand";
import {
	cachedStats,
	clearImageCaches,
	DEFAULT_THUMB_CAP,
	pruneCache,
	readThumbCap,
	sendThumbCap,
	writeThumbCap,
} from "./browse-cache";
import { THUMB_CACHE } from "./cache-policy";

interface ImageCacheState {
	thumbCap: number;
	thumbs: number;
	hires: number;
	bytes: number;
	status: "idle" | "clearing";
}

export const useImageCache = create<ImageCacheState>(() => ({
	thumbCap: DEFAULT_THUMB_CAP,
	thumbs: 0,
	hires: 0,
	bytes: 0,
	status: "idle",
}));

/** Boot: load the persisted cap and tell the SW. */
export async function loadThumbCap(): Promise<void> {
	const cap = await readThumbCap();
	useImageCache.setState({ thumbCap: cap });
	sendThumbCap(cap);
}

export async function setThumbCap(cap: number): Promise<void> {
	await writeThumbCap(cap);
	useImageCache.setState({ thumbCap: cap });
	sendThumbCap(cap);
	await pruneCache(THUMB_CACHE, cap); // immediate trim, do not wait for next fetch
	await refreshStats();
}

export async function refreshStats(): Promise<void> {
	const s = await cachedStats();
	useImageCache.setState({ thumbs: s.thumbs, hires: s.hires, bytes: s.bytes });
}

export async function clearImages(): Promise<void> {
	useImageCache.setState({ status: "clearing" });
	await clearImageCaches();
	useImageCache.setState({ status: "idle", thumbs: 0, hires: 0, bytes: 0 });
}

export async function resetImagesForTests(): Promise<void> {
	await writeThumbCap(DEFAULT_THUMB_CAP);
	useImageCache.setState({
		thumbCap: DEFAULT_THUMB_CAP,
		thumbs: 0,
		hires: 0,
		bytes: 0,
		status: "idle",
	});
}
