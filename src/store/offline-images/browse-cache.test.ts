import { beforeEach, expect, test } from "bun:test";
import {
	cachedStats,
	clearImageCaches,
	pruneCache,
	setBrowseCacheDepsForTests,
} from "./browse-cache";

function fakeCaches() {
	const stores = new Map<string, Map<string, { size: number }>>();
	const open = async (name: string) => {
		const m = stores.get(name) ?? new Map();
		stores.set(name, m);
		return {
			keys: async () => [...m.keys()].map((k) => new Request(k)),
			delete: async (req: Request) => m.delete(new Request(req).url),
			match: async (req: Request) => {
				const e = m.get(new Request(req).url);
				return e
					? new Response("x", { headers: { "content-length": String(e.size) } })
					: undefined;
			},
			put: async (req: Request, _res: Response) =>
				m.set(new Request(req).url, { size: 1000 }),
		};
	};
	return {
		stores,
		api: { open, delete: async (n: string) => stores.delete(n) },
	};
}

beforeEach(() => {
	const f = fakeCaches();
	// @ts-expect-error minimal Cache stand-in
	setBrowseCacheDepsForTests({ caches: f.api });
	f.stores.set(
		"ptcg-thumbs",
		new Map([
			["https://wsrv.nl/a.jpg", { size: 1000 }],
			["https://wsrv.nl/b.jpg", { size: 1000 }],
			["https://wsrv.nl/c.jpg", { size: 1000 }],
		]),
	);
	f.stores.set(
		"ptcg-hires",
		new Map([["https://wsrv.nl/h.jpg", { size: 2000 }]]),
	);
});

test("cachedStats counts both caches and sums bytes", async () => {
	const s = await cachedStats();
	expect(s.thumbs).toBe(3);
	expect(s.hires).toBe(1);
	expect(s.bytes).toBe(5000); // 3*1000 + 1*2000
});

test("pruneCache deletes the oldest over cap", async () => {
	await pruneCache("ptcg-thumbs", 1);
	expect((await cachedStats()).thumbs).toBe(1);
});

test("clearImageCaches empties both", async () => {
	await clearImageCaches();
	const s = await cachedStats();
	expect(s.thumbs + s.hires).toBe(0);
});
