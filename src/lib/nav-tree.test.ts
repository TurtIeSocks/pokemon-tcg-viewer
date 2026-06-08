import { describe, expect, test } from "bun:test";
import { seriesMonogram } from "./nav-tree";

describe("seriesMonogram", () => {
	// Two-word series → first letter of each significant word.
	// Single-word series → first two letters. Always uppercased, always ≤2 chars.
	const cases: [string, string][] = [
		["Scarlet & Violet", "SV"],
		["Sword & Shield", "SS"],
		["Sun & Moon", "SM"],
		["Black & White", "BW"],
		["Diamond & Pearl", "DP"],
		["HeartGold & SoulSilver", "HS"],
		["Call of Legends", "CL"], // stop-word "of" dropped
		["XY", "XY"],
		["EX", "EX"],
		["Base", "BA"],
		["Neo", "NE"],
		["Gym", "GY"],
		["Platinum", "PL"],
		["e-Card", "EC"], // hyphen splits into two words
	];

	for (const [name, expected] of cases) {
		test(`${name} → ${expected}`, () => {
			expect(seriesMonogram(name)).toBe(expected);
		});
	}
});
