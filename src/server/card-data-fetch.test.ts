import { afterEach, expect, mock, test } from "bun:test";
import {
	getCardByIdCached,
	mapTcgdexSet,
	type TcgdexSetDetail,
} from "./card-data-fetch";
import { mapTcgdexFocusCard, type TcgdexFocusCard } from "./card-mappers";

test("mapTcgdexFocusCard keeps the language-invariant imageBase tail", () => {
	const out = mapTcgdexFocusCard({
		id: "base1-4",
		localId: "4",
		name: "Charizard",
		category: "Pokemon",
		image: "https://assets.tcgdex.net/en/base/base1/4",
		set: { id: "base1", name: "Base" },
	} as TcgdexFocusCard);
	// host + lang prefix stripped so the detail view can derive a localized image.
	expect(out.imageBase).toBe("base/base1/4");
	expect(out.imageUrl).toBe(
		"https://assets.tcgdex.net/en/base/base1/4/high.webp",
	);
});

test("mapTcgdexFocusCard imageBase is null when TCGdex has no image", () => {
	const out = mapTcgdexFocusCard({
		id: "tk-bw-e-1",
		localId: "1",
		name: "Excadrill",
		category: "Pokemon",
		set: { id: "tk-bw-e", name: "BW Trainer Kit" },
	} as TcgdexFocusCard);
	expect(out.imageBase).toBeNull();
});

test("mapTcgdexSet maps to PokemonSet with TCGdex id + serie name", () => {
	const s: TcgdexSetDetail = {
		id: "swsh3",
		name: "Darkness Ablaze",
		releaseDate: "2020-08-14",
		cardCount: { total: 201, official: 189 },
		serie: { id: "swsh", name: "Sword & Shield" },
		logo: "https://assets.tcgdex.net/en/swsh/swsh3/logo",
		symbol: "https://assets.tcgdex.net/univ/swsh/swsh3/symbol",
	};
	expect(mapTcgdexSet(s)).toEqual({
		id: "swsh3",
		name: "Darkness Ablaze",
		series: "Sword & Shield",
		releaseDate: "2020-08-14",
		printedTotal: 189,
		total: 201,
		images: {
			logo: "https://assets.tcgdex.net/en/swsh/swsh3/logo.png",
			symbol: "https://assets.tcgdex.net/univ/swsh/swsh3/symbol.png",
		},
	});
});

test("mapTcgdexSet leaves logo/symbol undefined when absent (no empty-string src)", () => {
	const s: TcgdexSetDetail = {
		id: "2024sv",
		name: "McDonald's Collection 2024",
		releaseDate: "2024-01-01",
		cardCount: { total: 15, official: 15 },
		serie: { id: "mc", name: "McDonald's Collection" },
		// no logo / symbol — 53/41 real TCGdex sets are like this
	};
	const out = mapTcgdexSet(s);
	expect(out.images.logo).toBeUndefined();
	expect(out.images.symbol).toBeUndefined();
});

const realFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = realFetch;
});

function apiCard(id: string): TcgdexFocusCard {
	return {
		id,
		localId: "4",
		name: "Charizard",
		category: "Pokemon",
		set: { id: "base1", name: "Base" },
	} as TcgdexFocusCard;
}

function okOnce(id: string) {
	return mock(
		async () => new Response(JSON.stringify(apiCard(id)), { status: 200 }),
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
			: new Response(JSON.stringify(apiCard("xy1-7")), {
					status: 200,
				});
	});
	globalThis.fetch = f as unknown as typeof fetch;

	await expect(getCardByIdCached("xy1-7")).rejects.toThrow();
	const card = await getCardByIdCached("xy1-7");

	expect(card.id).toBe("xy1-7");
	expect(f).toHaveBeenCalledTimes(2);
});
