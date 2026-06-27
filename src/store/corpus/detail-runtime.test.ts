import { beforeEach, expect, test } from "bun:test";
import { gzipSync } from "node:zlib";
import {
	checkStale,
	disableOffline,
	enableOffline,
	resetDetailRuntimeForTests,
	setDetailFetchersForTests,
	syncDetail,
	useDetailRuntime,
} from "./detail-runtime";

const RECORDS = [{ id: "base1-4", hp: "120", artist: "Arita" }];
const blob = () => gzipSync(Buffer.from(JSON.stringify(RECORDS))).buffer;

beforeEach(async () => {
	await resetDetailRuntimeForTests();
});

test("enableOffline downloads, builds the map, and marks ready", async () => {
	setDetailFetchersForTests({
		fetchVersion: async () => ({ version: "v1", count: 1, builtAt: "x" }),
		fetchBlob: async () => blob(),
	});
	await enableOffline();
	const s = useDetailRuntime.getState();
	expect(s.status).toBe("ready");
	expect(s.enabled).toBe(true);
	expect(s.detailById?.get("base1-4")?.hp).toBe("120");
	expect(s.version).toBe("v1");
});

test("syncDetail is a no-op when version is unchanged", async () => {
	let blobCalls = 0;
	setDetailFetchersForTests({
		fetchVersion: async () => ({ version: "v1", count: 1, builtAt: "x" }),
		fetchBlob: async () => {
			blobCalls++;
			return blob();
		},
	});
	await enableOffline(); // 1 blob fetch
	await syncDetail(); // version matches -> no re-download
	expect(blobCalls).toBe(1);
	expect(useDetailRuntime.getState().status).toBe("ready");
});

test("checkStale flips to stale when the server version differs", async () => {
	setDetailFetchersForTests({
		fetchVersion: async () => ({ version: "v1", count: 1, builtAt: "x" }),
		fetchBlob: async () => blob(),
	});
	await enableOffline();
	setDetailFetchersForTests({
		fetchVersion: async () => ({ version: "v2", count: 1, builtAt: "y" }),
		fetchBlob: async () => blob(),
	});
	await checkStale();
	expect(useDetailRuntime.getState().status).toBe("stale");
});

test("disableOffline clears the map and flag", async () => {
	setDetailFetchersForTests({
		fetchVersion: async () => ({ version: "v1", count: 1, builtAt: "x" }),
		fetchBlob: async () => blob(),
	});
	await enableOffline();
	await disableOffline();
	const s = useDetailRuntime.getState();
	expect(s.enabled).toBe(false);
	expect(s.detailById).toBeNull();
	expect(s.status).toBe("off");
});
