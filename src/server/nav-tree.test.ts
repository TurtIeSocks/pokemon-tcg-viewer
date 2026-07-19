import {
	afterEach,
	beforeEach,
	describe,
	expect,
	mock,
	spyOn,
	test,
} from "bun:test";
import type { PokemonSet } from "./card-mappers";
import {
	deriveNavTree,
	findSeries,
	findSet,
	loadNavTree,
	NAV_TREE_TTL_MS,
	resetNavTreeForTests,
} from "./nav-tree";

const sets: PokemonSet[] = [
	{
		id: "swsh9",
		name: "Brilliant Stars",
		series: "Sword & Shield",
		releaseDate: "2022/02/25",
		total: 172,
		images: { symbol: "sym1", logo: "logo1" },
	},
	{
		id: "swsh1",
		name: "Sword & Shield",
		series: "Sword & Shield",
		releaseDate: "2020/02/07",
		total: 202,
		images: { symbol: "sym2", logo: "logo2" },
	},
	{
		id: "base1",
		name: "Base",
		series: "Base",
		releaseDate: "1999/01/09",
		total: 102,
		images: { symbol: "sym3", logo: "logo3" },
	},
];

describe("deriveNavTree", () => {
	const tree = deriveNavTree(sets);

	test("groups sets under their series with slugs", () => {
		const ss = findSeries(tree, "sword-shield");
		expect(ss?.name).toBe("Sword & Shield");
		expect(ss?.sets.map((s) => s.slug).sort()).toEqual(
			["brilliant-stars", "sword-shield"].sort(),
		);
	});

	test("resolves a (seriesSlug, setSlug) pair to the set id", () => {
		expect(findSet(tree, "sword-shield", "brilliant-stars")?.id).toBe("swsh9");
		expect(findSet(tree, "base", "base")?.id).toBe("base1");
	});

	test("carries logo/symbol/total through for rendering", () => {
		const set = findSet(tree, "sword-shield", "brilliant-stars");
		expect(set?.logo).toBe("logo1");
		expect(set?.total).toBe(172);
	});

	test("series carry earliest release year", () => {
		expect(findSeries(tree, "sword-shield")?.year).toBe(2020);
	});

	test("unknown slugs resolve to undefined", () => {
		expect(findSeries(tree, "nope")).toBeUndefined();
		expect(findSet(tree, "sword-shield", "nope")).toBeUndefined();
	});

	test("tree is plain-JSON serializable (no Maps)", () => {
		expect(JSON.parse(JSON.stringify(tree))).toEqual(tree);
	});
});

const realFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = realFetch;
});

function mockSetsEndpoint(baseLang: string, setId: string, name: string) {
	return mock(async (url: string | URL) => {
		const u = String(url);
		if (u.endsWith(`/v2/${baseLang}/sets`))
			return new Response(JSON.stringify([{ id: setId }]), { status: 200 });
		if (u.endsWith(`/v2/${baseLang}/sets/${setId}`))
			return new Response(
				JSON.stringify({
					id: setId,
					name,
					releaseDate: "2020-01-01",
					cardCount: { total: 1, official: 1 },
					serie: { id: "s", name: "Series" },
					cards: [{ id: `${setId}-1` }],
				}),
				{ status: 200 },
			);
		throw new Error(`unexpected fetch: ${u}`);
	}) as unknown as typeof fetch;
}

describe("loadNavTree region memoization", () => {
	test("memoizes the nav tree per region, hitting each region's endpoint once", async () => {
		const westFetch = mockSetsEndpoint("en", "base1", "Base");
		globalThis.fetch = westFetch;
		const west1 = await loadNavTree("west");
		const west2 = await loadNavTree("west");
		expect(west1).toBe(west2); // same memoized object, west endpoint hit once
		expect(westFetch).toHaveBeenCalledTimes(2); // list + 1 set detail

		const asiaFetch = mockSetsEndpoint("ja", "sm1", "Sun & Moon (JA)");
		globalThis.fetch = asiaFetch;
		const asia1 = await loadNavTree("asia");
		const asia2 = await loadNavTree("asia");
		expect(asia1).toBe(asia2);
		expect(asiaFetch).toHaveBeenCalledTimes(2); // asia's own list + detail, cached separately

		// Region trees are distinct and reflect their own base-language data.
		expect(asia1).not.toBe(west1);
		expect(findSet(asia1, "series", "sun-moon-ja")?.id).toBe("sm1");
		expect(findSet(west1, "series", "base")?.id).toBe("base1");

		// west remains cached (not re-fetched) after asia was loaded.
		const west3 = await loadNavTree("west");
		expect(west3).toBe(west1);
		expect(westFetch).toHaveBeenCalledTimes(2);
	});
});

/** Drain the microtask/timer queue so a background refresh settles. */
async function settle() {
	for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
}

describe("loadNavTree TTL refresh", () => {
	const T0 = 1_000_000_000;
	let nowSpy: ReturnType<typeof spyOn<DateConstructor, "now">>;

	beforeEach(() => {
		resetNavTreeForTests();
		nowSpy = spyOn(Date, "now").mockReturnValue(T0);
	});
	afterEach(() => {
		nowSpy.mockRestore();
	});

	test("after the TTL the tree is refetched in the background and swapped in", async () => {
		globalThis.fetch = mockSetsEndpoint("en", "base1", "Base");
		const old = await loadNavTree("west");
		expect(findSet(old, "series", "base")?.id).toBe("base1");

		globalThis.fetch = mockSetsEndpoint("en", "me05", "Pitch Black");
		nowSpy.mockReturnValue(T0 + NAV_TREE_TTL_MS + 1);
		const stale = await loadNavTree("west");
		expect(stale).toBe(old); // stale-while-revalidate: old tree served now
		await settle();
		const fresh = await loadNavTree("west");
		expect(findSet(fresh, "series", "pitch-black")?.id).toBe("me05");
	});

	test("within the TTL no refetch happens", async () => {
		const f = mockSetsEndpoint("en", "base1", "Base");
		globalThis.fetch = f;
		await loadNavTree("west");
		nowSpy.mockReturnValue(T0 + NAV_TREE_TTL_MS - 1);
		await loadNavTree("west");
		await settle();
		expect(f).toHaveBeenCalledTimes(2); // list + detail from the initial load only
	});

	test("a failed refresh keeps serving the old tree and backs off a full TTL", async () => {
		globalThis.fetch = mockSetsEndpoint("en", "base1", "Base");
		const old = await loadNavTree("west");

		const failing = mock(async () => new Response(null, { status: 500 }));
		globalThis.fetch = failing as unknown as typeof fetch;
		nowSpy.mockReturnValue(T0 + NAV_TREE_TTL_MS + 1);
		await loadNavTree("west");
		await settle();
		const kept = await loadNavTree("west");
		await settle();
		expect(kept).toBe(old);
		expect(failing).toHaveBeenCalledTimes(1); // back-off: no hammering after failure
	});
});
