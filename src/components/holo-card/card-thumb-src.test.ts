import { describe, expect, test } from "bun:test";
import { cardThumbSrc } from "./card-thumb-src";

describe("cardThumbSrc", () => {
	test("small present → small", () => {
		expect(
			cardThumbSrc({
				imageUrl: "https://img/full.png",
				imageUrlSmall: "https://img/small.png",
			}),
		).toBe("https://img/small.png");
	});

	test("small absent → full", () => {
		expect(cardThumbSrc({ imageUrl: "https://img/full.png" })).toBe(
			"https://img/full.png",
		);
		expect(
			cardThumbSrc({
				imageUrl: "https://img/full.png",
				imageUrlSmall: undefined,
			}),
		).toBe("https://img/full.png");
	});

	test("small empty-string → full (nonEmptyUrl semantics)", () => {
		expect(
			cardThumbSrc({ imageUrl: "https://img/full.png", imageUrlSmall: "" }),
		).toBe("https://img/full.png");
	});

	test("both absent → undefined (src attribute omitted)", () => {
		expect(cardThumbSrc({ imageUrl: "" })).toBeUndefined();
		expect(cardThumbSrc({ imageUrl: "", imageUrlSmall: "" })).toBeUndefined();
	});
});
