import { describe, expect, test } from "bun:test";
import { cacheControl } from "./cache-headers";

describe("cacheControl", () => {
	test("prerendered series/home: long s-maxage + SWR", () => {
		expect(cacheControl("static")).toBe(
			"public, max-age=300, s-maxage=2592000, stale-while-revalidate=86400",
		);
	});
	test("SSR set/card: 1h fresh, 7d stale window", () => {
		expect(cacheControl("ssr")).toBe(
			"public, s-maxage=3600, stale-while-revalidate=604800",
		);
	});
	test("per-user: never cache", () => {
		expect(cacheControl("private")).toBe("private, no-store");
	});
	test("immutable assets", () => {
		expect(cacheControl("immutable")).toBe(
			"public, max-age=31536000, immutable",
		);
	});
});
