import { describe, expect, test } from "bun:test";
import type { HoloCardData } from "../components/holo-card";
import { rollPack } from "./roll-pack";

function fixture(id: string, rarity?: string): HoloCardData {
	return {
		id,
		imageUrl: `https://example.invalid/${id}.png`,
		name: id,
		rarity,
		setId: "base1",
		setName: "Base",
		setSeries: "Base",
		cardNumber: id.split("-")[1] ?? "1",
	};
}

// Seeded RNG for deterministic tests. Mulberry32 from Wikipedia.
function seededRng(seed: number): () => number {
	let t = seed >>> 0;
	return () => {
		t = (t + 0x6d2b79f5) >>> 0;
		let r = Math.imul(t ^ (t >>> 15), 1 | t);
		r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
		return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
	};
}

describe("rollPack", () => {
	test("returns 10 cards from a balanced pool with seeded RNG", () => {
		const pool: HoloCardData[] = [];
		for (let i = 0; i < 60; i++) pool.push(fixture(`c-${i}`, "Common"));
		for (let i = 0; i < 30; i++) pool.push(fixture(`u-${i}`, "Uncommon"));
		for (let i = 0; i < 10; i++) pool.push(fixture(`r-${i}`, "Rare Holo"));
		const pack = rollPack({ pool, rng: seededRng(42) });
		expect(pack).toHaveLength(10);
	});

	test("guarantees 1 rare-or-better in the pack", () => {
		const pool: HoloCardData[] = [];
		for (let i = 0; i < 60; i++) pool.push(fixture(`c-${i}`, "Common"));
		for (let i = 0; i < 30; i++) pool.push(fixture(`u-${i}`, "Uncommon"));
		for (let i = 0; i < 10; i++) pool.push(fixture(`r-${i}`, "Rare Holo"));
		const pack = rollPack({ pool, rng: seededRng(7) });
		const rares = pack.filter((c) => /^Rare/i.test(c.rarity ?? ""));
		expect(rares.length).toBeGreaterThanOrEqual(1);
	});

	test("has no within-pack duplicates", () => {
		const pool: HoloCardData[] = [];
		for (let i = 0; i < 60; i++) pool.push(fixture(`c-${i}`, "Common"));
		for (let i = 0; i < 30; i++) pool.push(fixture(`u-${i}`, "Uncommon"));
		for (let i = 0; i < 10; i++) pool.push(fixture(`r-${i}`, "Rare Holo"));
		const pack = rollPack({ pool, rng: seededRng(123) });
		const ids = new Set(pack.map((c) => c.id));
		expect(ids.size).toBe(pack.length);
	});

	test("falls back to random sample when no rarity tiers exist", () => {
		const pool: HoloCardData[] = [];
		for (let i = 0; i < 20; i++) pool.push(fixture(`x-${i}`)); // no rarity
		const pack = rollPack({ pool, rng: seededRng(0) });
		expect(pack).toHaveLength(10);
		const ids = new Set(pack.map((c) => c.id));
		expect(ids.size).toBe(10);
	});
});
