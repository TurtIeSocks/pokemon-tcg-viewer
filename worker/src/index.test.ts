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
const env = {
	POKEMONTCG_API_KEY: "secret",
	ALLOW_ORIGIN: "https://x.github.io",
};

function envWithCorpus(obj: { body: string; etag: string } | null) {
	return {
		...env,
		CORPUS: {
			get: async (key: string) => {
				if (key !== "corpus/latest.json.gz" || !obj) return null;
				return {
					body: obj.body,
					etag: obj.etag,
					writeHttpMetadata: (_h: Headers) => {},
				};
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
	test("injects the API key into the origin request and adds CORS", async () => {
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
		const callInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
		const headers = new Headers(callInit.headers);
		expect(headers.get("X-Api-Key")).toBe("secret");
	});

	test("OPTIONS preflight returns 204 with CORS", async () => {
		const res = await worker.fetch(
			new Request("https://proxy.test/v2/cards", { method: "OPTIONS" }),
			env,
			ctx,
		);
		expect(res.status).toBe(204);
		expect(res.headers.get("Access-Control-Allow-Methods")).toContain("GET");
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
		expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://x.github.io");
		expect(await res.text()).toBe("GZBYTES");
	});

	test("/corpus returns 304 when If-None-Match matches", async () => {
		const res = await worker.fetch(
			new Request("https://proxy.test/corpus", { headers: { "If-None-Match": '"abc123"' } }),
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

	test("serves cached response on a hit and revalidates in the background", async () => {
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
		expect(pending.length).toBe(1); // background SWR refresh scheduled
		await Promise.all(pending);
		expect(n).toBe(2); // origin revalidated in the background
	});
});
