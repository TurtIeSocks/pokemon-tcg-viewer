import { expect, test } from "bun:test";
import {
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
