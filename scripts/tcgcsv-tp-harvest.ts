// Harvest a `cardId → tcgplayer productId` crosswalk from tcgcsv by EXACT
// set+number, to fill the gaps TCGdex's own `pricing` block leaves in the price
// crosswalk (EN ~18% of cards, JA ~all of tcgplayer). tcgcsv Pokemon EN = category
// 3, Pokemon Japan = category 85; both carry a "Number" extendedData we already
// match on for images (see tcgcsv-overlay.ts). This runs at BUILD time inside the
// weekly corpus build — a productId is a corpus-level fact, not a daily-price one.
//
// Guardrails (this is the "guarded fuzzy" the pricing design mandated):
//   - Only sets present in the caller's setId→groupId map are touched (the map is
//     the primary guardrail; an unmapped or mis-mapped group can only fail to match,
//     never inject a wrong price — the match still requires an exact set+number hit
//     within that specific group).
//   - If two products in a group normalize to the same set+number key, BOTH are
//     dropped (ambiguous — never guess), mirroring tcgcsv-overlay's uniqueMatch.
//   - A per-region HarvestReport is logged so a bad map is visible in CI.
//
// The setId→groupId maps are generated + committed: JP by scripts/tcgcsv-crosswalk.ts
// (scripts/data/tcgcsv-crosswalk.json), EN by scripts/tcgcsv-en-crosswalk.ts
// (scripts/data/tcgcsv-en-crosswalk.json).
//
// Spec: docs/superpowers/specs/2026-07-10-pricing-crosswalk-coverage-design.md

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { PriceIdsMap } from "../src/lib/corpus/price-types";
import { setNumKey, type TcgcsvProduct, tcgcsvLocalId } from "./tcgcsv-overlay";

const CACHE_DIR = "scripts/data/.cache/tcgcsv-products";
// tcgcsv 401s an empty User-Agent (Bun sends none by default); identify ourselves.
const UA =
	"cardstack-bot/1.0 (+https://github.com/TurtIeSocks/pokemon-tcg-viewer)";
const POLITE_DELAY_MS = 150;
const PRODUCTS_URL = (category: number, groupId: number) =>
	`https://tcgcsv.com/tcgplayer/${category}/${groupId}/products`;

export interface HarvestCard {
	id: string;
	setId: string;
	number: string;
}

export interface HarvestReport {
	setsHarvested: number;
	cardsMatched: number;
	ambiguousSkipped: number;
	groupsUnfetched: number;
}

export type GetProductsFn = (
	category: number,
	groupId: number,
	refresh: boolean,
	fetchImpl: typeof fetch,
) => Promise<TcgcsvProduct[]>;

async function fetchText(
	url: string,
	fetchImpl: typeof fetch,
): Promise<string> {
	const r = await fetchImpl(url, { headers: { "User-Agent": UA } });
	if (!r.ok) throw new Error(`${url} -> ${r.status}`);
	return r.text();
}

/** One group's products, disk-cached by (globally unique) groupId. `refresh`
 * forces a fetch; otherwise a cached file is reused. Freshly-fetched products are
 * written to the cache and followed by a polite delay. */
export const getProducts: GetProductsFn = async (
	category,
	groupId,
	refresh,
	fetchImpl,
) => {
	const file = `${CACHE_DIR}/${groupId}.json`;
	if (!refresh && existsSync(file))
		return JSON.parse(readFileSync(file, "utf8")) as TcgcsvProduct[];
	const body = await fetchText(PRODUCTS_URL(category, groupId), fetchImpl);
	const j = JSON.parse(body) as { results?: TcgcsvProduct[] };
	const products = j.results ?? [];
	mkdirSync(CACHE_DIR, { recursive: true });
	writeFileSync(file, JSON.stringify(products));
	await new Promise((res) => setTimeout(res, POLITE_DELAY_MS));
	return products;
};

/**
 * Harvest `cardId → tcgplayer productId` for the given cards, using tcgcsv
 * products from the mapped groups. A single unfetchable group is skipped (counted
 * in the report), never fatal — keep-last-good.
 */
export async function harvestTcgcsvTpIds(
	cards: HarvestCard[],
	setToGroup: Record<string, number>,
	category: number,
	opts: {
		refresh?: boolean;
		getProductsFn?: GetProductsFn;
		fetchImpl?: typeof fetch;
	} = {},
): Promise<{ tpIdByCardId: Map<string, number>; report: HarvestReport }> {
	const getP = opts.getProductsFn ?? getProducts;
	const fetchImpl = opts.fetchImpl ?? fetch;
	const refresh = opts.refresh ?? false;

	// Per-set index: setNumKey → productId, or null once a key is seen twice
	// (ambiguous — two different products claim the same set+number; drop both).
	const byKey = new Map<string, number | null>();
	let setsHarvested = 0;
	let groupsUnfetched = 0;
	let ambiguousSkipped = 0;
	for (const [setId, groupId] of Object.entries(setToGroup)) {
		let products: TcgcsvProduct[];
		try {
			products = await getP(category, groupId, refresh, fetchImpl);
		} catch {
			groupsUnfetched++;
			continue;
		}
		setsHarvested++;
		for (const p of products) {
			const key = setNumKey(setId, tcgcsvLocalId(p));
			if (byKey.has(key)) {
				if (byKey.get(key) !== null) {
					byKey.set(key, null);
					ambiguousSkipped++;
				}
			} else {
				byKey.set(key, p.productId);
			}
		}
	}

	const tpIdByCardId = new Map<string, number>();
	for (const c of cards) {
		const pid = byKey.get(setNumKey(c.setId, c.number));
		if (pid != null) tpIdByCardId.set(c.id, pid);
	}
	return {
		tpIdByCardId,
		report: {
			setsHarvested,
			cardsMatched: tpIdByCardId.size,
			ambiguousSkipped,
			groupsUnfetched,
		},
	};
}

/**
 * Fold harvested tcgplayer ids into the TCGdex-harvested crosswalk. TCGdex's own
 * mapping WINS: a non-null tp id is never overwritten. Only a null tp slot is
 * filled, and a card with no crosswalk entry at all gains a tcgplayer-only entry.
 * Cardmarket ids are untouched (tcgcsv has none).
 */
export function mergeTpIds(
	base: PriceIdsMap,
	tpIdByCardId: Map<string, number>,
): { map: PriceIdsMap; filled: number } {
	const map: PriceIdsMap = { ...base };
	let filled = 0;
	for (const [cardId, tpId] of tpIdByCardId) {
		const existing = map[cardId];
		if (existing) {
			if (existing[1] === null) {
				map[cardId] = [existing[0], tpId];
				filled++;
			}
		} else {
			map[cardId] = [null, tpId];
			filled++;
		}
	}
	return { map, filled };
}
