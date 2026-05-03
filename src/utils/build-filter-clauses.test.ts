import { describe, expect, test } from "bun:test";
import { buildFilterClauses } from "./build-filter-clauses";

describe("buildFilterClauses", () => {
	test("returns empty string when no filters", () => {
		expect(buildFilterClauses({})).toBe("");
		expect(
			buildFilterClauses({
				types: [],
				rarity: [],
				supertype: [],
				subtypes: [],
			}),
		).toBe("");
	});

	test("renders a single types filter as ANDed clause", () => {
		expect(buildFilterClauses({ types: ["fire"] })).toBe(" AND (types:fire)");
	});

	test("ORs multiple values within a single dimension", () => {
		expect(buildFilterClauses({ types: ["fire", "water"] })).toBe(
			" AND (types:fire OR types:water)",
		);
	});

	test("ANDs across multiple dimensions", () => {
		expect(
			buildFilterClauses({
				types: ["fire"],
				supertype: ["Pokémon"],
			}),
		).toBe(" AND (types:fire) AND (supertype:Pokémon)");
	});

	test("quotes rarity values that contain spaces", () => {
		expect(
			buildFilterClauses({ rarity: ["Rare Holo", "Rare Holo VMAX"] }),
		).toBe(' AND (rarity:"Rare Holo" OR rarity:"Rare Holo VMAX")');
	});

	test("renders a fully-populated filter set in the canonical order", () => {
		expect(
			buildFilterClauses({
				types: ["fire"],
				rarity: ["Rare Holo VMAX"],
				supertype: ["Pokémon"],
				subtypes: ["VMAX"],
			}),
		).toBe(
			' AND (types:fire) AND (rarity:"Rare Holo VMAX") AND (supertype:Pokémon) AND (subtypes:VMAX)',
		);
	});
});
