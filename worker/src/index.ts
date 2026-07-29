export interface Env {
	/** Comma-separated browser origin allowlist. "*" allows any. */
	ALLOW_ORIGIN?: string;
	/**
	 * Shared secret required on /v2/* proxy calls, set with
	 * `wrangler secret put PROXY_TOKEN`. Unset closes the route.
	 */
	PROXY_TOKEN?: string;
	/**
	 * Optional extra pin on /v2/*: comma-separated client IPs, ANDed with the
	 * token. Empty means any IP holding a valid token. Only worth setting on a
	 * static address — a residential IP rotates on lease renewal and takes SSR
	 * card fetches down with it.
	 */
	ALLOW_PROXY_IPS?: string;
	CORPUS: R2Bucket;
}

const ORIGIN = "https://api.tcgdex.net";

const PROXY_TOKEN_HEADER = "x-proxy-token";

function csv(value: string | undefined): string[] {
	return (value ?? "")
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
}

/** Any localhost port, so `bun run dev` still works against the prod allowlist. */
function isLocalOrigin(origin: string): boolean {
	try {
		const { hostname } = new URL(origin);
		return hostname === "localhost" || hostname === "127.0.0.1";
	} catch {
		return false;
	}
}

function originAllowed(origin: string, env: Env): boolean {
	const allowed = csv(env.ALLOW_ORIGIN);
	return (
		allowed.includes("*") || allowed.includes(origin) || isLocalOrigin(origin)
	);
}

/**
 * Constant-time string compare. Workers ships `crypto.subtle.timingSafeEqual`,
 * but its behavior on mismatched lengths is unspecified and the test runtime
 * has no such extension — five lines of XOR need neither caveat. The length
 * check leaks only the length, which is the standard trade.
 */
function secretMatches(got: string | null, want: string): boolean {
	if (!got || got.length !== want.length) return false;
	let diff = 0;
	for (let i = 0; i < want.length; i++) {
		diff |= got.charCodeAt(i) ^ want.charCodeAt(i);
	}
	return diff === 0;
}

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

function corsHeaders(request: Request, env: Env): Record<string, string> {
	const origin = request.headers.get("Origin");
	const allowed = csv(env.ALLOW_ORIGIN);
	// An allowlist can only ever echo ONE origin back, so the response now
	// varies by request. Any shared cache must key on Origin or it will hand
	// one site's grant to the next caller. (The edge entries this worker stores
	// carry no CORS headers at all — see serveBlob — but browsers and any
	// future zone CDN still need to be told.)
	const acao = allowed.includes("*")
		? "*"
		: origin && originAllowed(origin, env)
			? origin
			: null;
	return {
		...(acao ? { "Access-Control-Allow-Origin": acao } : {}),
		Vary: "Origin",
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
			headers: { ...corsHeaders(request, env), ETag: etag },
		});
	}
	return withCors(res, request, env);
}

function withCors(res: Response, request: Request, env: Env): Response {
	const out = new Response(res.body, res);
	for (const [k, v] of Object.entries(corsHeaders(request, env))) {
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

function missing(message: string, request: Request, env: Env): Response {
	return new Response(message, {
		status: 503,
		headers: corsHeaders(request, env),
	});
}

function forbidden(request: Request, env: Env): Response {
	return new Response("Forbidden", {
		status: 403,
		headers: corsHeaders(request, env),
	});
}

/**
 * Gate the TCGdex passthrough on a shared secret.
 *
 * No browser calls /v2/* — only the SSR server does (see
 * src/server/card-data-fetch.ts), so the secret lives in /etc/tcg/env and never
 * reaches a client bundle. That makes this a real lock, unlike the origin
 * allowlist below, which a browser enforces and curl ignores.
 *
 * An unset PROXY_TOKEN closes the route instead of opening it. A proxy that
 * quietly serves the whole internet when misconfigured is the exact failure
 * this exists to prevent, and a loud 503 is a far cheaper way to find out.
 */
function proxyDenied(request: Request, env: Env): Response | null {
	if (!env.PROXY_TOKEN) {
		return missing("Proxy not configured", request, env);
	}
	if (
		!secretMatches(request.headers.get(PROXY_TOKEN_HEADER), env.PROXY_TOKEN)
	) {
		return forbidden(request, env);
	}
	const pinned = csv(env.ALLOW_PROXY_IPS);
	// Cloudflare overwrites CF-Connecting-IP at the edge, so a client cannot
	// forge it. Empty list = no pin; see the ALLOW_PROXY_IPS note on Env.
	if (
		pinned.length &&
		!pinned.includes(request.headers.get("CF-Connecting-IP") ?? "")
	) {
		return forbidden(request, env);
	}
	return null;
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
	if (!obj) return missing(notBuilt, request, env);

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

/** How long a version probe may be answered from the edge cache. */
const META_TTL_S = 60;

/**
 * Serve a small JSON meta doc (a version probe).
 *
 * These are the most-polled endpoints in the whole worker and every caller
 * sends `cache: "no-store"` (see detail-runtime / prices-runtime /
 * i18n-runtime), so the browser cache never absorbs any of it — without an
 * edge cache each poll is an unconditional R2 GET. A 60s window is the whole
 * budget: a probe exists to answer "is there a newer build?", and corpus
 * rebuilds are weekly, so a minute of staleness costs nothing and collapses a
 * polling client down to one R2 GET per minute.
 */
async function serveMeta(
	request: Request,
	env: Env,
	ctx: ExecutionContext,
	key: string,
	notBuilt: string,
): Promise<Response> {
	const cache = edgeCache();
	const url = new URL(request.url);
	const cacheKey = new Request(url.origin + url.pathname, { method: "GET" });
	const cached = await cache.match(cacheKey);
	if (cached) return withCors(cached, request, env);

	const obj = await env.CORPUS.get(key);
	if (!obj) return missing(notBuilt, request, env);

	const res = new Response(obj.body, {
		headers: {
			"Content-Type": "application/json",
			// `s-maxage` is what the Cache API reads; `max-age` is for any client
			// that does not opt out of its own cache the way our runtimes do.
			"Cache-Control": `public, max-age=${META_TTL_S}, s-maxage=${META_TTL_S}`,
		},
	});
	ctx.waitUntil(cache.put(cacheKey, res.clone()));
	return withCors(res, request, env);
}

export default {
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext,
	): Promise<Response> {
		// Origin gate. A 403 rather than a bare missing CORS header: omitting the
		// header still ships the full corpus blob and merely has the browser throw
		// it away, which costs exactly as much bandwidth as serving it.
		//
		// Scope, plainly: this stops another *site* embedding the corpus. It does
		// not stop a scraper — anything that is not a browser either sends no
		// Origin (and is allowed through, as the SSR server must be) or forges
		// one. Only a rate limit stops that, and workers.dev has none.
		const reqOrigin = request.headers.get("Origin");
		if (reqOrigin && !originAllowed(reqOrigin, env)) {
			return forbidden(request, env);
		}

		if (request.method === "OPTIONS") {
			return new Response(null, {
				status: 204,
				headers: corsHeaders(request, env),
			});
		}
		if (request.method !== "GET") {
			return new Response("Method Not Allowed", {
				status: 405,
				headers: corsHeaders(request, env),
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
			return serveMeta(
				request,
				env,
				ctx,
				"corpus/detail-meta.json",
				"Detail not built yet",
			);
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
			return serveMeta(
				request,
				env,
				ctx,
				"corpus/prices/meta.json",
				"Prices not built yet",
			);
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
					headers: corsHeaders(request, env),
				});
			}
			return serveMeta(
				request,
				env,
				ctx,
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
					headers: corsHeaders(request, env),
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
					headers: corsHeaders(request, env),
				});
			}

			if (suffix === "/version") {
				return serveMeta(
					request,
					env,
					ctx,
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
				headers: corsHeaders(request, env),
			});
		}

		const denied = proxyDenied(request, env);
		if (denied) return denied;

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
		if (cached) return withCors(cached, request, env);

		const fresh = await fetchOrigin(url);
		if (fresh.ok) ctx.waitUntil(cache.put(cacheKey, cacheable(fresh)));
		return withCors(fresh, request, env);
	},
};
