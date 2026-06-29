import { expect, test } from "bun:test";
import {
	collectGaps,
	detailCard,
	detailVersion,
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
