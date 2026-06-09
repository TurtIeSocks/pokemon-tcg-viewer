// src/components/dev/seed-data.test.ts
//
// Deterministic generator tests: a seeded PRNG stands in for Math.random so the
// output is reproducible. We assert structural validity, not exact values.

import { expect, test } from "bun:test";
import type { CorpusCard } from "@/store/corpus/corpus-types";
import { generateSeedBinders, generateSeedStacks, type Rng } from "./seed-data";

/** Small, fast, seedable PRNG (mulberry32) — deterministic across runs. */
function mulberry32(seed: number): Rng {
	let a = seed;
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function makeCards(n: number): CorpusCard[] {
	return Array.from({ length: n }, (_, i) => ({
		id: `card-${i}`,
		name: `Card ${i}`,
		imageUrl: "",
		imageUrlSmall: "",
		supertype: "Pokémon",
		setId: `set-${i % 5}`,
		number: String(i),
		variants: i % 3 === 0 ? ["holofoil", "reverseHolofoil"] : undefined,
	}));
}

const CONDITIONS = new Set(["NM", "LP", "MP", "HP", "DMG"]);
const LANGS = new Set(["en", "ja", "zh"]);
const NOW = 1_700_000_000_000;

test("generateSeedStacks returns the requested count of distinct cards", () => {
	const cards = makeCards(50);
	const stacks = generateSeedStacks(cards, 20, NOW, mulberry32(1));
	expect(stacks).toHaveLength(20);
	const ids = new Set(stacks.map((s) => s.cardId));
	expect(ids.size).toBe(20); // distinct
});

test("count is clamped to the corpus size", () => {
	const cards = makeCards(8);
	const stacks = generateSeedStacks(cards, 100, NOW, mulberry32(2));
	expect(stacks).toHaveLength(8);
});

test("each seeded stack is structurally valid", () => {
	const cards = makeCards(60);
	const stacks = generateSeedStacks(cards, 40, NOW, mulberry32(3));
	for (const s of stacks) {
		expect(s.isPrimary).toBe(true);
		expect(s.currency).toBe("USD");
		expect(LANGS.has(s.language as string)).toBe(true);
		expect(s.quantity).toBeGreaterThanOrEqual(1);
		expect(s.quantity).toBeLessThanOrEqual(4);

		// graded XOR raw condition — never both, never neither.
		const graded = s.grading !== null;
		expect(s.condition === null).toBe(graded);
		if (graded) {
			expect(typeof s.grading?.company).toBe("string");
			expect(typeof s.grading?.grade).toBe("number");
		} else {
			expect(CONDITIONS.has(s.condition as string)).toBe(true);
		}

		// price: unknown (null) or a positive integer count of cents.
		if (s.pricePaid !== null) {
			expect(Number.isInteger(s.pricePaid)).toBe(true);
			expect(s.pricePaid as number).toBeGreaterThan(0);
		}

		// acquiredAt within the last ~2 years, never in the future.
		expect(s.acquiredAt as number).toBeLessThanOrEqual(NOW);
		expect(s.acquiredAt as number).toBeGreaterThanOrEqual(
			NOW - 731 * 86_400_000,
		);

		// variant, if set, came from the card's own printings.
		if (typeof s.variant === "string") {
			expect(["holofoil", "reverseHolofoil"]).toContain(s.variant);
		}
	}
});

test("generateSeedBinders returns distinct-named valid plans", () => {
	const cards = makeCards(30);
	const owned = cards.slice(0, 15).map((c) => c.id);
	const plans = generateSeedBinders(owned, cards, 6, mulberry32(4));
	expect(plans).toHaveLength(6);
	expect(new Set(plans.map((p) => p.name)).size).toBe(6); // distinct names

	const ownedSet = new Set(owned);
	for (const p of plans) {
		if (p.query) {
			// Smart rule: a complete by-set query, no manual members.
			expect(p.query.setId).toMatch(/^set-/);
			expect(p.query.mode).toBe("fuzzy");
			expect(p.query.types).toEqual([]);
			expect(p.cardIds).toEqual([]);
		} else {
			// Manual: every member is an owned card.
			for (const id of p.cardIds) expect(ownedSet.has(id)).toBe(true);
		}
	}
});

test("manual binders are empty when nothing is owned", () => {
	const cards = makeCards(10);
	const plans = generateSeedBinders([], cards, 5, mulberry32(5));
	for (const p of plans) {
		if (!p.query) expect(p.cardIds).toEqual([]);
	}
});
