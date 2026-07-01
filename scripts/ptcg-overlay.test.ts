import { expect, test } from "bun:test";
import { fetchPtcgOverlay } from "./ptcg-overlay";

// A fake fetch that pages: page 1 returns a full page (250) so the loop continues,
// page 2 returns a short page so the loop stops.
function fakeFetch(pages: Record<number, unknown[]>): typeof fetch {
	return (async (url: string | URL) => {
		const page = Number(new URL(url).searchParams.get("page"));
		return {
			ok: true,
			json: async () => ({ data: pages[page] ?? [] }),
		} as Response;
	}) as unknown as typeof fetch;
}

test("fetchPtcgOverlay pages until a short page and keys by id", async () => {
	const full = Array.from({ length: 250 }, (_, i) => ({ id: `swsh1-${i}` }));
	const overlay = await fetchPtcgOverlay({
		fetchImpl: fakeFetch({
			1: full,
			2: [{ id: "base1-4", rarity: "Rare Holo", subtypes: ["Stage 2"] }],
		}),
	});
	expect(overlay.size).toBe(251);
	expect(overlay.get("base1-4")).toEqual({
		rarity: "Rare Holo",
		subtypes: ["Stage 2"],
	});
});

test("fetchPtcgOverlay retries a failing page then succeeds", async () => {
	let calls = 0;
	const fetchImpl = (async () => {
		calls++;
		if (calls === 1) return { ok: false, status: 503 } as Response;
		return { ok: true, json: async () => ({ data: [] }) } as Response;
	}) as unknown as typeof fetch;
	const overlay = await fetchPtcgOverlay({ fetchImpl });
	expect(calls).toBe(2);
	expect(overlay.size).toBe(0);
});

// A fake fetch where a page can be a data array OR "throw" (a network error,
// which fetchPage propagates immediately — no retry/backoff, so the test is fast).
function pagingFetch(spec: Record<number, unknown[] | "throw">): typeof fetch {
	return (async (url: string | URL) => {
		const page = Number(new URL(url).searchParams.get("page"));
		const v = spec[page];
		if (v === "throw") throw new Error(`page ${page} boom`);
		return { ok: true, json: async () => ({ data: v ?? [] }) } as Response;
	}) as unknown as typeof fetch;
}

test("fetchPtcgOverlay skips a failing page and keeps the rest (partial, not zero)", async () => {
	const full = Array.from({ length: 250 }, (_, i) => ({ id: `swsh1-${i}` }));
	const overlay = await fetchPtcgOverlay({
		fetchImpl: pagingFetch({
			1: full, // full → continue
			2: "throw", // fails → skip, MUST keep page 1
			3: [{ id: "base1-4", rarity: "Rare Holo" }], // short → stop
		}),
	});
	// The page-2 failure must NOT discard page 1 (the old all-or-nothing bug).
	expect(overlay.size).toBe(251);
	expect(overlay.get("swsh1-0")).toEqual({});
	expect(overlay.get("base1-4")).toEqual({ rarity: "Rare Holo" });
});

test("fetchPtcgOverlay bails after too many consecutive failures, returning partial", async () => {
	const full = Array.from({ length: 250 }, (_, i) => ({ id: `p-${i}` }));
	// Page 1 succeeds, then 5 pages fail in a row → bail (don't hang), keep page 1.
	const overlay = await fetchPtcgOverlay({
		fetchImpl: pagingFetch({
			1: full,
			2: "throw",
			3: "throw",
			4: "throw",
			5: "throw",
			6: "throw",
		}),
	});
	expect(overlay.size).toBe(250);
});

test("fetchPtcgOverlay omits undefined optional fields", async () => {
	const full = Array.from({ length: 250 }, (_, i) => ({ id: `swsh1-${i}` }));
	const overlay = await fetchPtcgOverlay({
		fetchImpl: fakeFetch({
			1: full,
			2: [],
		}),
	});
	expect(overlay.get("swsh1-0")).toEqual({});
});
