import { describe, expect, it } from "bun:test";
import { getRarityColor, getTypeColor } from "./card-colors";

describe("getTypeColor", () => {
	it("maps a known energy type", () => {
		expect(getTypeColor("Fire")).toBe("#F08030");
	});
	it("falls back for an unknown type", () => {
		expect(getTypeColor("Quantum")).toBe("#A8A878");
	});
});

describe("getRarityColor", () => {
	it("returns gold for secret/rainbow rarities", () => {
		expect(getRarityColor("Rare Secret")).toBe("#fbbf24");
	});
	it("returns neutral for empty rarity", () => {
		expect(getRarityColor("")).toBe("#9ca3af");
	});
});
