export type CacheKind = "static" | "ssr" | "private" | "immutable";

/**
 * Cache-Control values for the 2-tier (Cloudflare edge + nginx) SWR cache.
 * Mirrors the matrix in refactor-workspace/goals.md. Apply via
 * setResponseHeaders in a route's server handler/loader.
 */
export function cacheControl(kind: CacheKind): string {
	switch (kind) {
		case "static":
			return "public, max-age=300, s-maxage=2592000, stale-while-revalidate=86400";
		case "ssr":
			return "public, s-maxage=3600, stale-while-revalidate=604800";
		case "private":
			return "private, no-store";
		case "immutable":
			return "public, max-age=31536000, immutable";
	}
}
