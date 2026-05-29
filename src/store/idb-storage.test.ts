import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { del, get } from "idb-keyval";
import {
	createIdbStorage,
	IDB_KEY,
	LEGACY_LOCALSTORAGE_KEY,
} from "./idb-storage";

interface Sample {
	state: { hello: string };
	version: number;
}

beforeEach(async () => {
	await del(IDB_KEY);
	localStorage.removeItem(LEGACY_LOCALSTORAGE_KEY);
});

afterEach(async () => {
	await del(IDB_KEY);
	localStorage.removeItem(LEGACY_LOCALSTORAGE_KEY);
});

describe("createIdbStorage", () => {
	test("getItem returns null when IDB is empty and no legacy data exists", async () => {
		const storage = createIdbStorage<Sample["state"]>();
		const result = await storage.getItem("ignored");
		expect(result).toBeNull();
	});

	test("setItem then getItem round-trips the value", async () => {
		const storage = createIdbStorage<Sample["state"]>();
		const payload: Sample = { state: { hello: "world" }, version: 5 };
		await storage.setItem("ignored", payload);
		const result = await storage.getItem("ignored");
		expect(result).toEqual(payload);
	});

	test("getItem migrates from localStorage when IDB empty + legacy key present", async () => {
		const legacyPayload = { state: { hello: "legacy" }, version: 4 };
		localStorage.setItem(
			LEGACY_LOCALSTORAGE_KEY,
			JSON.stringify(legacyPayload),
		);
		const storage = createIdbStorage<Sample["state"]>();
		const result = await storage.getItem("ignored");
		expect(result).toEqual(legacyPayload);
		// Migrated into IDB
		const inIdb = await get<string | undefined>(IDB_KEY);
		expect(inIdb).toBe(JSON.stringify(legacyPayload));
		// Legacy localStorage key removed
		expect(localStorage.getItem(LEGACY_LOCALSTORAGE_KEY)).toBeNull();
	});
});
