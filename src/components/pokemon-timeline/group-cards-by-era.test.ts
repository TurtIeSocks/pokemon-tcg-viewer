import { describe, expect, test } from "bun:test";
import type { HoloCardData } from "../holo-card";
import { groupCardsByEra } from "./group-cards-by-era";

function fixture(overrides: Partial<HoloCardData>): HoloCardData {
	return {
		id: overrides.id ?? "test-1",
		imageUrl: "https://example.invalid/test.png",
		name: "Test",
		setId: overrides.setId ?? "test",
		setName: overrides.setName ?? "Test Set",
		setSeries: overrides.setSeries ?? "Base",
		setReleaseDate: overrides.setReleaseDate,
		cardNumber: overrides.cardNumber ?? "1",
		...overrides,
	};
}

describe("groupCardsByEra", () => {
	test("returns empty array for empty input", () => {
		expect(groupCardsByEra([])).toEqual([]);
	});

	test("groups cards by setSeries", () => {
		const cards = [
			fixture({ id: "a", setSeries: "Base", setReleaseDate: "1999-01-09" }),
			fixture({ id: "b", setSeries: "Base", setReleaseDate: "1999-06-16" }),
			fixture({ id: "c", setSeries: "Neo", setReleaseDate: "2000-12-16" }),
		];
		const result = groupCardsByEra(cards);
		expect(result).toHaveLength(2);
		expect(result[0].series).toBe("Base");
		expect(result[0].cards).toHaveLength(2);
		expect(result[1].series).toBe("Neo");
		expect(result[1].cards).toHaveLength(1);
	});

	test("sorts eras by earliest setReleaseDate (oldest first)", () => {
		const cards = [
			fixture({
				id: "swsh1",
				setSeries: "Sword & Shield",
				setReleaseDate: "2020-02-07",
			}),
			fixture({ id: "base1", setSeries: "Base", setReleaseDate: "1999-01-09" }),
			fixture({ id: "neo1", setSeries: "Neo", setReleaseDate: "2000-12-16" }),
		];
		const result = groupCardsByEra(cards);
		expect(result.map((g) => g.series)).toEqual([
			"Base",
			"Neo",
			"Sword & Shield",
		]);
	});

	test("computes single-year range when all cards share a year", () => {
		const cards = [
			fixture({ id: "a", setSeries: "Base", setReleaseDate: "1999-01-09" }),
			fixture({ id: "b", setSeries: "Base", setReleaseDate: "1999-12-15" }),
		];
		const result = groupCardsByEra(cards);
		expect(result[0].yearLabel).toBe("1999");
	});

	test("computes year range when cards span multiple years", () => {
		const cards = [
			fixture({
				id: "a",
				setSeries: "Sword & Shield",
				setReleaseDate: "2020-02-07",
			}),
			fixture({
				id: "b",
				setSeries: "Sword & Shield",
				setReleaseDate: "2022-04-15",
			}),
		];
		const result = groupCardsByEra(cards);
		expect(result[0].yearLabel).toBe("2020 — 2022");
	});

	test("includes a count of cards in each era", () => {
		const cards = [
			fixture({ id: "a", setSeries: "Base", setReleaseDate: "1999-01-09" }),
			fixture({ id: "b", setSeries: "Base", setReleaseDate: "1999-06-16" }),
			fixture({ id: "c", setSeries: "Base", setReleaseDate: "1999-10-10" }),
		];
		const result = groupCardsByEra(cards);
		expect(result[0].count).toBe(3);
	});

	test("groups cards with missing series under 'Other'", () => {
		const cards = [
			fixture({ id: "a", setSeries: "Base", setReleaseDate: "1999-01-09" }),
			fixture({ id: "b", setSeries: "", setReleaseDate: "2024-01-01" }),
		];
		const result = groupCardsByEra(cards);
		const otherGroup = result.find((g) => g.series === "Other");
		expect(otherGroup).toBeDefined();
		expect(otherGroup?.cards).toHaveLength(1);
	});

	test("handles cards with missing release dates (sorts as 'last' when no date in group)", () => {
		// One era with dates, one without — the one with no dates falls to the end.
		const cards = [
			fixture({ id: "a", setSeries: "Base", setReleaseDate: "1999-01-09" }),
			fixture({ id: "b", setSeries: "Mystery", setReleaseDate: undefined }),
		];
		const result = groupCardsByEra(cards);
		expect(result[0].series).toBe("Base");
		expect(result[1].series).toBe("Mystery");
		expect(result[1].yearLabel).toBe("");
	});

	test("preserves card order within each group (input order)", () => {
		const cards = [
			fixture({ id: "a", setSeries: "Base", setReleaseDate: "1999-06-16" }),
			fixture({ id: "b", setSeries: "Base", setReleaseDate: "1999-01-09" }),
		];
		const result = groupCardsByEra(cards);
		// Cards within an era stay in input order (not re-sorted) — the input
		// is already chronological from the API's orderBy=set.releaseDate,number.
		expect(result[0].cards.map((c) => c.id)).toEqual(["a", "b"]);
	});
});
