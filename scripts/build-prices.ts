// Daily price-blob builder. Joins the corpus-build crosswalk
// (cardId → marketplace product ids) with the marketplaces' public bulk
// feeds — cardmarket's daily price guide and tcgcsv's TCGplayer mirror —
// plus the ECB FX table, into corpus/prices/latest.json.gz.
// Spec: docs/superpowers/specs/2026-07-03-pricing-implementation-design.md §2.
import { readFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";
import {
	type CardPriceEntry,
	type CmTuple,
	type FxTable,
	type PriceIdsMap,
	type PricesBlob,
	TP_SUBTYPE_TO_CODE,
	toCents,
} from "../src/lib/corpus/price-types";
import { fetchJson, pLimit } from "./build-corpus";

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

const CM_GUIDE_URL =
	"https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_6.json";
const TCGCSV_BASE = "https://tcgcsv.com/tcgplayer/3"; // Pokemon (EN) category
const FX_URL = "https://api.frankfurter.dev/v1/latest";
const TP_GROUP_CONCURRENCY = 8;
/** Catastrophic-shortfall floor: EN corpus alone yields ~19k priced cards. */
const MIN_PRICED_CARDS = 5000;

export type FetchJsonFn = (url: string) => Promise<unknown>;

/** Cardmarket's public daily price guide (all games; caller filters via crosswalk). */
export async function fetchCmGuide(
	fetchJsonFn: FetchJsonFn = fetchJson,
): Promise<{ records: CmGuideRecord[]; date: string }> {
	const raw = (await fetchJsonFn(CM_GUIDE_URL)) as {
		createdAt: string;
		priceGuides: Array<
			{ idProduct: number } & Partial<
				Record<"trend" | "avg1" | "avg7" | "avg30", number | null>
			>
		>;
	};
	const records = raw.priceGuides.map((g) => ({
		idProduct: g.idProduct,
		trend: g.trend ?? null,
		avg1: g.avg1 ?? null,
		avg7: g.avg7 ?? null,
		avg30: g.avg30 ?? null,
	}));
	return { records, date: raw.createdAt.slice(0, 10) };
}

/** All tcgcsv Pokemon-EN group price feeds, flattened. */
export async function fetchTpPrices(
	fetchJsonFn: FetchJsonFn = fetchJson,
): Promise<{ records: TcgcsvPriceRecord[]; groupCount: number }> {
	const groups = (await fetchJsonFn(`${TCGCSV_BASE}/groups`)) as {
		results: { groupId: number }[];
	};
	const lists = await pLimit(
		groups.results.map((g) => async () => {
			const res = (await fetchJsonFn(`${TCGCSV_BASE}/${g.groupId}/prices`)) as {
				results: Array<
					{ productId: number; subTypeName: string } & Partial<
						Record<"marketPrice" | "lowPrice", number | null>
					>
				>;
			};
			return res.results;
		}),
		TP_GROUP_CONCURRENCY,
	);
	const records = lists.flat().map((r) => ({
		productId: r.productId,
		marketPrice: r.marketPrice ?? null,
		lowPrice: r.lowPrice ?? null,
		subTypeName: r.subTypeName,
	}));
	return { records, groupCount: groups.results.length };
}

/** ECB reference rates via frankfurter.dev. USD is load-bearing (rollup currency). */
export async function fetchFx(
	fetchJsonFn: FetchJsonFn = fetchJson,
): Promise<FxTable> {
	const raw = (await fetchJsonFn(FX_URL)) as {
		base: string;
		date: string;
		rates: Record<string, number>;
	};
	if (typeof raw.rates?.USD !== "number") {
		throw new Error("FX table missing USD rate — refusing to build");
	}
	return { base: "EUR", date: raw.date, rates: raw.rates };
}

function loadPriceIds(path: string): PriceIdsMap {
	const bytes = gunzipSync(readFileSync(path));
	return JSON.parse(bytes.toString()) as PriceIdsMap;
}

// Entrypoint: `bun run scripts/build-prices.ts`
// Expects price-ids.json.gz (+ optional price-ids.asia.json.gz) in cwd,
// fetched from R2 by the workflow. Writes prices.json.gz + prices-meta.json.
if (import.meta.main) {
	const startedAt = Date.now();
	const priceIds: PriceIdsMap = {
		...loadPriceIds("price-ids.json.gz"),
		...((await Bun.file("price-ids.asia.json.gz").exists())
			? loadPriceIds("price-ids.asia.json.gz")
			: {}),
	};
	if (!Object.keys(priceIds).length) {
		throw new Error(
			"no crosswalk entries loaded — is price-ids.json.gz present?",
		);
	}
	console.log(`crosswalk: ${Object.keys(priceIds).length} cards`);

	const [cm, tp, fx] = await Promise.all([
		fetchCmGuide(),
		fetchTpPrices(),
		fetchFx(),
	]);
	console.log(
		`fetched: cardmarket ${cm.records.length} products (${cm.date}), tcgplayer ${tp.records.length} price rows across ${tp.groupCount} groups, fx ${Object.keys(fx.rates).length} rates (${fx.date})`,
	);

	const date = new Date().toISOString().slice(0, 10);
	const { blob, unknownSubtypes } = joinPrices({
		priceIds,
		cmGuide: cm.records,
		tpPrices: tp.records,
		fx,
		date,
		// tp uses the build date by design — tcgcsv exposes no per-feed data
		// timestamp, unlike cardmarket's cm.date.
		sources: { tp: date, cm: cm.date },
	});
	if (unknownSubtypes.length) {
		console.warn(
			`unknown tcgplayer subtypes skipped: ${unknownSubtypes.join(", ")}`,
		);
	}

	const count = Object.keys(blob.cards).length;
	// Keep-last-good: a catastrophic join (bad crosswalk, empty feeds) must not
	// overwrite yesterday's blob — fail the Action instead.
	if (count < MIN_PRICED_CARDS) {
		throw new Error(
			`only ${count} priced cards (< ${MIN_PRICED_CARDS}) — refusing to publish`,
		);
	}

	const gz = gzipSync(Buffer.from(JSON.stringify(blob)));
	await Bun.write("prices.json.gz", gz);
	await Bun.write(
		"prices-meta.json",
		JSON.stringify({ date, count, builtAt: new Date().toISOString() }),
	);
	const kb = (gz.length / 1024).toFixed(0);
	const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
	console.log(
		`Wrote ${count} priced cards → prices.json.gz (${kb} KB) in ${secs}s`,
	);
}
