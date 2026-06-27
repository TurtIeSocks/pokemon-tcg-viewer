import { get, set } from "idb-keyval";
import {
	evictionPlan,
	HIRES_CACHE,
	HIRES_CAP,
	THUMB_CACHE,
} from "./cache-policy";

export const DEFAULT_THUMB_CAP = 2000;
const THUMB_CAP_KEY = "ptcg-thumb-cap";

// Injectable Cache Storage so tests never touch the real (absent) `caches`.
let cacheStorage: CacheStorage =
	typeof caches !== "undefined"
		? caches
		: (undefined as unknown as CacheStorage);
export function setBrowseCacheDepsForTests(deps: {
	caches: CacheStorage;
}): void {
	cacheStorage = deps.caches;
}

export async function readThumbCap(): Promise<number> {
	return (await get<number>(THUMB_CAP_KEY)) ?? DEFAULT_THUMB_CAP;
}
export async function writeThumbCap(cap: number): Promise<void> {
	await set(THUMB_CAP_KEY, cap);
}

/** Register the browse-cache SW (idempotent). No-op without SW support. */
export async function registerBrowseCacheSW(): Promise<void> {
	if (typeof navigator === "undefined" || !("serviceWorker" in navigator))
		return;
	try {
		await navigator.serviceWorker.register("/sw.js");
	} catch {
		// registration failure is non-fatal; the app works without the cache.
	}
}

/** Tell the active SW the current thumbnail cap. */
export function sendThumbCap(cap: number): void {
	if (typeof navigator === "undefined" || !navigator.serviceWorker?.controller)
		return;
	navigator.serviceWorker.controller.postMessage({ type: "setThumbCap", cap });
}

async function countAndBytes(
	name: string,
): Promise<{ count: number; bytes: number }> {
	const cache = await cacheStorage.open(name);
	const keys = await cache.keys();
	let bytes = 0;
	for (const req of keys) {
		const res = await cache.match(req);
		const len = res?.headers.get("content-length");
		if (len) bytes += Number(len);
	}
	return { count: keys.length, bytes };
}

export async function cachedStats(): Promise<{
	thumbs: number;
	hires: number;
	bytes: number;
}> {
	const [t, h] = await Promise.all([
		countAndBytes(THUMB_CACHE),
		countAndBytes(HIRES_CACHE),
	]);
	return { thumbs: t.count, hires: h.count, bytes: t.bytes + h.bytes };
}

/** Trim a cache to at most `cap` entries, oldest first. */
export async function pruneCache(name: string, cap: number): Promise<void> {
	const cache = await cacheStorage.open(name);
	const keys = await cache.keys();
	for (const req of evictionPlan(keys, cap)) await cache.delete(req);
}

export async function clearImageCaches(): Promise<void> {
	await Promise.all([
		cacheStorage.delete(THUMB_CACHE),
		cacheStorage.delete(HIRES_CACHE),
	]);
}

export { HIRES_CAP };
