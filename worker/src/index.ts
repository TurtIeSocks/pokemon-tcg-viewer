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
		"Access-Control-Allow-Headers": "Content-Type",
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

function fetchOrigin(url: URL, env: Env): Promise<Response> {
	return fetch(ORIGIN + url.pathname + url.search);
}

// Add shared-cache SWR directives to the stored copy. The edge serves the
// cached body immediately and refreshes it in the background.
function cacheable(res: Response): Response {
	const out = new Response(res.clone().body, res);
	out.headers.set(
		"Cache-Control",
		"s-maxage=3600, stale-while-revalidate=86400",
	);
	return out;
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
			const cache = (caches as unknown as { default: Cache }).default;
			const cacheKey = new Request(url.toString(), { method: "GET" });
			const cached = await cache.match(cacheKey);
			if (cached) return serveCorpus(cached, request, env);

			const obj = await env.CORPUS.get("corpus/latest.json.gz");
			if (!obj) {
				return new Response("Corpus not built yet", {
					status: 503,
					headers: corsHeaders(env),
				});
			}
			const res = new Response(obj.body, {
				headers: {
					"Content-Type": "application/octet-stream",
					ETag: `"${obj.etag}"`,
					// Edge revalidates hourly so a weekly rebuild is visible within ~1h
					// (vs up to a week). Clients still get cheap 304s via the ETag.
					"Cache-Control":
						"public, s-maxage=3600, stale-while-revalidate=86400",
				},
			});
			ctx.waitUntil(cache.put(cacheKey, res.clone()));
			return serveCorpus(res, request, env);
		}

		if (url.pathname === "/corpus-detail/version") {
			const obj = await env.CORPUS.get("corpus/detail-meta.json");
			if (!obj) {
				return new Response("Detail not built yet", {
					status: 503,
					headers: corsHeaders(env),
				});
			}
			return new Response(obj.body, {
				headers: {
					...corsHeaders(env),
					"Content-Type": "application/json",
					"Cache-Control":
						"public, max-age=60, s-maxage=300, stale-while-revalidate=86400",
				},
			});
		}

		if (url.pathname === "/corpus-detail") {
			const obj = await env.CORPUS.get("corpus/detail-latest.json.gz");
			if (!obj) {
				return new Response("Detail not built yet", {
					status: 503,
					headers: corsHeaders(env),
				});
			}
			const res = new Response(obj.body, {
				headers: {
					"Content-Type": "application/octet-stream",
					ETag: `"${obj.etag}"`,
					"Cache-Control":
						"public, s-maxage=3600, stale-while-revalidate=86400",
				},
			});
			return serveCorpus(res, request, env);
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
			const obj = await env.CORPUS.get(`corpus/i18n/${lang}/meta.json`);
			if (!obj) {
				return new Response("Overlay not built yet", {
					status: 503,
					headers: corsHeaders(env),
				});
			}
			return new Response(obj.body, {
				headers: {
					...corsHeaders(env),
					"Content-Type": "application/json",
					"Cache-Control":
						"public, max-age=60, s-maxage=300, stale-while-revalidate=86400",
				},
			});
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
			const obj = await env.CORPUS.get(`corpus/i18n/${lang}/names.json.gz`);
			if (!obj) {
				return new Response("Overlay not built yet", {
					status: 503,
					headers: corsHeaders(env),
				});
			}
			const res = new Response(obj.body, {
				headers: {
					"Content-Type": "application/octet-stream",
					ETag: `"${obj.etag}"`,
					"Cache-Control":
						"public, s-maxage=3600, stale-while-revalidate=86400",
				},
			});
			return serveCorpus(res, request, env);
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
				const obj = await env.CORPUS.get(`corpus/region/${region}/meta.json`);
				if (!obj) {
					return new Response("Region corpus not built yet", {
						status: 503,
						headers: corsHeaders(env),
					});
				}
				return new Response(obj.body, {
					headers: {
						...corsHeaders(env),
						"Content-Type": "application/json",
						"Cache-Control":
							"public, max-age=60, s-maxage=300, stale-while-revalidate=86400",
					},
				});
			}

			const key =
				suffix === "/detail"
					? `corpus/region/${region}/detail-latest.json.gz`
					: `corpus/region/${region}/latest.json.gz`;

			// Base region blob shares the /corpus edge-cache pattern; detail
			// mirrors /corpus-detail (no edge cache, just R2 + serveCorpus).
			if (suffix !== "/detail") {
				const cache = (caches as unknown as { default: Cache }).default;
				const cacheKey = new Request(url.toString(), { method: "GET" });
				const cached = await cache.match(cacheKey);
				if (cached) return serveCorpus(cached, request, env);

				const obj = await env.CORPUS.get(key);
				if (!obj) {
					return new Response("Region corpus not built yet", {
						status: 503,
						headers: corsHeaders(env),
					});
				}
				const res = new Response(obj.body, {
					headers: {
						"Content-Type": "application/octet-stream",
						ETag: `"${obj.etag}"`,
						"Cache-Control":
							"public, s-maxage=3600, stale-while-revalidate=86400",
					},
				});
				ctx.waitUntil(cache.put(cacheKey, res.clone()));
				return serveCorpus(res, request, env);
			}

			const obj = await env.CORPUS.get(key);
			if (!obj) {
				return new Response("Region detail not built yet", {
					status: 503,
					headers: corsHeaders(env),
				});
			}
			const res = new Response(obj.body, {
				headers: {
					"Content-Type": "application/octet-stream",
					ETag: `"${obj.etag}"`,
					"Cache-Control":
						"public, s-maxage=3600, stale-while-revalidate=86400",
				},
			});
			return serveCorpus(res, request, env);
		}

		if (!url.pathname.startsWith("/v2/")) {
			return new Response("Not Found", {
				status: 404,
				headers: corsHeaders(env),
			});
		}

		// Stable cache key: sort query params so equivalent requests collide.
		url.searchParams.sort();
		// `caches.default` is a Workers-specific extension absent from the
		// standard CacheStorage type.
		const cache = (caches as unknown as { default: Cache }).default;
		const cacheKey = new Request(url.toString(), { method: "GET" });

		const cached = await cache.match(cacheKey);
		if (cached) {
			ctx.waitUntil(
				fetchOrigin(url, env).then((fresh) =>
					fresh.ok ? cache.put(cacheKey, cacheable(fresh)) : undefined,
				),
			);
			return withCors(cached, env);
		}

		const fresh = await fetchOrigin(url, env);
		if (fresh.ok) ctx.waitUntil(cache.put(cacheKey, cacheable(fresh)));
		return withCors(fresh, env);
	},
};
