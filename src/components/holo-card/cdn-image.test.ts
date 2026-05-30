import { describe, expect, test } from "bun:test";
import { cdnImage } from "./cdn-image";

describe("cdnImage", () => {
	test("builds a wsrv URL with width, webp output, no-enlarge", () => {
		const out = cdnImage("https://images.pokemontcg.io/swsh4/43_hires.png", {
			w: 300,
		});
		expect(out.startsWith("https://wsrv.nl/?url=")).toBe(true);
		expect(out).toContain(
			encodeURIComponent("https://images.pokemontcg.io/swsh4/43_hires.png"),
		);
		expect(out).toContain("w=300");
		expect(out).toContain("output=webp");
		expect(out).toContain("we");
	});

	test("adds dpr only when > 1", () => {
		expect(cdnImage("https://img/x.png", { w: 300 })).not.toContain("dpr=");
		expect(cdnImage("https://img/x.png", { w: 300, dpr: 2 })).toContain("dpr=2");
	});
});
