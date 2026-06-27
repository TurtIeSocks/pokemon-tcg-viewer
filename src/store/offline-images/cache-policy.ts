export const THUMB_W = "300";
export const HIRES_W = "734";
export const THUMB_CACHE = "ptcg-thumbs";
export const HIRES_CACHE = "ptcg-hires";
export const HIRES_CAP = 100;

/**
 * Which browse cache an image request belongs to, or null if it is not a
 * cacheable wsrv.nl image. THIS IS THE SAME LOGIC public/sw.js applies inline;
 * keep them in sync. NEVER widen past wsrv.nl (app assets must not be cached).
 */
export function imageCacheKindFor(
	url: URL,
): { name: typeof THUMB_CACHE | typeof HIRES_CACHE } | null {
	if (url.hostname !== "wsrv.nl") return null;
	const w = url.searchParams.get("w");
	if (w === THUMB_W) return { name: THUMB_CACHE };
	if (w === HIRES_W) return { name: HIRES_CACHE };
	return null;
}

/** The oldest keys to delete so the cache holds at most `cap` (FIFO). */
export function evictionPlan<T>(keys: readonly T[], cap: number): T[] {
	const over = keys.length - Math.max(0, cap);
	return over > 0 ? keys.slice(0, over) : [];
}
