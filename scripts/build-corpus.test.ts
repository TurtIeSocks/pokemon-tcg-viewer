import { afterEach, expect, mock, test } from "bun:test";
import {
	detailCard,
	detailVersion,
	fetchPage,
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

const apiCard = {
	id: "hgss4-1",
	name: "Aggron",
	number: "1",
	supertype: "Pokémon",
	subtypes: ["Stage 2"],
	rarity: "Rare Holo",
	types: ["Metal"],
	nationalPokedexNumbers: [306],
	set: { id: "hgss4", name: "HS—Triumphant", series: "HeartGold & SoulSilver" },
	images: {
		small: "https://images.pokemontcg.io/hgss4/1.png",
		large: "https://images.pokemontcg.io/hgss4/1_hires.png",
	},
	tcgplayer: { prices: { holofoil: {}, reverseHolofoil: {} } },
};

test("trimCard keeps only corpus fields and derives variants", () => {
	expect(trimCard(apiCard)).toEqual({
		id: "hgss4-1",
		name: "Aggron",
		imageUrl: "https://images.pokemontcg.io/hgss4/1_hires.png",
		imageUrlSmall: "https://images.pokemontcg.io/hgss4/1.png",
		rarity: "Rare Holo",
		subtypes: ["Stage 2"],
		supertype: "Pokémon",
		types: ["Metal"],
		setId: "hgss4",
		number: "1",
		nationalPokedexNumbers: [306],
		variants: ["holofoil", "reverseHolofoil"],
	});
});

test("trimCard omits variants when tcgplayer prices are absent", () => {
	const c = trimCard({ ...apiCard, tcgplayer: undefined });
	expect(c.variants).toBeUndefined();
});

const realFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = realFetch;
});

test("fetchPage retries a transient non-OK status, then succeeds", async () => {
	let n = 0;
	globalThis.fetch = mock(async () => {
		n += 1;
		return n < 3
			? new Response("nope", { status: 404 })
			: new Response(JSON.stringify({ data: [], totalCount: 0 }), {
					status: 200,
				});
	}) as unknown as typeof fetch;
	const r = await fetchPage("key", 1, { baseMs: 0 });
	expect(r.totalCount).toBe(0);
	expect(n).toBe(3);
});

test("fetchPage throws after exhausting retries", async () => {
	globalThis.fetch = mock(
		async () => new Response("x", { status: 503 }),
	) as unknown as typeof fetch;
	await expect(fetchPage("key", 7, { retries: 2, baseMs: 0 })).rejects.toThrow(
		/page 7 failed/,
	);
});

test("fetchPage fails fast on an auth error (no retry)", async () => {
	let n = 0;
	globalThis.fetch = mock(async () => {
		n += 1;
		return new Response("forbidden", { status: 403 });
	}) as unknown as typeof fetch;
	await expect(fetchPage("key", 1, { baseMs: 0 })).rejects.toThrow();
	expect(n).toBe(1);
});

const detailApiCard = {
	id: "base1-4",
	name: "Charizard",
	number: "4",
	images: { small: "s.png", large: "l.png" },
	rarity: "Rare Holo",
	subtypes: ["Stage 2"],
	supertype: "Pokémon",
	types: ["Fire"],
	set: { id: "base1" },
	nationalPokedexNumbers: [6],
	tcgplayer: { prices: { holofoil: { market: 100 } } },
	hp: "120",
	evolvesFrom: "Charmeleon",
	abilities: [{ name: "Energy Burn", text: "...", type: "Pokémon Power" }],
	attacks: [
		{
			name: "Fire Spin",
			cost: ["Fire", "Fire"],
			convertedEnergyCost: 2,
			damage: "100",
			text: "Discard 2 Energy.",
		},
	],
	rules: ["VMAX rule"],
	weaknesses: [{ type: "Water", value: "×2" }],
	resistances: [{ type: "Fighting", value: "-30" }],
	retreatCost: ["Colorless", "Colorless", "Colorless"],
	flavorText: "Spits fire hot enough to melt boulders.",
	artist: "Mitsuhiro Arita",
};

test("detailCard keeps battle/flavor fields and drops prices", () => {
	const d = detailCard(detailApiCard);
	expect(d.id).toBe("base1-4");
	expect(d.hp).toBe("120");
	expect(d.attacks?.[0]).toEqual({
		name: "Fire Spin",
		cost: ["Fire", "Fire"],
		damage: "100",
		text: "Discard 2 Energy.",
	});
	expect(d.flavorText).toContain("boulders");
	expect(d.artist).toBe("Mitsuhiro Arita");
	// No prices and no convertedEnergyCost leak in.
	expect(JSON.stringify(d)).not.toContain("market");
	expect(JSON.stringify(d)).not.toContain("convertedEnergyCost");
});

test("detailVersion is deterministic and content-addressed", () => {
	const a = [detailCard(detailApiCard)];
	const b = [detailCard({ ...detailApiCard })];
	expect(detailVersion(a)).toBe(detailVersion(b)); // same data, same hash
	const changed = [detailCard({ ...detailApiCard, flavorText: "Different." })];
	expect(detailVersion(changed)).not.toBe(detailVersion(a)); // real change flips it
	expect(detailVersion(a)).toMatch(/^[0-9a-f]{64}$/); // sha256 hex
});

test("trimCard still excludes battle fields", () => {
	expect(JSON.stringify(trimCard(detailApiCard))).not.toContain("Fire Spin");
});
