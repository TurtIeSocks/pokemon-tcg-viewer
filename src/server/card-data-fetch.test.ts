import { afterEach, expect, mock, test } from "bun:test";
import {
	fetchAllSets,
	fetchCardById,
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

test("mapTcgdexFocusCard falls back to the pokemontcg.io image when TCGdex has none", () => {
	// Imageless card: detail must show the same pokemontcg.io fallback the corpus
	// build bakes for the grid, not the empty-string identity card.
	const out = mapTcgdexFocusCard({
		id: "tk-bw-e-1",
		localId: "1",
		name: "Excadrill",
		category: "Pokemon",
		set: { id: "tk-bw-e", name: "BW Trainer Kit" },
	} as TcgdexFocusCard);
	expect(out.imageUrl).toBe("https://images.pokemontcg.io/tk-bw-e/1_hires.png");
	// imageBase null → cardImage() returns this URL verbatim for every language.
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
		seriesId: "swsh",
		releaseDate: "2020-08-14",
		printedTotal: 189,
		total: 201,
		images: {
			logo: "https://assets.tcgdex.net/en/swsh/swsh3/logo.png",
			symbol: "https://assets.tcgdex.net/univ/swsh/swsh3/symbol.png",
		},
	});
});

test("mapTcgdexSet falls back to a pokemontcg.io logo/symbol url when TCGdex has none", () => {
	const s: TcgdexSetDetail = {
		id: "2024sv",
		name: "McDonald's Collection 2024",
		releaseDate: "2024-01-01",
		cardCount: { total: 15, official: 15 },
		serie: { id: "mc", name: "McDonald's Collection" },
		// no logo / symbol — 53/41 real TCGdex sets are like this. Rather than an
		// empty-string src (which would flash-reload the page), fall back to a
		// pokemontcg.io url; the set-tile onError degrades a dead one to set-name text.
	};
	const out = mapTcgdexSet(s);
	expect(out.images.logo).toMatch(
		/^https:\/\/images\.pokemontcg\.io\/.+\/logo\.png$/,
	);
	expect(out.images.symbol).toMatch(
		/^https:\/\/images\.pokemontcg\.io\/.+\/symbol\.png$/,
	);
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

test("fetchAllSets drops phantom sets that list zero cards", async () => {
	const detail = (
		id: string,
		name: string,
		cards: { id: string }[],
		total: number,
	) =>
		JSON.stringify({
			id,
			name,
			cardCount: { total, official: total },
			serie: { id: "base", name: "Base" },
			cards,
		});
	globalThis.fetch = mock(async (url: string | URL) => {
		const u = String(url);
		if (u.endsWith("/v2/en/sets"))
			return new Response(JSON.stringify([{ id: "base1" }, { id: "wp" }]), {
				status: 200,
			});
		if (u.endsWith("/sets/base1"))
			return new Response(detail("base1", "Base", [{ id: "base1-1" }], 1), {
				status: 200,
			});
		// wp reports cardCount 7 but lists zero cards (the real TCGdex phantom).
		return new Response(detail("wp", "W Promotional", [], 7), { status: 200 });
	}) as unknown as typeof fetch;

	const sets = await fetchAllSets();
	expect(sets.map((s) => s.id)).toEqual(["base1"]); // wp filtered out
});

test("fetchAllSets defaults to the en base language", async () => {
	const calls: string[] = [];
	globalThis.fetch = mock(async (url: string | URL) => {
		const u = String(url);
		calls.push(u);
		if (u.endsWith("/sets"))
			return new Response(JSON.stringify([]), { status: 200 });
		return new Response("[]", { status: 200 });
	}) as unknown as typeof fetch;

	await fetchAllSets();

	expect(calls).toHaveLength(1);
	expect(calls[0]).toContain("/v2/en/sets");
});

test("fetchAllSets(ja) lists and resolves sets from the ja base language", async () => {
	const calls: string[] = [];
	globalThis.fetch = mock(async (url: string | URL) => {
		const u = String(url);
		calls.push(u);
		if (u.endsWith("/v2/ja/sets"))
			return new Response(JSON.stringify([{ id: "sm1" }]), { status: 200 });
		if (u.endsWith("/v2/ja/sets/sm1"))
			return new Response(
				JSON.stringify({
					id: "sm1",
					name: "コレクション サン&ムーン",
					releaseDate: "2017-05-19",
					cardCount: { total: 100, official: 95 },
					serie: { id: "sm", name: "サン&ムーン" },
					cards: [{ id: "sm1-1" }],
				}),
				{ status: 200 },
			);
		throw new Error(`unexpected fetch: ${u}`);
	}) as unknown as typeof fetch;

	const sets = await fetchAllSets("ja");

	expect(calls).toContain(`${calls[0].split("/v2/")[0]}/v2/ja/sets`);
	expect(calls.some((c) => c.endsWith("/v2/ja/sets"))).toBe(true);
	expect(calls.some((c) => c.endsWith("/v2/ja/sets/sm1"))).toBe(true);
	expect(sets.map((s) => s.id)).toEqual(["sm1"]);
});

test("fetchCardById requests the localized locale and maps it", async () => {
	const calls: string[] = [];
	globalThis.fetch = mock(async (url: string | URL) => {
		calls.push(String(url));
		// A localized card WITH its own scan → no EN-image borrow, one fetch.
		return new Response(
			JSON.stringify({
				...apiCard("sv1-1"),
				image: "https://assets.tcgdex.net/de/sv/sv1/1",
			}),
			{ status: 200 },
		);
	}) as unknown as typeof fetch;

	await fetchCardById("sv1-1", "de");

	expect(calls).toHaveLength(1);
	expect(calls[0]).toContain("/v2/de/cards/sv1-1");
});

test("fetchCardById borrows the EN scan when a localized card has text but no image", async () => {
	const calls: string[] = [];
	globalThis.fetch = mock(async (url: string | URL) => {
		const u = String(url);
		calls.push(u);
		if (u.includes("/v2/de/")) {
			// German metadata exists (name + translated text) but carries no scan.
			return new Response(
				JSON.stringify({
					id: "base1-1",
					localId: "1",
					name: "Simsala",
					category: "Pokemon",
					set: { id: "base1", name: "Basis" },
				}),
				{ status: 200 },
			);
		}
		// EN carries the scan we borrow.
		return new Response(
			JSON.stringify({
				id: "base1-1",
				localId: "1",
				name: "Alakazam",
				category: "Pokemon",
				image: "https://assets.tcgdex.net/en/base/base1/1",
				set: { id: "base1", name: "Base" },
			}),
			{ status: 200 },
		);
	}) as unknown as typeof fetch;

	const card = await fetchCardById("base1-1", "de");

	// Localized name kept; EN scan borrowed so the image derives + falls back.
	expect(card.name).toBe("Simsala");
	expect(card.imageBase).toBe("base/base1/1");
	expect(card.imageUrl).toBe(
		"https://assets.tcgdex.net/en/base/base1/1/high.webp",
	);
	expect(calls[0]).toContain("/v2/de/cards/base1-1");
	expect(calls[1]).toContain("/v2/en/cards/base1-1");
});

test("fetchCardById falls back to English when the locale lacks the card", async () => {
	const calls: string[] = [];
	globalThis.fetch = mock(async (url: string | URL) => {
		calls.push(String(url));
		return String(url).includes("/v2/de/")
			? new Response("missing", { status: 404 })
			: new Response(JSON.stringify(apiCard("base1-4")), { status: 200 });
	}) as unknown as typeof fetch;

	const card = await fetchCardById("base1-4", "de");

	expect(card.id).toBe("base1-4");
	expect(calls[0]).toContain("/v2/de/cards/base1-4");
	expect(calls[1]).toContain("/v2/en/cards/base1-4"); // EN fallback
});

test("getCardByIdCached caches per (lang, id), not id alone", async () => {
	// Unique id so the module-level cache is cold for both locales here. Include
	// an image so the localized fetch doesn't trigger an EN-scan borrow (which
	// would add a fetch and obscure the per-lang-key count under test).
	const f = mock(
		async () =>
			new Response(
				JSON.stringify({
					...apiCard("sv5-99"),
					image: "https://assets.tcgdex.net/en/sv/sv5/99",
				}),
				{ status: 200 },
			),
	);
	globalThis.fetch = f as unknown as typeof fetch;

	await getCardByIdCached("sv5-99", "en");
	await getCardByIdCached("sv5-99", "de");

	// Different languages are distinct cache entries → two fetches, not one.
	expect(f).toHaveBeenCalledTimes(2);
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
