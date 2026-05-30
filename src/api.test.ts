import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { getCardsByName, getCardsBySet } from "./api";

const realFetch = globalThis.fetch;
let lastUrl = "";

function mockFetchEmpty() {
	lastUrl = "";
	globalThis.fetch = mock(async (input: RequestInfo | URL) => {
		lastUrl = String(input);
		return new Response(JSON.stringify({ data: [], totalCount: 0 }), {
			status: 200,
		});
	}) as unknown as typeof fetch;
}

function queryParam(): string {
	return new URL(lastUrl).searchParams.get("q") ?? "";
}

describe("getCardsByName", () => {
	beforeEach(mockFetchEmpty);
	afterEach(() => {
		globalThis.fetch = realFetch;
	});

	test("builds a substring name clause", async () => {
		await getCardsByName("pikachu", 1, 20);
		expect(queryParam()).toBe('name:"*pikachu*"');
	});

	test("escapes specials in the query", async () => {
		await getCardsByName('a"b', 1, 20);
		expect(queryParam()).toBe('name:"*a\\"b*"');
	});

	test("appends filter clauses with AND", async () => {
		await getCardsByName("pikachu", 1, 20, { supertype: ["Trainer"] });
		expect(queryParam()).toBe('name:"*pikachu*" AND (supertype:Trainer)');
	});

	test("requests the page/pageSize it was given", async () => {
		await getCardsByName("pikachu", 3, 50);
		const u = new URL(lastUrl);
		expect(u.searchParams.get("page")).toBe("3");
		expect(u.searchParams.get("pageSize")).toBe("50");
	});

	test("maps API cards to HoloCardData", async () => {
		globalThis.fetch = mock(
			async () =>
				new Response(
					JSON.stringify({
						data: [
							{
								id: "swsh4-43",
								name: "Pikachu V",
								supertype: "Pokémon",
								number: "43",
								set: {
									id: "swsh4",
									name: "Vivid Voltage",
									series: "Sword & Shield",
								},
								images: { small: "s.png", large: "l.png" },
							},
						],
						totalCount: 1,
					}),
					{ status: 200 },
				),
		) as unknown as typeof fetch;
		const { cards, totalCount } = await getCardsByName("pikachu", 1, 20);
		expect(totalCount).toBe(1);
		expect(cards[0]).toMatchObject({
			id: "swsh4-43",
			name: "Pikachu V",
			imageUrl: "l.png",
		});
	});
});

afterEach(() => {
	globalThis.fetch = realFetch;
});

test("getCardsBySet maps images.small → imageUrlSmall and images.large → imageUrl", async () => {
	globalThis.fetch = mock(
		async () =>
			new Response(
				JSON.stringify({
					data: [
						{
							id: "swsh4-43",
							name: "Pikachu V",
							supertype: "Pokémon",
							number: "43",
							set: {
								id: "swsh4",
								name: "Vivid Voltage",
								series: "Sword & Shield",
							},
							images: {
								small: "https://img/small.png",
								large: "https://img/large.png",
							},
						},
					],
					totalCount: 1,
				}),
				{ status: 200 },
			),
	) as unknown as typeof fetch;

	const { cards } = await getCardsBySet("swsh4", 1, 20);
	expect(cards[0].imageUrl).toBe("https://img/large.png");
	expect(cards[0].imageUrlSmall).toBe("https://img/small.png");
});

test("getSets calls the v2 sets endpoint and sends no API key header", async () => {
	const fetchMock = mock(
		async () => new Response(JSON.stringify({ data: [] }), { status: 200 }),
	);
	globalThis.fetch = fetchMock as unknown as typeof fetch;

	const { getSets } = await import("./api");
	await getSets();

	const [calledUrl, init] = fetchMock.mock.calls[0] as unknown as [
		string,
		RequestInit,
	];
	expect(calledUrl).toContain("/v2/sets");
	const headers = new Headers(init?.headers);
	expect(headers.has("X-Api-Key")).toBe(false);
});
