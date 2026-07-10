export type ShellStrategy =
	| "network-first"
	| "cache-first"
	| "stale-while-revalidate"
	| "passthrough";

export interface ShellRequestInfo {
	method: string;
	sameOrigin: boolean;
	mode: string;
	destination: string;
	pathname: string;
}

// Paths that must always hit the network (dynamic server responses); never cached.
const NEVER_CACHE = ["/_serverFn", "/api/", "/corpus"];

/**
 * Pure routing decision mirrored inside `public/sw.js` (which cannot import from
 * src). This is the source of truth for the app-shell caching policy; keep the
 * `sw.js` fetch handler in sync with it.
 *
 * - Navigations are network-first so an online user always gets fresh SSR HTML;
 *   offline, the SW falls back to a cached document, then `/offline.html`.
 * - Script/style/font are cache-first: Vite content-hashes their filenames, so a
 *   name is immutable and cache-first can never serve a stale-wrong build (the
 *   "stale-chunk hydration crash" class the existing SW comment warns about).
 * - Same-origin images are stale-while-revalidate.
 * - RPCs, /api, /corpus, and cross-origin (non-wsrv) requests pass through.
 */
export function shellStrategy(r: ShellRequestInfo): ShellStrategy {
	if (r.method !== "GET") return "passthrough";
	if (r.mode === "navigate" || r.destination === "document")
		return "network-first";
	if (!r.sameOrigin) return "passthrough";
	if (NEVER_CACHE.some((p) => r.pathname.startsWith(p))) return "passthrough";
	if (
		r.destination === "script" ||
		r.destination === "style" ||
		r.destination === "font"
	)
		return "cache-first";
	if (r.destination === "image") return "stale-while-revalidate";
	return "passthrough";
}
