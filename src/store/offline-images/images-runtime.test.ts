import { beforeEach, expect, test } from "bun:test";
import {
	resetImagesForTests,
	setThumbCap,
	useImageCache,
} from "./images-runtime";

beforeEach(async () => {
	await resetImagesForTests();
});

test("setThumbCap persists and updates the store", async () => {
	await setThumbCap(500);
	expect(useImageCache.getState().thumbCap).toBe(500);
});
