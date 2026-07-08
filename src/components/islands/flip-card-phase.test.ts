import { describe, expect, test } from "bun:test";
import { backOverlayClass } from "./flip-card-phase";

describe("flip-card crossfade", () => {
	test("keeps the card back fully opaque while waiting on the image", () => {
		expect(backOverlayClass("back")).toBe("opacity-100");
	});

	test("fades the card back out while flipping (crossfade, not a 3D flip)", () => {
		expect(backOverlayClass("flipping")).toBe("opacity-0");
	});

	test("never emits a rotateY 3D transform in either state", () => {
		expect(backOverlayClass("back")).not.toContain("rotate");
		expect(backOverlayClass("flipping")).not.toContain("rotate");
	});
});
