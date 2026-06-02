import { afterEach, expect, mock, test } from "bun:test";
import { getCardByIdCached } from "./card-data-fetch";
import type { PokemonApiFocusCard } from "./card-mappers";

const realFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = realFetch;
});

function apiCard(id: string): PokemonApiFocusCard {
	return {
		id,
		name: "Charizard",
		number: "4",
		supertype: "Pokémon",
		images: { large: "large.png", small: "small.png" },
		set: { id: "base1", name: "Base", series: "Base" },
	} as PokemonApiFocusCard;
}

function okOnce(id: string) {
	return mock(
		async () =>
			new Response(JSON.stringify({ data: apiCard(id) }), { status: 200 }),
	);
}

test("getCardByIdCached fetches an id only once across repeated calls", async () => {
	const f = okOnce("base1-4");
	globalThis.fetch = f as unknown as typeof fetch;

	const a = await getCardByIdCached("base1-4");
	const b = await getCardByIdCached("base1-4");

	expect(a.id).toBe("base1-4");
	expect(b).toBe(a); // same memoized object
	expect(f).toHaveBeenCalledTimes(1);
});

test("getCardByIdCached evicts a failed fetch so the next call retries", async () => {
	let calls = 0;
	const f = mock(async () => {
		calls++;
		return calls === 1
			? new Response("boom", { status: 500 })
			: new Response(JSON.stringify({ data: apiCard("xy1-7") }), {
					status: 200,
				});
	});
	globalThis.fetch = f as unknown as typeof fetch;

	await expect(getCardByIdCached("xy1-7")).rejects.toThrow();
	const card = await getCardByIdCached("xy1-7");

	expect(card.id).toBe("xy1-7");
	expect(f).toHaveBeenCalledTimes(2);
});
