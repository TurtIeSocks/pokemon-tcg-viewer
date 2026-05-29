import type { HoloCardData } from "../components/holo-card";

const DEFAULT_PACK_SIZE = 10;
const RARE_COUNT = 1;
const UNCOMMON_COUNT = 3;
const COMMON_COUNT = DEFAULT_PACK_SIZE - RARE_COUNT - UNCOMMON_COUNT;

export interface RollOptions {
	pool: HoloCardData[];
	rng?: () => number;
	packSize?: number;
}

function isRare(c: HoloCardData): boolean {
	return /^Rare/i.test(c.rarity ?? "");
}

function isUncommon(c: HoloCardData): boolean {
	return c.rarity === "Uncommon";
}

function isCommon(c: HoloCardData): boolean {
	return !c.rarity || c.rarity === "Common";
}

function sample(
	source: HoloCardData[],
	count: number,
	rng: () => number,
): HoloCardData[] {
	// Fisher-Yates partial shuffle, sample-without-replacement.
	const arr = [...source];
	const result: HoloCardData[] = [];
	const take = Math.min(count, arr.length);
	for (let i = 0; i < take; i++) {
		const idx = Math.floor(rng() * (arr.length - i)) + i;
		const tmp = arr[i];
		arr[i] = arr[idx];
		arr[idx] = tmp;
		result.push(arr[i]);
	}
	return result;
}

/**
 * Roll a single booster pack from a pool. Rarity-weighted: 1 rare-or-better,
 * 3 uncommons, 6 commons by default. Falls back to a random sample when
 * the pool has no rarity tiers. Sample-without-replacement (no within-pack
 * dupes).
 *
 * The optional `rng` argument lets tests inject seeded randomness.
 */
export function rollPack({
	pool,
	rng = Math.random,
	packSize = DEFAULT_PACK_SIZE,
}: RollOptions): HoloCardData[] {
	const rares = pool.filter(isRare);
	const uncommons = pool.filter(isUncommon);
	const commons = pool.filter(isCommon);

	// Fallback: if no rarity tiers populated, just random sample.
	if (rares.length + uncommons.length === 0) {
		return sample(pool, packSize, rng);
	}

	const picked: HoloCardData[] = [];
	const seen = new Set<string>();

	const pickFrom = (bucket: HoloCardData[], want: number) => {
		const remaining = bucket.filter((c) => !seen.has(c.id));
		const got = sample(remaining, want, rng);
		for (const c of got) {
			picked.push(c);
			seen.add(c.id);
		}
		return got.length;
	};

	const gotRare = pickFrom(rares, RARE_COUNT);
	const gotUncommon = pickFrom(uncommons, UNCOMMON_COUNT);
	const gotCommon = pickFrom(commons, COMMON_COUNT);

	// Top-up: if any bucket was short, top up from leftover pool.
	const deficit = packSize - (gotRare + gotUncommon + gotCommon);
	if (deficit > 0) {
		const leftovers = pool.filter((c) => !seen.has(c.id));
		const fill = sample(leftovers, deficit, rng);
		for (const c of fill) picked.push(c);
	}

	return picked;
}
