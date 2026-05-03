import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { getRarityClass } from "./rarity";

describe("getRarityClass", () => {
	let warnSpy: ReturnType<typeof spyOn>;

	beforeEach(() => {
		warnSpy = spyOn(console, "warn").mockImplementation(() => {});
	});

	afterEach(() => {
		warnSpy.mockRestore();
	});

	test("returns 'no-foil' when rarity is undefined", () => {
		expect(getRarityClass(undefined)).toBe("no-foil");
		expect(warnSpy).not.toHaveBeenCalled();
	});

	test("maps known rarities to their CSS class", () => {
		expect(getRarityClass("Rare Holo")).toBe("holo-basic");
		expect(getRarityClass("Rare Holo VMAX")).toBe("holo-vmax");
		expect(getRarityClass("Reverse Holo")).toBe("reverse-holo");
		expect(getRarityClass("Radiant Rare")).toBe("radiant");
		expect(warnSpy).not.toHaveBeenCalled();
	});

	test("falls back to 'holo-basic' and warns for unknown rarities", () => {
		expect(getRarityClass("Some Future Mythic Tier")).toBe("holo-basic");
		expect(warnSpy).toHaveBeenCalledTimes(1);
		expect(warnSpy.mock.calls[0][0]).toContain("Some Future Mythic Tier");
	});

	test("returns 'no-foil' for plain Common/Uncommon (no foil expected)", () => {
		expect(getRarityClass("Common")).toBe("no-foil");
		expect(getRarityClass("Uncommon")).toBe("no-foil");
		expect(getRarityClass("Rare")).toBe("no-foil");
		expect(warnSpy).not.toHaveBeenCalled();
	});
});
