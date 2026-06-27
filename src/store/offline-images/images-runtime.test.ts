import { beforeEach, expect, test } from "bun:test";
import { setBrowseCacheDepsForTests } from "./browse-cache";
import {
	resetImagesForTests,
	setThumbCap,
	useImageCache,
} from "./images-runtime";

// Inject a self-sufficient fake Cache Storage so this file does not depend on
// another test file having set the module singleton first. The actions call
// pruneCache/refreshStats, which touch `caches` (absent in happy-dom).
function fakeCaches(): CacheStorage {
	const empty = {
		keys: async () => [],
		delete: async () => true,
		match: async () => undefined,
		put: async () => undefined,
	};
	return {
		open: async () => empty,
		delete: async () => true,
	} as unknown as CacheStorage;
}

beforeEach(async () => {
	setBrowseCacheDepsForTests({ caches: fakeCaches() });
	await resetImagesForTests();
});

test("setThumbCap persists and updates the store", async () => {
	await setThumbCap(500);
	expect(useImageCache.getState().thumbCap).toBe(500);
});
