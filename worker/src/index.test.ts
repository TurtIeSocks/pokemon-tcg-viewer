import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import worker from "./index";

const realFetch = globalThis.fetch;
// @ts-expect-error — caches may be undefined outside the Workers runtime.
const realCaches = globalThis.caches;

interface FakeCache {
	match: (req: Request) => Promise<Response | undefined>;
	put: (req: Request, res: Response) => Promise<void>;
}

function installFakeCaches(): Map<string, Response> {
	const store = new Map<string, Response>();
	const cache: FakeCache = {
		async match(req) {
			const hit = store.get(new Request(req).url);
			return hit ? hit.clone() : undefined;
		},
		async put(req, res) {
			store.set(new Request(req).url, res.clone());
		},
	};
	// @ts-expect-error — minimal Cache stand-in for tests.
	globalThis.caches = { default: cache };
	return store;
}

let pending: Promise<unknown>[] = [];
const ctx = {
	waitUntil: (p: Promise<unknown>) => {
		pending.push(p);
	},
	passThroughOnException: () => {},
};
const CORPUS = {
	get: async (key: string) => {
		if (key === "corpus/latest.json.gz")
			return {
				body: "GZBYTES",
				etag: "abc123",
				writeHttpMetadata: (_h: Headers) => {},
			};
		if (key === "corpus/detail-latest.json.gz")
			return { body: new Blob(["DETAIL_GZ"]).stream(), etag: "detailtag" };
		if (key === "corpus/detail-meta.json")
			return {
				body: new Blob(['{"version":"abc","count":2,"builtAt":"x"}']).stream(),
				etag: "metatag",
			};
		if (key === "corpus/i18n/fr/names.json.gz")
			return { body: new Blob(["FR_NAMES_GZ"]).stream(), etag: "frtag" };
		if (key === "corpus/i18n/fr/meta.json")
			return {
				body: new Blob([
					'{"lang":"fr","version":"frv","count":3,"builtAt":"x"}',
				]).stream(),
				etag: "frmetatag",
			};
		if (key === "corpus/i18n/ko/names.json.gz")
			return { body: new Blob(["KO_NAMES_GZ"]).stream(), etag: "kotag" };
		if (key === "corpus/region/asia/latest.json.gz")
			return {
				body: "ASIA_GZBYTES",
				etag: "asiatag",
				writeHttpMetadata: (_h: Headers) => {},
			};
		if (key === "corpus/region/asia/meta.json")
			return {
				body: new Blob([
					'{"version":"asiav","count":5,"builtAt":"x"}',
				]).stream(),
				etag: "asiametatag",
			};
		if (key === "corpus/prices/latest.json.gz")
			return { body: "PRICES_GZ", etag: "pricestag" };
		if (key === "corpus/prices/meta.json")
			return {
				body: new Blob([
					'{"date":"2026-07-03","count":19000,"builtAt":"x"}',
				]).stream(),
				etag: "pricesmetatag",
			};
		if (key === "corpus/prices/history/base1.json.gz")
			return { body: "HISTORY_GZ", etag: "histtag" };
		return null;
	},
};

const env = {
	ALLOW_ORIGIN: "https://x.github.io",
	CORPUS,
} as unknown as { ALLOW_ORIGIN: string };

function envWithCorpus(obj: { body: string; etag: string } | null) {
	return {
		...env,
		CORPUS: {
			get: async (key: string) => {
				if (key === "corpus/latest.json.gz") {
					if (!obj) return null;
					return {
						body: obj.body,
						etag: obj.etag,
						writeHttpMetadata: (_h: Headers) => {},
					};
				}
				return CORPUS.get(key);
			},
		},
	} as unknown as typeof env;
}

function envWithRegionCorpus(obj: { body: string; etag: string } | null) {
	return {
		...env,
		CORPUS: {
			get: async (key: string) => {
				if (key === "corpus/region/asia/latest.json.gz") {
					if (!obj) return null;
					return {
						body: obj.body,
						etag: obj.etag,
						writeHttpMetadata: (_h: Headers) => {},
					};
				}
				return CORPUS.get(key);
			},
		},
	} as unknown as typeof env;
}

beforeEach(() => {
	pending = [];
	installFakeCaches();
});
afterEach(() => {
	globalThis.fetch = realFetch;
	// @ts-expect-error — restore (or clear) the caches global.
	globalThis.caches = realCaches;
});

describe("worker", () => {
	test("proxies /v2 request to TCGdex and adds CORS", async () => {
		const fetchMock = mock(
			async () => new Response(JSON.stringify({ data: [] }), { status: 200 }),
		);
		globalThis.fetch = fetchMock as unknown as typeof fetch;

		const res = await worker.fetch(
			new Request("https://proxy.test/v2/cards?q=name:pikachu"),
			env,
			ctx,
		);
		expect(res.status).toBe(200);
		expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
			"https://x.github.io",
		);
		const callUrl = fetchMock.mock.calls[0]?.[0] as string;
		expect(callUrl).toContain("https://api.tcgdex.net");
	});

	test("OPTIONS preflight returns 204 with CORS", async () => {
		const res = await worker.fetch(
			new Request("https://proxy.test/v2/cards", { method: "OPTIONS" }),
			env,
			ctx,
		);
		expect(res.status).toBe(204);
		expect(res.headers.get("Access-Control-Allow-Methods")).toContain("GET");
		// The conditional GET sends If-None-Match, a non-simple header → preflight.
		// It must be allowed or the browser rejects the corpus revalidation request.
		expect(res.headers.get("Access-Control-Allow-Headers")).toContain(
			"If-None-Match",
		);
	});

	test("non-GET is rejected", async () => {
		const res = await worker.fetch(
			new Request("https://proxy.test/v2/cards", { method: "POST" }),
			env,
			ctx,
		);
		expect(res.status).toBe(405);
	});

	test("non-/v2 paths 404", async () => {
		globalThis.fetch = mock(
			async () => new Response("x"),
		) as unknown as typeof fetch;
		const res = await worker.fetch(
			new Request("https://proxy.test/secret"),
			env,
			ctx,
		);
		expect(res.status).toBe(404);
	});

	test("/corpus serves the R2 blob with an ETag and CORS", async () => {
		const res = await worker.fetch(
			new Request("https://proxy.test/corpus"),
			envWithCorpus({ body: "GZBYTES", etag: "abc123" }),
			ctx,
		);
		expect(res.status).toBe(200);
		expect(res.headers.get("ETag")).toBe('"abc123"');
		expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
		expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
			"https://x.github.io",
		);
		// ETag must be CORS-exposed or a cross-origin fetch() reads null and the
		// client can never send If-None-Match — the 304 path below would be dead.
		expect(res.headers.get("Access-Control-Expose-Headers")).toContain("ETag");
		expect(await res.text()).toBe("GZBYTES");
	});

	test("/corpus returns 304 when If-None-Match matches", async () => {
		const res = await worker.fetch(
			new Request("https://proxy.test/corpus", {
				headers: { "If-None-Match": '"abc123"' },
			}),
			envWithCorpus({ body: "GZBYTES", etag: "abc123" }),
			ctx,
		);
		expect(res.status).toBe(304);
	});

	test("/corpus returns 503 when the blob is absent", async () => {
		const res = await worker.fetch(
			new Request("https://proxy.test/corpus"),
			envWithCorpus(null),
			ctx,
		);
		expect(res.status).toBe(503);
	});

	test("/corpus-detail serves the blob with an ETag and CORS", async () => {
		const res = await worker.fetch(
			new Request("https://proxy.test/corpus-detail"),
			env,
			ctx,
		);
		expect(res.status).toBe(200);
		expect(res.headers.get("ETag")).toBe('"detailtag"');
		expect(res.headers.get("Access-Control-Allow-Origin")).toBeTruthy();
	});

	test("/corpus-detail/version serves the meta JSON", async () => {
		const res = await worker.fetch(
			new Request("https://proxy.test/corpus-detail/version"),
			env,
			ctx,
		);
		expect(res.status).toBe(200);
		expect(await res.json()).toMatchObject({ version: "abc", count: 2 });
	});

	test("/corpus-detail returns 503 when the object is missing", async () => {
		const emptyEnv = { ...env, CORPUS: { get: async () => null } };
		const res = await worker.fetch(
			new Request("https://proxy.test/corpus-detail"),
			emptyEnv,
			ctx,
		);
		expect(res.status).toBe(503);
	});

	test("/corpus-i18n/:lang serves the overlay blob with an ETag and CORS", async () => {
		const res = await worker.fetch(
			new Request("https://proxy.test/corpus-i18n/fr"),
			env,
			ctx,
		);
		expect(res.status).toBe(200);
		expect(res.headers.get("ETag")).toBe('"frtag"');
		expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
		expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
			"https://x.github.io",
		);
		expect(res.headers.get("Cache-Control")).toContain(
			"stale-while-revalidate=86400",
		);
		expect(await res.text()).toBe("FR_NAMES_GZ");
	});

	test("/corpus-i18n/:lang returns 304 when If-None-Match matches", async () => {
		const res = await worker.fetch(
			new Request("https://proxy.test/corpus-i18n/fr", {
				headers: { "If-None-Match": '"frtag"' },
			}),
			env,
			ctx,
		);
		expect(res.status).toBe(304);
	});

	test("/corpus-i18n/:lang returns 503 when the overlay is absent", async () => {
		const res = await worker.fetch(
			new Request("https://proxy.test/corpus-i18n/de"),
			env,
			ctx,
		);
		expect(res.status).toBe(503);
	});

	test("/corpus-i18n rejects an unsupported lang with 404 + CORS", async () => {
		const res = await worker.fetch(
			new Request("https://proxy.test/corpus-i18n/ja"),
			env,
			ctx,
		);
		expect(res.status).toBe(404);
		expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
			"https://x.github.io",
		);
	});

	test("/corpus-i18n/:lang/version serves the overlay meta JSON", async () => {
		const res = await worker.fetch(
			new Request("https://proxy.test/corpus-i18n/fr/version"),
			env,
			ctx,
		);
		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toBe("application/json");
		expect(await res.json()).toMatchObject({
			lang: "fr",
			version: "frv",
			count: 3,
		});
	});

	test("/corpus-i18n/:lang/version rejects an unsupported lang with 404", async () => {
		const res = await worker.fetch(
			new Request("https://proxy.test/corpus-i18n/ja/version"),
			env,
			ctx,
		);
		expect(res.status).toBe(404);
		expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
			"https://x.github.io",
		);
	});

	test("/corpus-i18n/:lang/version returns 503 when the meta is absent", async () => {
		const res = await worker.fetch(
			new Request("https://proxy.test/corpus-i18n/de/version"),
			env,
			ctx,
		);
		expect(res.status).toBe(503);
	});

	test("serves a cached /v2 response without re-hitting the origin", async () => {
		let n = 0;
		const fetchMock = mock(
			async () => new Response(JSON.stringify({ n: ++n }), { status: 200 }),
		);
		globalThis.fetch = fetchMock as unknown as typeof fetch;
		const url = "https://proxy.test/v2/cards?q=a";

		const r1 = await worker.fetch(new Request(url), env, ctx);
		expect(await r1.json()).toEqual({ n: 1 }); // miss → fresh from origin
		await Promise.all(pending); // let the background cache.put settle
		pending = [];

		const r2 = await worker.fetch(new Request(url), env, ctx);
		expect(await r2.json()).toEqual({ n: 1 }); // hit → served from cache
		// The regression this guards: a hit used to schedule an unconditional
		// refetch, so every cache hit still cost one api.tcgdex.net subrequest.
		expect(pending.length).toBe(0);
		expect(n).toBe(1);
	});

	test("preflight is cacheable for a day (halves conditional-GET traffic)", async () => {
		const res = await worker.fetch(
			new Request("https://proxy.test/corpus", { method: "OPTIONS" }),
			env,
			ctx,
		);
		expect(res.headers.get("Access-Control-Max-Age")).toBe("86400");
	});

	test("a cached blob route skips the R2 GET on the second hit", async () => {
		let r2gets = 0;
		const counting = {
			...env,
			CORPUS: {
				get: async (key: string) => {
					r2gets++;
					return CORPUS.get(key);
				},
			},
		} as unknown as typeof env;

		// These had no edge cache: every request was an R2 Class B op. The
		// /version probes are the worst of them — every caller sends
		// `cache: "no-store"`, so nothing upstream absorbed the polling.
		for (const url of [
			"https://proxy.test/corpus-detail",
			"https://proxy.test/corpus-prices",
			"https://proxy.test/corpus-i18n/fr",
			"https://proxy.test/corpus-prices/history/base1",
		]) {
			r2gets = 0;
			await worker.fetch(new Request(url), counting, ctx);
			await Promise.all(pending);
			pending = [];
			const hit = await worker.fetch(new Request(url), counting, ctx);
			expect(hit.status).toBe(200);
			expect(r2gets).toBe(1);
		}
	});

	test("/corpus-i18n/ko serves the overlay blob (Asian overlay lang)", async () => {
		const res = await worker.fetch(
			new Request("https://proxy.test/corpus-i18n/ko"),
			env,
			ctx,
		);
		expect(res.status).toBe(200);
		expect(res.headers.get("ETag")).toBe('"kotag"');
		expect(await res.text()).toBe("KO_NAMES_GZ");
	});

	test("/corpus-i18n/ja rejects with 404 (ja is base corpus, no overlay)", async () => {
		const res = await worker.fetch(
			new Request("https://proxy.test/corpus-i18n/ja"),
			env,
			ctx,
		);
		expect(res.status).toBe(404);
		expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
			"https://x.github.io",
		);
	});

	test("/corpus-region/asia serves the R2 blob with an ETag and CORS", async () => {
		const res = await worker.fetch(
			new Request("https://proxy.test/corpus-region/asia"),
			envWithRegionCorpus({ body: "ASIA_GZBYTES", etag: "asiatag" }),
			ctx,
		);
		expect(res.status).toBe(200);
		expect(res.headers.get("ETag")).toBe('"asiatag"');
		expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
		expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
			"https://x.github.io",
		);
		expect(res.headers.get("Cache-Control")).toContain("s-maxage=3600");
		expect(await res.text()).toBe("ASIA_GZBYTES");
	});

	test("/corpus-region/asia returns 304 when If-None-Match matches", async () => {
		const res = await worker.fetch(
			new Request("https://proxy.test/corpus-region/asia", {
				headers: { "If-None-Match": '"asiatag"' },
			}),
			envWithRegionCorpus({ body: "ASIA_GZBYTES", etag: "asiatag" }),
			ctx,
		);
		expect(res.status).toBe(304);
	});

	test("/corpus-region/asia returns 503 when the blob is absent", async () => {
		const res = await worker.fetch(
			new Request("https://proxy.test/corpus-region/asia"),
			envWithRegionCorpus(null),
			ctx,
		);
		expect(res.status).toBe(503);
	});

	test("/corpus-region/asia/version serves the meta JSON", async () => {
		const res = await worker.fetch(
			new Request("https://proxy.test/corpus-region/asia/version"),
			env,
			ctx,
		);
		expect(res.status).toBe(200);
		expect(res.headers.get("Content-Type")).toBe("application/json");
		expect(await res.json()).toMatchObject({ version: "asiav", count: 5 });
	});

	test("/corpus-region/xx rejects an unsupported region with 404 + CORS", async () => {
		const res = await worker.fetch(
			new Request("https://proxy.test/corpus-region/xx"),
			env,
			ctx,
		);
		expect(res.status).toBe(404);
		expect(res.headers.get("Access-Control-Allow-Origin")).toBe(
			"https://x.github.io",
		);
	});

	test("/corpus-prices serves the prices blob with ETag + SWR caching", async () => {
		const res = await worker.fetch(
			new Request("https://proxy.test/corpus-prices"),
			env,
			ctx,
		);
		expect(res.status).toBe(200);
		expect(res.headers.get("ETag")).toBe('"pricestag"');
		expect(res.headers.get("Cache-Control")).toContain("s-maxage=3600");
		expect(await res.text()).toBe("PRICES_GZ");
	});

	test("/corpus-prices returns 304 when If-None-Match matches", async () => {
		const res = await worker.fetch(
			new Request("https://proxy.test/corpus-prices", {
				headers: { "If-None-Match": '"pricestag"' },
			}),
			env,
			ctx,
		);
		expect(res.status).toBe(304);
	});

	test("/corpus-prices/version serves the meta JSON", async () => {
		const res = await worker.fetch(
			new Request("https://proxy.test/corpus-prices/version"),
			env,
			ctx,
		);
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			date: "2026-07-03",
			count: 19000,
			builtAt: "x",
		});
	});

	test("/corpus-prices returns 503 when the object is missing", async () => {
		const emptyEnv = { ...env, CORPUS: { get: async () => null } };
		const res = await worker.fetch(
			new Request("https://proxy.test/corpus-prices"),
			emptyEnv,
			ctx,
		);
		expect(res.status).toBe(503);
	});

	test("/corpus-prices/history/:setId serves the history blob with ETag + SWR", async () => {
		const res = await worker.fetch(
			new Request("https://proxy.test/corpus-prices/history/base1"),
			env,
			ctx,
		);
		expect(res.status).toBe(200);
		expect(res.headers.get("ETag")).toBe('"histtag"');
		expect(res.headers.get("Cache-Control")).toContain("s-maxage=3600");
		expect(res.headers.get("Cache-Control")).toContain(
			"stale-while-revalidate=86400",
		);
		expect(await res.text()).toBe("HISTORY_GZ");
	});

	test("/corpus-prices/history/:setId returns 304 when If-None-Match matches", async () => {
		const res = await worker.fetch(
			new Request("https://proxy.test/corpus-prices/history/base1", {
				headers: { "If-None-Match": '"histtag"' },
			}),
			env,
			ctx,
		);
		expect(res.status).toBe(304);
	});

	test("/corpus-prices/history/:setId returns 503 for unbuilt set", async () => {
		const res = await worker.fetch(
			new Request("https://proxy.test/corpus-prices/history/nope"),
			env,
			ctx,
		);
		expect(res.status).toBe(503);
	});
});
