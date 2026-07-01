import { beforeEach, expect, test } from "bun:test";
import { gzipSync } from "node:zlib";
import {
	checkStale,
	downloadI18n,
	loadI18n,
	resetI18nRuntimeForTests,
	setI18nFetchersForTests,
	syncI18n,
	useI18nRuntime,
} from "./i18n-runtime";

const FR = [
	{ id: "swsh3-136", name: "Dracaufeu" },
	{ id: "base1-4", name: "Dracaufeu" },
];
// Slice to the exact gzip bytes (a Node Buffer's `.buffer` is a shared pool).
const blob = (records: { id: string; name: string }[] = FR) => {
	const b = gzipSync(Buffer.from(JSON.stringify(records)));
	return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};

beforeEach(async () => {
	await resetI18nRuntimeForTests();
});

test("loadI18n('en') clears the overlay and returns to idle", async () => {
	setI18nFetchersForTests({
		fetchVersion: async () => ({ version: "v1", count: 2, builtAt: "x" }),
		fetchBlob: async () => blob(),
	});
	await loadI18n("fr");
	expect(useI18nRuntime.getState().namesById?.get("swsh3-136")).toBe(
		"Dracaufeu",
	);

	await loadI18n("en");
	const s = useI18nRuntime.getState();
	expect(s.lang).toBe("en");
	expect(s.namesById).toBeNull();
	expect(s.version).toBeNull();
	expect(s.status).toBe("idle");
});

test("loadI18n downloads once, builds the map, marks ready", async () => {
	setI18nFetchersForTests({
		fetchVersion: async () => ({ version: "frv1", count: 2, builtAt: "x" }),
		fetchBlob: async () => blob(),
	});
	await loadI18n("fr");
	const s = useI18nRuntime.getState();
	expect(s.lang).toBe("fr");
	expect(s.status).toBe("ready");
	expect(s.version).toBe("frv1");
	expect(s.namesById?.get("base1-4")).toBe("Dracaufeu");
});

test("loadI18n is IDB-first: a second load of the same lang does not re-fetch", async () => {
	let blobCalls = 0;
	setI18nFetchersForTests({
		fetchVersion: async () => ({ version: "frv1", count: 2, builtAt: "x" }),
		fetchBlob: async () => {
			blobCalls++;
			return blob();
		},
	});
	await loadI18n("fr"); // 1 network download → persisted to IDB
	await loadI18n("en"); // switch away (clears in-memory overlay)
	await loadI18n("fr"); // back to fr → must hydrate from IDB, no new fetch
	expect(blobCalls).toBe(1);
	expect(useI18nRuntime.getState().namesById?.get("swsh3-136")).toBe(
		"Dracaufeu",
	);
});

test("downloadI18n de-dupes concurrent calls for the same language", async () => {
	let blobCalls = 0;
	setI18nFetchersForTests({
		fetchVersion: async () => ({ version: "frv1", count: 2, builtAt: "x" }),
		fetchBlob: async () => {
			blobCalls++;
			return blob();
		},
	});
	await Promise.all([downloadI18n("fr"), downloadI18n("fr")]);
	expect(blobCalls).toBe(1);
});

test("syncI18n re-downloads only when the server version differs", async () => {
	let blobCalls = 0;
	setI18nFetchersForTests({
		fetchVersion: async () => ({ version: "frv1", count: 2, builtAt: "x" }),
		fetchBlob: async () => {
			blobCalls++;
			return blob();
		},
	});
	await loadI18n("fr"); // 1 download
	await syncI18n("fr"); // version matches → no re-download
	expect(blobCalls).toBe(1);

	setI18nFetchersForTests({
		fetchVersion: async () => ({ version: "frv2", count: 2, builtAt: "y" }),
		fetchBlob: async () => {
			blobCalls++;
			return blob([{ id: "swsh3-136", name: "Dracaufeu v2" }]);
		},
	});
	await syncI18n("fr"); // version changed → re-download
	expect(blobCalls).toBe(2);
	expect(useI18nRuntime.getState().version).toBe("frv2");
});

test("checkStale flips the active overlay to stale when the server version differs", async () => {
	setI18nFetchersForTests({
		fetchVersion: async () => ({ version: "frv1", count: 2, builtAt: "x" }),
		fetchBlob: async () => blob(),
	});
	await loadI18n("fr");
	setI18nFetchersForTests({
		fetchVersion: async () => ({ version: "frv2", count: 2, builtAt: "y" }),
		fetchBlob: async () => blob(),
	});
	await checkStale("fr");
	expect(useI18nRuntime.getState().status).toBe("stale");
});

test("switching languages swaps the active overlay", async () => {
	setI18nFetchersForTests({
		fetchVersion: async (lang) => ({
			version: `${lang}v1`,
			count: 1,
			builtAt: "x",
		}),
		fetchBlob: async (lang) =>
			blob([{ id: "swsh3-136", name: lang === "fr" ? "Dracaufeu" : "Glurak" }]),
	});
	await loadI18n("fr");
	expect(useI18nRuntime.getState().namesById?.get("swsh3-136")).toBe(
		"Dracaufeu",
	);
	await loadI18n("de");
	const s = useI18nRuntime.getState();
	expect(s.lang).toBe("de");
	expect(s.namesById?.get("swsh3-136")).toBe("Glurak");
	expect(s.version).toBe("dev1");
});
