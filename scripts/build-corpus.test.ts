import { expect, test } from "bun:test";
import {
	assetPrefixFor,
	baseUrlFor,
	buildCorpus,
	collectGaps,
	detailCard,
	detailVersion,
	resolveFallbackImages,
	type TcgdexCard,
	trimCard,
} from "./build-corpus";

const withImage: TcgdexCard = {
	id: "swsh3-136",
	localId: "136",
	name: "Furret",
	category: "Pokemon",
	image: "https://assets.tcgdex.net/en/swsh/swsh3/136",
	rarity: "Uncommon",
	set: { id: "swsh3" },
	dexId: [162],
	types: ["Colorless"],
	stage: "Stage1",
	variants: {
		firstEdition: false,
		holo: false,
		normal: true,
		reverse: true,
		wPromo: false,
	},
};

const noImage: TcgdexCard = {
	id: "sm3.5-1",
	localId: "1",
	name: "Articuno",
	category: "Pokemon",
	set: { id: "sm3.5" },
	variants: { normal: true },
};

test("trimCard maps a TCGdex card with an image", () => {
	const c = trimCard(withImage);
	expect(c.id).toBe("swsh3-136");
	expect(c.name).toBe("Furret");
	expect(c.setId).toBe("swsh3");
	expect(c.number).toBe("136");
	expect(c.imageBase).toBe("swsh/swsh3/136");
	expect(c.imageUrl).toBe(
		"https://assets.tcgdex.net/en/swsh/swsh3/136/high.webp",
	);
	expect(c.imageUrlSmall).toBe(
		"https://assets.tcgdex.net/en/swsh/swsh3/136/low.webp",
	);
	expect(c.supertype).toBe("Pokémon");
	expect(c.variants).toEqual(["normal", "reverse"]);
	expect(c.nationalPokedexNumbers).toEqual([162]);
});

test("trimCard falls back to pokemontcg.io image when TCGdex has none", () => {
	const c = trimCard(noImage);
	expect(c.imageBase).toBeNull();
	// sm3.5 -> ptcg sm35 (reverse table), localId 1
	expect(c.imageUrl).toBe("https://images.pokemontcg.io/sm35/1_hires.png");
	expect(c.imageUrlSmall).toBe("https://images.pokemontcg.io/sm35/1.png");
});

test("trimCard applies a pokemontcg.io override when one exists for the card", () => {
	// cel25-4A (Celebrations Classic Collection Charizard) is imageless in TCGdex;
	// the crosswalk can't construct its URL (subset set cel25 -> cel25c, number "4A"
	// -> "4_A"), so an override pins the real CDN URL. The small URL is derived from it.
	const c = trimCard({
		id: "cel25-4A",
		localId: "4A",
		name: "Charizard",
		category: "Pokemon",
		set: { id: "cel25" },
	} as TcgdexCard);
	expect(c.imageBase).toBeNull();
	expect(c.imageUrl).toBe("https://images.pokemontcg.io/cel25c/4_A_hires.png");
	expect(c.imageUrlSmall).toBe("https://images.pokemontcg.io/cel25c/4_A.png");
});

test("trimCard constructs the correct fallback URL for a dashed TCGdex set id", () => {
	// tk-ex-latia is a dashed TCGdex set id with no override entry; the crosswalk
	// fix (split at last dash) resolves it to ptcg set tk1a, localId 1.
	const c = trimCard({
		id: "tk-ex-latia-1",
		localId: "1",
		name: "Latias ex",
		category: "Pokemon",
		set: { id: "tk-ex-latia" },
	} as TcgdexCard);
	expect(c.imageBase).toBeNull();
	expect(c.imageUrl).toBe("https://images.pokemontcg.io/tk1a/1_hires.png");
	expect(c.imageUrlSmall).toBe("https://images.pokemontcg.io/tk1a/1.png");
});

test("resolveFallbackImages blanks a dead fallback URL and records a gap", async () => {
	const cards = [
		// pokemontcg.io fallback — HEAD probe returns 404, so it must be blanked.
		trimCard({
			id: "sm3.5-1",
			localId: "1",
			name: "Articuno",
			category: "Pokemon",
			set: { id: "sm3.5" },
		} as TcgdexCard),
		// TCGdex-hosted image — never probed, always kept.
		trimCard({
			id: "swsh3-136",
			localId: "136",
			name: "Furret",
			category: "Pokemon",
			image: "https://assets.tcgdex.net/en/swsh/swsh3/136",
			set: { id: "swsh3" },
		} as TcgdexCard),
	];
	const probed: string[] = [];
	const gaps = await resolveFallbackImages(cards, async (url) => {
		probed.push(url);
		return new Response(null, { status: 404 });
	});
	// Only the pokemontcg.io card was probed.
	expect(probed).toEqual(["https://images.pokemontcg.io/sm35/1_hires.png"]);
	const dead = cards.find((c) => c.id === "sm3.5-1");
	expect(dead?.imageUrl).toBe("");
	expect(dead?.imageUrlSmall).toBe("");
	expect(gaps).toEqual([{ id: "sm3.5-1", reason: "no-fallback" }]);
	// The TCGdex-hosted card is untouched.
	const kept = cards.find((c) => c.id === "swsh3-136");
	expect(kept?.imageUrl).toBe(
		"https://assets.tcgdex.net/en/swsh/swsh3/136/high.webp",
	);
});

test("resolveFallbackImages restores the TCGdex image when a HIT card's pokemontcg.io url is dead", async () => {
	// Simulate a crosswalk HIT: TCGdex had an image (imageBase set), but the merge
	// preferred the pokemontcg.io url for the EN base. That ptcg url HEAD-probes dead.
	const card = trimCard({
		id: "swsh3-136",
		localId: "136",
		name: "Furret",
		category: "Pokemon",
		image: "https://assets.tcgdex.net/en/swsh/swsh3/136",
		set: { id: "swsh3" },
	} as TcgdexCard);
	// merge overwrite: prefer pokemontcg.io for EN, keep imageBase for non-EN.
	card.imageUrl = "https://images.pokemontcg.io/swsh3/136_hires.png";
	card.imageUrlSmall = "https://images.pokemontcg.io/swsh3/136.png";
	const gaps = await resolveFallbackImages(
		[card],
		async () => new Response(null, { status: 404 }),
	);
	// Dead ptcg url → TCGdex image restored from imageBase, NOT blanked, and no gap.
	expect(card.imageUrl).toBe(
		"https://assets.tcgdex.net/en/swsh/swsh3/136/high.webp",
	);
	expect(card.imageUrlSmall).toBe(
		"https://assets.tcgdex.net/en/swsh/swsh3/136/low.webp",
	);
	expect(gaps).toEqual([]);
});

test("resolveFallbackImages keeps a live fallback URL (HEAD 200, no gap)", async () => {
	const cards = [
		trimCard({
			id: "sm3.5-1",
			localId: "1",
			name: "Articuno",
			category: "Pokemon",
			set: { id: "sm3.5" },
		} as TcgdexCard),
	];
	const gaps = await resolveFallbackImages(cards, async () => {
		return new Response(null, { status: 200 });
	});
	expect(cards[0].imageUrl).toBe(
		"https://images.pokemontcg.io/sm35/1_hires.png",
	);
	expect(cards[0].imageUrlSmall).toBe(
		"https://images.pokemontcg.io/sm35/1.png",
	);
	expect(gaps).toEqual([]);
});

test("detailCard keeps battle/flavor, drops image/prices", () => {
	const d = detailCard({
		id: "swsh3-136",
		localId: "136",
		name: "Furret",
		category: "Pokemon",
		set: { id: "swsh3" },
		hp: "110",
		abilities: [{ name: "Feelin' Fine", effect: "…", type: "Ability" }],
		attacks: [
			{ name: "Find a Friend", cost: ["Colorless"], damage: "", effect: "…" },
		],
		illustrator: "Mitsuhiro Arita",
	} as never);
	expect(d.id).toBe("swsh3-136");
	expect(d.hp).toBe("110");
	expect(d.artist).toBe("Mitsuhiro Arita");
	expect(d.attacks?.[0].name).toBe("Find a Friend");
});

test("detailCard maps evolveFrom → evolvesFrom and retreat → retreatCost array", () => {
	const d = detailCard({
		id: "base1-4",
		localId: "4",
		name: "Charizard",
		category: "Pokemon",
		set: { id: "base1" },
		hp: "120",
		evolveFrom: "Charmeleon",
		retreat: 3,
		description: "Spits fire hot enough to melt boulders.",
		weaknesses: [{ type: "Water", value: "×2" }],
		resistances: [{ type: "Fighting", value: "-30" }],
	} as never);
	expect(d.evolvesFrom).toBe("Charmeleon");
	expect(d.retreatCost).toEqual(["Colorless", "Colorless", "Colorless"]);
	expect(d.flavorText).toContain("boulders");
	expect(d.weaknesses).toEqual([{ type: "Water", value: "×2" }]);
});

test("collectGaps records cards whose TCGdex image is absent", () => {
	const gaps = collectGaps([
		{
			id: "swsh3-136",
			localId: "136",
			name: "F",
			category: "Pokemon",
			set: { id: "swsh3" },
			image: "https://assets.tcgdex.net/en/swsh/swsh3/136",
		},
		{
			id: "sm3.5-1",
			localId: "1",
			name: "A",
			category: "Pokemon",
			set: { id: "sm3.5" },
		},
	]);
	expect(gaps.images).toEqual([{ id: "sm3.5-1", reason: "tcgdex-missing" }]);
});

test("collectGaps returns empty when all cards have images", () => {
	const gaps = collectGaps([
		{
			id: "swsh3-136",
			localId: "136",
			name: "F",
			category: "Pokemon",
			set: { id: "swsh3" },
			image: "https://assets.tcgdex.net/en/swsh/swsh3/136",
		},
	]);
	expect(gaps.images).toEqual([]);
});

test("detailCard coerces numeric hp and attack damage to strings", () => {
	// The TCGdex API returns hp and damage as numbers; our types say string.
	// detailCard must coerce them at the boundary so the corpus never stores numbers.
	const d = detailCard({
		id: "swsh3-136",
		localId: "136",
		name: "Furret",
		category: "Pokemon",
		set: { id: "swsh3" },
		hp: 110 as unknown as string, // API returns number
		attacks: [
			{
				name: "Slam",
				cost: ["Colorless"],
				damage: 40 as unknown as string, // API returns number
			},
		],
	});
	expect(d.hp).toBe("110");
	expect(typeof d.hp).toBe("string");
	expect(d.attacks?.[0].damage).toBe("40");
	expect(typeof d.attacks?.[0].damage).toBe("string");
});

test("detailVersion is deterministic and content-addressed", () => {
	const base = {
		id: "base1-4",
		localId: "4",
		name: "Charizard",
		category: "Pokemon" as const,
		set: { id: "base1" },
		hp: "120",
		illustrator: "Mitsuhiro Arita",
		description: "Spits fire.",
	};
	const a = [detailCard(base as never)];
	const b = [detailCard({ ...base } as never)];
	expect(detailVersion(a)).toBe(detailVersion(b)); // same data, same hash
	const changed = [detailCard({ ...base, description: "Different." } as never)];
	expect(detailVersion(changed)).not.toBe(detailVersion(a)); // real change flips it
	expect(detailVersion(a)).toMatch(/^[0-9a-f]{64}$/); // sha256 hex
});

test("baseUrlFor defaults to the English endpoint", () => {
	expect(baseUrlFor("en")).toBe("https://api.tcgdex.net/v2/en");
	expect(baseUrlFor("en")).toMatch(/\/v2\/en$/);
});

test("baseUrlFor derives the region endpoint for a non-English base lang", () => {
	expect(baseUrlFor("ja")).toBe("https://api.tcgdex.net/v2/ja");
	expect(baseUrlFor("ja")).toMatch(/\/v2\/ja$/);
});

test("assetPrefixFor follows the base lang", () => {
	expect(assetPrefixFor("en")).toBe("https://assets.tcgdex.net/en/");
	expect(assetPrefixFor("ja")).toBe("https://assets.tcgdex.net/ja/");
});

test("buildCorpus with baseLang 'ja' hits the /v2/ja sets endpoint", async () => {
	const requested: string[] = [];
	const original = globalThis.fetch;
	globalThis.fetch = (async (input: string | URL) => {
		const url = String(input);
		requested.push(url);
		if (url.endsWith("/sets")) {
			return new Response(
				JSON.stringify([{ id: "s1", cardCount: { total: 1 } }]),
				{ status: 200 },
			);
		}
		if (url.endsWith("/sets/s1")) {
			return new Response(
				JSON.stringify({
					cards: [{ id: "s1-1", localId: "1", name: "Card" }],
				}),
				{ status: 200 },
			);
		}
		if (url.endsWith("/cards/s1-1")) {
			return new Response(
				JSON.stringify({
					id: "s1-1",
					localId: "1",
					name: "Card",
					category: "Pokemon",
				}),
				{ status: 200 },
			);
		}
		throw new Error(`unexpected url ${url}`);
	}) as typeof fetch;
	try {
		const cards = await buildCorpus({ baseLang: "ja" });
		expect(cards).toHaveLength(1);
		expect(cards[0].id).toBe("s1-1");
	} finally {
		globalThis.fetch = original;
	}
	expect(requested.some((u) => u === "https://api.tcgdex.net/v2/ja/sets")).toBe(
		true,
	);
	expect(
		requested.some((u) => u === "https://api.tcgdex.net/v2/ja/sets/s1"),
	).toBe(true);
	expect(
		requested.some((u) => u === "https://api.tcgdex.net/v2/ja/cards/s1-1"),
	).toBe(true);
});

test("buildCorpus throws the build-validation gate when the mirror returns too few cards", async () => {
	// Sets declare 100 cards total but the mirror serves an empty set.cards[]
	// for all of them — the real risk on JA mirrors. Must throw loudly instead
	// of silently writing a near-empty corpus.
	const original = globalThis.fetch;
	globalThis.fetch = (async (input: string | URL) => {
		const url = String(input);
		if (url.endsWith("/sets")) {
			return new Response(
				JSON.stringify([{ id: "s1", cardCount: { total: 100 } }]),
				{ status: 200 },
			);
		}
		if (url.endsWith("/sets/s1")) {
			return new Response(JSON.stringify({ cards: [] }), { status: 200 });
		}
		throw new Error(`unexpected url ${url}`);
	}) as typeof fetch;
	try {
		await expect(buildCorpus({ baseLang: "ja" })).rejects.toThrow(
			/catastrophically short/,
		);
	} finally {
		globalThis.fetch = original;
	}
});

test("buildCorpus proceeds on a merely-partial crawl (JP sets that list no cards)", async () => {
	// One set fully served, one declaring 50 cards it lists none of — the real JP
	// pattern. 50 of 100 expected is partial, not catastrophic: it must BUILD
	// (returning the served cards), not throw.
	const original = globalThis.fetch;
	globalThis.fetch = (async (input: string | URL) => {
		const url = String(input);
		if (url.endsWith("/sets")) {
			return new Response(
				JSON.stringify([
					{ id: "full", cardCount: { total: 50 } },
					{ id: "empty", cardCount: { total: 50 } },
				]),
				{ status: 200 },
			);
		}
		if (url.endsWith("/sets/full")) {
			return new Response(
				JSON.stringify({
					cards: Array.from({ length: 50 }, (_, i) => ({
						id: `full-${i}`,
						localId: String(i),
						name: `C${i}`,
						image: "",
					})),
				}),
				{ status: 200 },
			);
		}
		if (url.endsWith("/sets/empty")) {
			return new Response(JSON.stringify({ cards: [] }), { status: 200 });
		}
		if (url.includes("/cards/")) {
			const id = url.split("/cards/")[1];
			return new Response(
				JSON.stringify({ id, localId: "1", name: "C", category: "Pokemon" }),
				{ status: 200 },
			);
		}
		throw new Error(`unexpected url ${url}`);
	}) as typeof fetch;
	try {
		const cards = await buildCorpus({ baseLang: "ja" });
		expect(cards.length).toBe(50);
	} finally {
		globalThis.fetch = original;
	}
});
