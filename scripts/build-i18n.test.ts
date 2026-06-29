import { expect, test } from "bun:test";
import {
	buildI18n,
	type FetchJson,
	type I18nEntry,
	i18nVersion,
	langBase,
} from "./build-i18n";

// A mock fetcher backed by an in-memory set tree. NO network: every url must be
// served from `tree` or it throws, so a missing route fails loudly in the test.
interface MockSet {
	id: string;
	total: number;
	cards: { id: string; name?: string }[];
}

function mockFetcher(sets: MockSet[]): FetchJson {
	return async (url: string) => {
		if (url.endsWith("/sets"))
			return sets.map((s) => ({ id: s.id, cardCount: { total: s.total } }));
		const m = url.match(/\/sets\/([^/]+)$/);
		if (m) {
			const set = sets.find((s) => s.id === m[1]);
			if (!set) throw new Error(`unknown set ${m[1]}`);
			return { cards: set.cards };
		}
		throw new Error(`unexpected url ${url}`);
	};
}

const FR_SETS: MockSet[] = [
	{
		id: "swsh3",
		total: 2,
		// Deliberately out of id order so the sort is observable.
		cards: [
			{ id: "swsh3-136", name: "Linéon" },
			{ id: "swsh3-1", name: "Cizayox" },
		],
	},
	{
		id: "base1",
		total: 1,
		cards: [{ id: "base1-4", name: "Dracaufeu" }],
	},
];

const opts = (sets: MockSet[]) => ({
	fetchJson: mockFetcher(sets),
	base: "https://api.tcgdex.net/v2/en",
	onRetry: () => {},
	log: () => {},
});

test("langBase swaps the trailing /en for the language", () => {
	expect(langBase("fr", "http://localhost:3000/v2/en")).toBe(
		"http://localhost:3000/v2/fr",
	);
	expect(langBase("de", "https://api.tcgdex.net/v2/en")).toBe(
		"https://api.tcgdex.net/v2/de",
	);
	// A host with "/en/" mid-path is untouched — only the trailing segment swaps.
	expect(langBase("es", "https://mirror.test/en/v2/en")).toBe(
		"https://mirror.test/en/v2/es",
	);
});

test("buildI18n returns entries sorted by id", async () => {
	const { entries } = await buildI18n("fr", opts(FR_SETS));
	expect(entries.map((e) => e.id)).toEqual(["base1-4", "swsh3-1", "swsh3-136"]);
	// Names ride along with their ids through the sort.
	expect(entries.find((e) => e.id === "base1-4")?.name).toBe("Dracaufeu");
	expect(entries.find((e) => e.id === "swsh3-1")?.name).toBe("Cizayox");
});

test("buildI18n version matches i18nVersion of the sorted entries", async () => {
	const { entries, version } = await buildI18n("fr", opts(FR_SETS));
	expect(version).toBe(i18nVersion(entries));
	expect(version).toMatch(/^[0-9a-f]{64}$/);
});

test("i18nVersion is deterministic and content-addressed", () => {
	const a: I18nEntry[] = [
		{ id: "base1-4", name: "Dracaufeu" },
		{ id: "swsh3-1", name: "Cizayox" },
	];
	// Same data, different input order → same hash (sort is canonical).
	const b: I18nEntry[] = [
		{ id: "swsh3-1", name: "Cizayox" },
		{ id: "base1-4", name: "Dracaufeu" },
	];
	expect(i18nVersion(a)).toBe(i18nVersion(b));
	// A real name change flips the hash.
	const changed: I18nEntry[] = [
		{ id: "base1-4", name: "Charizard" },
		{ id: "swsh3-1", name: "Cizayox" },
	];
	expect(i18nVersion(changed)).not.toBe(i18nVersion(a));
});

test("buildI18n is deterministic: same input crawls to the same version", async () => {
	const v1 = (await buildI18n("fr", opts(FR_SETS))).version;
	const v2 = (await buildI18n("fr", opts(FR_SETS))).version;
	expect(v1).toBe(v2);
});

test("buildI18n entry count and version reflect the crawled names (meta-ready)", async () => {
	const { entries, version } = await buildI18n("fr", opts(FR_SETS));
	// `count` written into meta.json is entries.length; assert it equals the
	// total cards across the mock sets.
	const totalCards = FR_SETS.reduce((n, s) => n + s.cards.length, 0);
	expect(entries.length).toBe(totalCards);
	expect(version).toBe(i18nVersion(entries));
});

test("buildI18n throws only when the crawl is catastrophically broken (<40%)", async () => {
	// Set declares 100 cards but only serves 1 (1% << 40%) => a broken crawl.
	const thin: MockSet[] = [
		{ id: "swsh3", total: 100, cards: [{ id: "swsh3-1", name: "Cizayox" }] },
	];
	await expect(buildI18n("fr", opts(thin))).rejects.toThrow(/looks broken/);
});

test("buildI18n tolerates partial language coverage (untranslated cards skipped)", async () => {
	// A Western overlay legitimately covers a subset; 60% coverage must NOT throw —
	// untranslated cards fall back to the EN name in hydrateCard.
	const partial: MockSet[] = [
		{
			id: "swsh3",
			total: 10,
			cards: Array.from({ length: 6 }, (_, i) => ({
				id: `swsh3-${i + 1}`,
				name: `Carte ${i + 1}`,
			})),
		},
	];
	const { entries } = await buildI18n("fr", opts(partial));
	expect(entries).toHaveLength(6);
});

test("buildI18n tolerates a missing name (defaults to empty string)", async () => {
	const sets: MockSet[] = [
		{ id: "p", total: 1, cards: [{ id: "p-1" }] }, // no `name`
	];
	const { entries } = await buildI18n("de", opts(sets));
	expect(entries).toEqual([{ id: "p-1", name: "" }]);
});
