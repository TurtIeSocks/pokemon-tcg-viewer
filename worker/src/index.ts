export interface Env {
	POKEMONTCG_API_KEY: string;
	/** Allowed browser origin for CORS; defaults to "*". */
	ALLOW_ORIGIN?: string;
	CORPUS: R2Bucket;
}

const ORIGIN = "https://api.pokemontcg.io";

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
	return fetch(ORIGIN + url.pathname + url.search, {
		headers: { "X-Api-Key": env.POKEMONTCG_API_KEY },
	});
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
