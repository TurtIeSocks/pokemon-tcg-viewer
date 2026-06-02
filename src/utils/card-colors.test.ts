import { describe, expect, it } from "bun:test";
import {
	NEUTRAL_ACCENT,
	getCardAccent,
	getRarityColor,
	getReadableAccent,
	getTypeColor,
} from "./card-colors";

// --- WCAG contrast helpers (test-only) ---
function hexToLinear(c: number): number {
	const s = c / 255;
	return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
	const n = hex.replace("#", "");
	const r = Number.parseInt(n.slice(0, 2), 16);
	const g = Number.parseInt(n.slice(2, 4), 16);
	const b = Number.parseInt(n.slice(4, 6), 16);
	return 0.2126 * hexToLinear(r) + 0.7152 * hexToLinear(g) + 0.0722 * hexToLinear(b);
}

function contrastRatio(fg: string, bg: string): number {
	const l1 = relativeLuminance(fg);
	const l2 = relativeLuminance(bg);
	const lighter = Math.max(l1, l2);
	const darker = Math.min(l1, l2);
	return (lighter + 0.05) / (darker + 0.05);
}

const DARK_BG = "#0d0d0f";

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

describe("getCardAccent", () => {
	it("returns Lightning color for ['Lightning']", () => {
		expect(getCardAccent(["Lightning"])).toBe(getTypeColor("Lightning"));
	});
	it("returns NEUTRAL_ACCENT for undefined", () => {
		expect(getCardAccent(undefined)).toBe(NEUTRAL_ACCENT);
	});
	it("returns NEUTRAL_ACCENT for empty array", () => {
		expect(getCardAccent([])).toBe(NEUTRAL_ACCENT);
	});
});

describe("getReadableAccent", () => {
	const ALL_COLORS: Array<[string, string]> = [
		["Colorless", "#A8A878"],
		["Darkness", "#705848"],
		["Dragon", "#7038F8"],
		["Fairy", "#EE99AC"],
		["Fighting", "#C03028"],
		["Fire", "#F08030"],
		["Grass", "#78C850"],
		["Lightning", "#F8D030"],
		["Metal", "#B8B8D0"],
		["Psychic", "#F85888"],
		["Water", "#6890F0"],
		["Neutral", NEUTRAL_ACCENT],
	];

	for (const [label, hex] of ALL_COLORS) {
		it(`${label} (${hex}) yields contrast ≥ 4.5 on dark bg`, () => {
			const result = getReadableAccent(hex);
			const ratio = contrastRatio(result, DARK_BG);
			expect(ratio).toBeGreaterThanOrEqual(4.5);
		});
	}

	it("Lightning stays same or brighter (contrast does not decrease)", () => {
		const original = "#F8D030";
		const result = getReadableAccent(original);
		const before = contrastRatio(original, DARK_BG);
		const after = contrastRatio(result, DARK_BG);
		expect(after).toBeGreaterThanOrEqual(before - 0.01); // allow fp rounding
	});
});
