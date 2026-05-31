import { afterEach, expect, mock, test } from "bun:test";
import { fetchPage, trimCard } from "./build-corpus";

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
