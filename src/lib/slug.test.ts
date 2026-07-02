import { describe, expect, test } from "bun:test";
import type { CorpusCard } from "../store/corpus/corpus-types";
import {
	buildSlugIndex,
	cardPath,
	resolveCard,
	resolveSet,
	type SluggableSet,
	slugify,
	titleCaseSlug,
} from "./slug";

describe("titleCaseSlug", () => {
	test("title-cases a hyphenated species slug", () => {
		expect(titleCaseSlug("rhydon")).toBe("Rhydon");
		expect(titleCaseSlug("mr-mime")).toBe("Mr Mime");
		expect(titleCaseSlug("nidoran-f")).toBe("Nidoran F");
	});
});

const sets: SluggableSet[] = [
	{ id: "swsh9", name: "Brilliant Stars", series: "Sword & Shield" },
	{ id: "base1", name: "Base", series: "Base" },
];
// CorpusCard requires id, name, imageUrl, imageUrlSmall, supertype, setId, number.
const card = (
	over: Partial<CorpusCard> &
		Pick<CorpusCard, "id" | "name" | "number" | "setId">,
): CorpusCard => ({
	imageUrl: "l.png",
	imageUrlSmall: "s.png",
	supertype: "Pokémon",
	...over,
});
const cards: CorpusCard[] = [
	card({
		id: "swsh9-154",
		name: "Charizard VSTAR",
		number: "154",
		setId: "swsh9",
	}),
	card({
		id: "swsh9-018",
		name: "Charizard VSTAR",
		number: "018",
		setId: "swsh9",
	}),
	card({ id: "base1-4", name: "Charizard", number: "4", setId: "base1" }),
];

describe("buildSlugIndex", () => {
	const idx = buildSlugIndex(sets, cards);

	test("resolves series + set slug to set id", () => {
		expect(resolveSet(idx, "sword-shield", "brilliant-stars")).toBe("swsh9");
	});

	test("resolves a card slug to card id within its set", () => {
		expect(resolveSet(idx, "base", "base")).toBe("base1");
		expect(resolveCard(idx, "base", "base", "charizard-4")).toBe("base1-4");
	});

	test("disambiguates colliding card slugs by appending the number", () => {
		// Both Charizard VSTAR cards slugify to the same base; number keeps them unique.
		const a = resolveCard(
			idx,
			"sword-shield",
			"brilliant-stars",
			"charizard-vstar-154",
		);
		const b = resolveCard(
			idx,
			"sword-shield",
			"brilliant-stars",
			"charizard-vstar-018",
		);
		expect(a).toBe("swsh9-154");
		expect(b).toBe("swsh9-018");
	});

	test("round-trips: cardPath(resolve) is stable", () => {
		const path = cardPath(idx, "swsh9-154");
		expect(path).toBe("/sword-shield/brilliant-stars/charizard-vstar-154");
		expect(
			resolveCard(
				idx,
				"sword-shield",
				"brilliant-stars",
				"charizard-vstar-154",
			),
		).toBe("swsh9-154");
	});

	test("returns undefined for unknown slugs", () => {
		expect(resolveSet(idx, "nope", "nope")).toBeUndefined();
		expect(
			resolveCard(idx, "sword-shield", "brilliant-stars", "missingno"),
		).toBeUndefined();
	});
});

describe("slugify", () => {
	test("lowercases and hyphenates spaces", () => {
		expect(slugify("Sword & Shield")).toBe("sword-shield");
	});
	test("strips diacritics and punctuation", () => {
		expect(slugify("Pokémon GO!")).toBe("pokemon-go");
	});
	test("collapses repeated separators and trims", () => {
		expect(slugify("  Team   Rocket's  Return  ")).toBe("team-rockets-return");
	});
	test("keeps internal digits", () => {
		expect(slugify("Charizard VSTAR 018")).toBe("charizard-vstar-018");
	});
	test("returns empty string for all-punctuation input", () => {
		expect(slugify("—&—")).toBe("");
	});
});

describe("buildSlugIndex: non-Latin (Japanese) names fall back to ids", () => {
	// Fully-Japanese series/set/card names slugify to "" — the URL must stay
	// stable + unique via the id instead of collapsing to an empty segment.
	const jpSets: SluggableSet[] = [
		{
			id: "PMCG2",
			name: "ポケモンジャングル",
			series: "ポケットモンスターカードゲーム",
		},
		{ id: "SV1S", name: "スカーレットex", series: "スカーレット&バイオレット" },
	];
	const jpCards: CorpusCard[] = [
		{
			id: "PMCG2-1",
			name: "ピカチュウ",
			imageUrl: "",
			imageUrlSmall: "",
			supertype: "Pokémon",
			setId: "PMCG2",
			number: "1",
		},
	];
	const idx = buildSlugIndex(jpSets, jpCards);

	test("series slug falls back to the set-id serie prefix, not empty", () => {
		// PMCG2 -> serie code "pmcg"; the set slug falls back to the id.
		expect(idx.setSlugById.get("PMCG2")).toEqual({
			seriesSlug: "pmcg",
			setSlug: "pmcg2",
		});
	});

	test("a name with embedded ascii keeps that ascii (スカーレットex -> series sv)", () => {
		expect(idx.setSlugById.get("SV1S")).toEqual({
			seriesSlug: "sv",
			setSlug: "ex",
		});
	});

	test("card slug falls back to name+number, never empty", () => {
		// ピカチュウ slugifies empty; the number keeps it addressable.
		expect(idx.cardSlugById.get("PMCG2-1")).toBe("1");
	});
});
