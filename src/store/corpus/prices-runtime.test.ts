import { afterEach, expect, test } from "bun:test";
import { gzipSync } from "node:zlib";
import type { PricesBlob } from "../../lib/corpus/price-types";
import {
	downloadPrices,
	loadPrices,
	resetPricesRuntimeForTests,
	setPricesFetchersForTests,
	syncPrices,
	usePricesRuntime,
} from "./prices-runtime";

const BLOB: PricesBlob = {
	v: 1,
	date: "2026-07-03",
	fx: { base: "EUR", date: "2026-07-03", rates: { USD: 1.09 } },
	sources: { tp: "2026-07-03", cm: "2026-07-03" },
	cards: {
		"base1-4": { tp: { H: [72034, 53499] }, cm: [50168, 27674, 40096, 56391] },
	},
};

function gzBlob(blob: PricesBlob): ArrayBuffer {
	const buf = gzipSync(Buffer.from(JSON.stringify(blob)));
	return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

afterEach(async () => {
	await resetPricesRuntimeForTests();
});

test("downloadPrices fetches, gunzips, commits the map + meta", async () => {
	setPricesFetchersForTests({
		fetchVersion: async () => ({ date: "2026-07-03", count: 1, builtAt: "x" }),
		fetchBlob: async () => gzBlob(BLOB),
	});
	await downloadPrices();
	const s = usePricesRuntime.getState();
	expect(s.status).toBe("ready");
	expect(s.byId?.get("base1-4")).toEqual(BLOB.cards["base1-4"]);
	expect(s.meta).toEqual({
		date: "2026-07-03",
		sources: { tp: "2026-07-03", cm: "2026-07-03" },
		fx: BLOB.fx,
	});
});

test("loadPrices is idempotent once ready", async () => {
	let blobFetches = 0;
	setPricesFetchersForTests({
		fetchVersion: async () => ({ date: "2026-07-03", count: 1, builtAt: "x" }),
		fetchBlob: async () => {
			blobFetches++;
			return gzBlob(BLOB);
		},
	});
	await loadPrices();
	await loadPrices();
	expect(blobFetches).toBe(1);
	expect(usePricesRuntime.getState().status).toBe("ready");
});

test("a 503 leaves the runtime 'unavailable', not 'error'", async () => {
	setPricesFetchersForTests({
		fetchVersion: async () => {
			throw new Response(null, { status: 503 });
		},
		fetchBlob: async () => {
			throw new Response(null, { status: 503 });
		},
	});
	await downloadPrices();
	expect(usePricesRuntime.getState().status).toBe("unavailable");
});

test("syncPrices re-downloads when the server date differs", async () => {
	setPricesFetchersForTests({
		fetchVersion: async () => ({ date: "2026-07-03", count: 1, builtAt: "x" }),
		fetchBlob: async () => gzBlob(BLOB),
	});
	await downloadPrices();
	const next: PricesBlob = { ...BLOB, date: "2026-07-04" };
	setPricesFetchersForTests({
		fetchVersion: async () => ({ date: "2026-07-04", count: 1, builtAt: "x" }),
		fetchBlob: async () => gzBlob(next),
	});
	await syncPrices();
	expect(usePricesRuntime.getState().meta?.date).toBe("2026-07-04");
});
