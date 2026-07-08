import { expect, test } from "bun:test";
import { qrSvgPath } from "./qr";

test("encodes a URL into a QR path with a quiet-zone-padded viewBox", () => {
	const out = qrSvgPath("https://x.test/base/base-set-2/magikarp-50/prices");
	if (!out) throw new Error("expected a QR result");
	// Smallest QR is version 1 = 21 modules; + 2×4 quiet zone = 29 minimum.
	expect(out.count).toBeGreaterThanOrEqual(29);
	expect(out.path.length).toBeGreaterThan(0);
	expect(out.path.startsWith("M")).toBe(true);
});

test("is deterministic for the same input", () => {
	expect(qrSvgPath("https://x.test/a/b/c/prices")).toEqual(
		qrSvgPath("https://x.test/a/b/c/prices"),
	);
});

test("returns null for empty text", () => {
	expect(qrSvgPath("")).toBeNull();
});
