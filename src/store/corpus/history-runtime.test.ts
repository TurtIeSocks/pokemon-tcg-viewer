import { afterEach, expect, test } from "bun:test";
import { gzipSync } from "node:zlib";
import type { SetHistory } from "@/lib/corpus/price-history";
import {
	loadSetHistory,
	resetHistoryRuntimeForTests,
	setHistoryFetchersForTests,
	useHistoryRuntime,
} from "./history-runtime";

const HIST: SetHistory = {
	"base1-4": [
		[100, 70000],
		[101, 72034],
	],
};
function gz(h: SetHistory): ArrayBuffer {
	const b = gzipSync(Buffer.from(JSON.stringify(h)));
	return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}

afterEach(async () => {
	await resetHistoryRuntimeForTests();
});

test("loadSetHistory fetches, caches, and exposes a set's history", async () => {
	setHistoryFetchersForTests({ fetchHistory: async () => gz(HIST) });
	await loadSetHistory("base1");
	expect(useHistoryRuntime.getState().bySet.get("base1")).toEqual(HIST);
});

test("loadSetHistory is idempotent per set", async () => {
	let fetches = 0;
	setHistoryFetchersForTests({
		fetchHistory: async () => {
			fetches++;
			return gz(HIST);
		},
	});
	await loadSetHistory("base1");
	await loadSetHistory("base1");
	expect(fetches).toBe(1);
});

test("a 503 (no history for set) resolves to empty, not an error crash", async () => {
	setHistoryFetchersForTests({
		fetchHistory: async () => {
			throw new Response(null, { status: 503 });
		},
	});
	await loadSetHistory("nope");
	// unavailable → no entry, no throw
	expect(useHistoryRuntime.getState().bySet.get("nope")).toBeUndefined();
});
