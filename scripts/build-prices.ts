// Daily price-blob builder. Joins the corpus-build crosswalk
// (cardId → marketplace product ids) with the marketplaces' public bulk
// feeds — cardmarket's daily price guide and tcgcsv's TCGplayer mirror —
// plus the ECB FX table, into corpus/prices/latest.json.gz.
// Spec: docs/superpowers/specs/2026-07-03-pricing-implementation-design.md §2.
import {
	type CardPriceEntry,
	type CmTuple,
	type FxTable,
	type PriceIdsMap,
	type PricesBlob,
	TP_SUBTYPE_TO_CODE,
	toCents,
} from "../src/lib/corpus/price-types";

/** The fields we read from cardmarket's price_guide_6.json records. */
export interface CmGuideRecord {
	idProduct: number;
	trend: number | null;
	avg1: number | null;
	avg7: number | null;
	avg30: number | null;
}

/** The fields we read from tcgcsv /tcgplayer/3/{groupId}/prices records. */
export interface TcgcsvPriceRecord {
	productId: number;
	marketPrice: number | null;
	lowPrice: number | null;
	subTypeName: string;
}

export function joinPrices(input: {
	priceIds: PriceIdsMap;
	cmGuide: CmGuideRecord[];
	tpPrices: TcgcsvPriceRecord[];
	fx: FxTable;
	date: string;
	sources: { tp: string | null; cm: string | null };
}): { blob: PricesBlob; unknownSubtypes: string[] } {
	const cmById = new Map(input.cmGuide.map((r) => [r.idProduct, r]));
	const tpById = new Map<number, TcgcsvPriceRecord[]>();
	for (const r of input.tpPrices) {
		const list = tpById.get(r.productId);
		if (list) list.push(r);
		else tpById.set(r.productId, [r]);
	}

	const cards: PricesBlob["cards"] = {};
	const unknown = new Set<string>();
	for (const [cardId, [cmId, tpId]] of Object.entries(input.priceIds)) {
		const entry: CardPriceEntry = {};
		if (tpId !== null) {
			for (const rec of tpById.get(tpId) ?? []) {
				const code = TP_SUBTYPE_TO_CODE[rec.subTypeName];
				if (!code) {
					unknown.add(rec.subTypeName);
					continue;
				}
				const market = toCents(rec.marketPrice);
				const low = toCents(rec.lowPrice);
				if (market !== null || low !== null) {
					if (!entry.tp) entry.tp = {};
					entry.tp[code] = [market, low];
				}
			}
		}
		if (cmId !== null) {
			const g = cmById.get(cmId);
			if (g) {
				const tuple: CmTuple = [
					toCents(g.trend),
					toCents(g.avg1),
					toCents(g.avg7),
					toCents(g.avg30),
				];
				if (tuple.some((x) => x !== null)) entry.cm = tuple;
			}
		}
		if (entry.tp || entry.cm) cards[cardId] = entry;
	}

	return {
		blob: {
			v: 1,
			date: input.date,
			fx: input.fx,
			sources: input.sources,
			cards,
		},
		unknownSubtypes: [...unknown].sort(),
	};
}
