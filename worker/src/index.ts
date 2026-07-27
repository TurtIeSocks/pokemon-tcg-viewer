export interface Env {
	/** Allowed browser origin for CORS; defaults to "*". */
	ALLOW_ORIGIN?: string;
	CORPUS: R2Bucket;
}

const ORIGIN = "https://api.tcgdex.net";

// Overlay-name blobs shipped for these languages (Phase 1b Western + Phase 2
// Asian). `ja` is deliberately excluded: it's the Asian base corpus language
// (see SUPPORTED_REGIONS/REGION_BASE_LANGUAGE below), so it ships no overlay.
// keep in sync with src/lib/languages.ts (worker cannot import app code)
const OVERLAY_LANGS = [
	"fr",
	"de",
	"es",
	"it",
	"pt",
	"ko",
	"zh-tw",
	"zh-cn",
	"th",
	"id",
] as const;
type OverlayLang = (typeof OVERLAY_LANGS)[number];

function isOverlayLang(lang: string): lang is OverlayLang {
	return (OVERLAY_LANGS as readonly string[]).includes(lang);
}

// Region-scoped base corpora (Phase 2). keep in sync with src/lib/languages.ts
// (worker cannot import app code)
const SUPPORTED_REGIONS = ["asia"] as const;
type SupportedRegion = (typeof SUPPORTED_REGIONS)[number];

function isSupportedRegion(region: string): region is SupportedRegion {
	return (SUPPORTED_REGIONS as readonly string[]).includes(region);
}

function corsHeaders(env: Env): Record<string, string> {
	return {
		"Access-Control-Allow-Origin": env.ALLOW_ORIGIN ?? "*",
		"Access-Control-Allow-Methods": "GET,OPTIONS",
		// If-None-Match is a non-simple request header, so the client's conditional
		// GET triggers a CORS preflight — the worker must allow it or the browser
		// rejects the request (and loadCorpus falls back to stale stored bytes).
		"Access-Control-Allow-Headers": "Content-Type, If-None-Match",
		// Without this the browser default (~5s in Chrome/Firefox) makes nearly
		// every conditional corpus GET pay a fresh OPTIONS first — two worker
		// invocations per fetch. A day is safe: these CORS terms are static.
		"Access-Control-Max-Age": "86400",
		// Expose ETag to cross-origin fetch(): the app reads it to store the build
		// hash and send If-None-Match on the next load. Without this, the browser
		// hides ETag (res.headers.get("ETag") === null), the client stores "", never
		// revalidates, and serveCorpus's 304 branch is dead — every load re-downloads
		// the full corpus. See src/store/corpus/corpus-runtime.ts loadCorpus.
		"Access-Control-Expose-Headers": "ETag",
	};
}

// Apply CORS and honor conditional GET (If-None-Match) for the corpus blob.
function serveCorpus(res: Response, request: Request, env: Env): Response {
	const inm = request.headers.get("If-None-Match");
	const etag = res.headers.get("ETag");
	if (inm && etag && inm === etag) {
		return new Response(null, {
			status: 304,
			headers: { ...corsHeaders(env), ETag: etag },
		});
	}
	return withCors(res, env);
}

function withCors(res: Response, env: Env): Response {
	const out = new Response(res.body, res);
	for (const [k, v] of Object.entries(corsHeaders(env))) {
		out.headers.set(k, v);
	}
	return out;
}

function fetchOrigin(url: URL): Promise<Response> {
	return fetch(ORIGIN + url.pathname + url.search);
}

// Add a shared-cache TTL to the stored copy. `stale-while-revalidate` is
// deliberately absent: the Cache API ignores it (only `fetch` honors it), so
// promising SWR here would just be a lie in a header.
function cacheable(res: Response): Response {
	const out = new Response(res.clone().body, res);
	out.headers.set("Cache-Control", "s-maxage=3600");
	return out;
}

function edgeCache(): Cache {
	// `caches.default` is a Workers-specific extension absent from the
	// standard CacheStorage type.
	return (caches as unknown as { default: Cache }).default;
}

function missing(message: string, env: Env): Response {
	return new Response(message, { status: 503, headers: corsHeaders(env) });
}

/**
 * Serve a gzipped R2 blob: edge-cached, ETag'd, conditional-GET aware.
 *
 * The edge cache is what makes this cheap — a hit skips the R2 GET entirely
 * (an R2 Class B operation, billed per request). It cannot skip the worker
 * invocation itself: on workers.dev the worker runs before any cache, and the
 * response's own `s-maxage` is inert because no zone CDN sits in front of it.
 */
async function serveBlob(
	request: Request,
	env: Env,
	ctx: ExecutionContext,
	key: string,
	notBuilt: string,
): Promise<Response> {
	const cache = edgeCache();
	// Key on the path alone. None of these routes read a query param, so without
	// this a `?x=1` cache-buster would miss on every request and bill an R2 GET
	// each time — the exact cost this cache exists to avoid.
	const url = new URL(request.url);
	const cacheKey = new Request(url.origin + url.pathname, { method: "GET" });
	const cached = await cache.match(cacheKey);
	if (cached) return serveCorpus(cached, request, env);

	const obj = await env.CORPUS.get(key);
	if (!obj) return missing(notBuilt, env);

	const res = new Response(obj.body, {
		headers: {
			"Content-Type": "application/octet-stream",
			ETag: `"${obj.etag}"`,
			// Sent to the browser (which honors SWR) as well as stored in the edge
			// cache (which honors only s-maxage — see `cacheable`). Hourly edge
			// revalidation means a weekly rebuild lands within ~1h, and clients
			// still get cheap 304s via the ETag.
			"Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
		},
	});
	ctx.waitUntil(cache.put(cacheKey, res.clone()));
	return serveCorpus(res, request, env);
}

/**
 * Serve a small JSON meta doc (a version probe). Deliberately NOT edge-cached:
 * its whole job is to answer "is there a newer build?", and a stale answer
 * defeats it. The R2 objects here are a few hundred bytes.
 */
async function serveMeta(
	env: Env,
	key: string,
	notBuilt: string,
): Promise<Response> {
	const obj = await env.CORPUS.get(key);
	if (!obj) return missing(notBuilt, env);
	return new Response(obj.body, {
		headers: {
			...corsHeaders(env),
			"Content-Type": "application/json",
			"Cache-Control":
				"public, max-age=60, s-maxage=300, stale-while-revalidate=86400",
		},
	});
}

export default {
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext,
	): Promise<Response> {
		if (request.method === "OPTIONS") {
			return new Response(null, { status: 204, headers: corsHeaders(env) });
		}
		if (request.method !== "GET") {
			return new Response("Method Not Allowed", {
				status: 405,
				headers: corsHeaders(env),
			});
		}

		const url = new URL(request.url);

		if (url.pathname === "/corpus") {
			return serveBlob(
				request,
				env,
				ctx,
				"corpus/latest.json.gz",
				"Corpus not built yet",
			);
		}

		if (url.pathname === "/corpus-detail/version") {
			return serveMeta(env, "corpus/detail-meta.json", "Detail not built yet");
		}

		if (url.pathname === "/corpus-detail") {
			return serveBlob(
				request,
				env,
				ctx,
				"corpus/detail-latest.json.gz",
				"Detail not built yet",
			);
		}

		// Daily market-price blob (spec 2026-07-03-pricing-implementation-design §3).
		if (url.pathname === "/corpus-prices/version") {
			return serveMeta(env, "corpus/prices/meta.json", "Prices not built yet");
		}

		if (url.pathname === "/corpus-prices") {
			return serveBlob(
				request,
				env,
				ctx,
				"corpus/prices/latest.json.gz",
				"Prices not built yet",
			);
		}

		// GET /corpus-prices/history/:setId -> per-set price history blob.
		const historyMatch = url.pathname.match(
			/^\/corpus-prices\/history\/([^/]+)$/,
		);
		if (historyMatch) {
			return serveBlob(
				request,
				env,
				ctx,
				`corpus/prices/history/${historyMatch[1]}.json.gz`,
				"No history for set",
			);
		}

		// GET /corpus-i18n/:lang/version -> overlay meta JSON (like /corpus-detail/version).
		const i18nVersionMatch = url.pathname.match(
			/^\/corpus-i18n\/([^/]+)\/version$/,
		);
		if (i18nVersionMatch) {
			const lang = i18nVersionMatch[1];
			if (!isOverlayLang(lang)) {
				return new Response("Not Found", {
					status: 404,
					headers: corsHeaders(env),
				});
			}
			return serveMeta(
				env,
				`corpus/i18n/${lang}/meta.json`,
				"Overlay not built yet",
			);
		}

		// GET /corpus-i18n/:lang -> overlay names blob (like /corpus-detail).
		const i18nMatch = url.pathname.match(/^\/corpus-i18n\/([^/]+)$/);
		if (i18nMatch) {
			const lang = i18nMatch[1];
			if (!isOverlayLang(lang)) {
				return new Response("Not Found", {
					status: 404,
					headers: corsHeaders(env),
				});
			}
			return serveBlob(
				request,
				env,
				ctx,
				`corpus/i18n/${lang}/names.json.gz`,
				"Overlay not built yet",
			);
		}

		// GET /corpus-region/:region(/version|/detail)? -> Phase 2 Asian-region
		// base corpus, mirroring /corpus + /corpus-detail exactly.
		const regionMatch = url.pathname.match(
			/^\/corpus-region\/([a-z-]+)(\/version|\/detail)?$/,
		);
		if (regionMatch) {
			const [, region, suffix] = regionMatch;
			if (!isSupportedRegion(region)) {
				return new Response("Not Found", {
					status: 404,
					headers: corsHeaders(env),
				});
			}

			if (suffix === "/version") {
				return serveMeta(
					env,
					`corpus/region/${region}/meta.json`,
					"Region corpus not built yet",
				);
			}

			return suffix === "/detail"
				? serveBlob(
						request,
						env,
						ctx,
						`corpus/region/${region}/detail-latest.json.gz`,
						"Region detail not built yet",
					)
				: serveBlob(
						request,
						env,
						ctx,
						`corpus/region/${region}/latest.json.gz`,
						"Region corpus not built yet",
					);
		}

		if (!url.pathname.startsWith("/v2/")) {
			return new Response("Not Found", {
				status: 404,
				headers: corsHeaders(env),
			});
		}

		// Stable cache key: sort query params so equivalent requests collide.
		url.searchParams.sort();
		const cache = edgeCache();
		const cacheKey = new Request(url.toString(), { method: "GET" });

		// A hit is served as-is. It used to also schedule an unconditional
		// background refetch, which meant every hit still cost one origin
		// subrequest — the cache saved latency but no upstream load at all. The
		// Cache API honors `s-maxage` on its own: once the hour is up, `match`
		// misses and the next request refills below.
		const cached = await cache.match(cacheKey);
		if (cached) return withCors(cached, env);

		const fresh = await fetchOrigin(url);
		if (fresh.ok) ctx.waitUntil(cache.put(cacheKey, cacheable(fresh)));
		return withCors(fresh, env);
	},
};
