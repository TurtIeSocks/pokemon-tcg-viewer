// Daily per-set price-history rollup builder. A workflow step after the price
// blob is built + uploaded: reads today's blob + the corpus card→set map + each
// set's prior rollup, appends today's representative USD market per card,
// downsamples, and writes per-set rollup gz files for upload to R2.
// Spec: docs/superpowers/specs/2026-07-03-pricing-implementation-design.md §6.
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";
import {
	appendDailyPoint,
	downsample,
	epochDayUtc,
	representativeMarketUsdCents,
	type SetHistory,
} from "../src/lib/corpus/price-history";
import type { PricesBlob } from "../src/lib/corpus/price-types";

export function buildSetHistories(input: {
	blob: PricesBlob;
	cardToSet: Map<string, string>;
	priorBySet: Map<string, SetHistory>;
	todayDay: number;
}): Map<string, SetHistory> {
	const { blob, cardToSet, priorBySet, todayDay } = input;
	const out = new Map<string, SetHistory>();
	// Seed with a shallow copy of each prior rollup so untouched cards persist.
	for (const [setId, hist] of priorBySet) out.set(setId, { ...hist });

	for (const [cardId, entry] of Object.entries(blob.cards)) {
		const setId = cardToSet.get(cardId);
		if (!setId) continue;
		const value = representativeMarketUsdCents(entry, blob.fx);
		if (value === null) continue;
		const hist = out.get(setId) ?? {};
		hist[cardId] = appendDailyPoint(hist[cardId] ?? [], todayDay, value);
		out.set(setId, hist);
	}

	// Downsample every touched set (bounds blob growth).
	for (const [setId, hist] of out) {
		const ds: SetHistory = {};
		for (const [cardId, points] of Object.entries(hist)) {
			ds[cardId] = downsample(points, todayDay);
		}
		out.set(setId, ds);
	}
	return out;
}

/**
 * Manifest of every set rollup written today, keyed by a fixed well-known
 * name (`history/_index.json`). wrangler's R2 CLI only supports get/put/delete
 * of a single object — no bulk "list objects under a prefix" — so the
 * workflow can't discover which `{setId}.json.gz` keys exist in
 * corpus/prices/history/ on its own. It fetches this manifest first, reads
 * the setId list back out, and fetches exactly those prior blobs into
 * history-prior/ before this script runs again tomorrow.
 */
export function buildIndexManifest(
	setIds: Iterable<string>,
	builtAt: string,
): { setIds: string[]; builtAt: string } {
	return { setIds: [...setIds].sort(), builtAt };
}

// --- Entrypoint (workflow-run; not exercised by unit tests) ---

interface CorpusCard {
	id: string;
	setId: string;
}

function loadGzJson<T>(path: string): T {
	return JSON.parse(gunzipSync(readFileSync(path)).toString()) as T;
}

function cardToSetFromCorpus(paths: string[]): Map<string, string> {
	const m = new Map<string, string>();
	for (const p of paths) {
		if (!existsSyncSafe(p)) continue;
		const cards = loadGzJson<CorpusCard[]>(p);
		for (const c of cards) if (c.setId) m.set(c.id, c.setId);
	}
	return m;
}

function existsSyncSafe(p: string): boolean {
	try {
		readFileSync(p);
		return true;
	} catch {
		return false;
	}
}

if (import.meta.main) {
	const blob = loadGzJson<PricesBlob>("prices.json.gz");
	const cardToSet = cardToSetFromCorpus([
		"corpus.json.gz",
		"corpus.asia.json.gz",
	]);

	// Prior rollups: the workflow fetches existing corpus/prices/history/*.json.gz
	// into ./history-prior/. Missing dir → first-ever run, start fresh.
	const priorBySet = new Map<string, SetHistory>();
	try {
		for (const f of readdirSync("history-prior")) {
			if (!f.endsWith(".json.gz")) continue;
			const setId = f.replace(/\.json\.gz$/, "");
			priorBySet.set(setId, loadGzJson<SetHistory>(`history-prior/${f}`));
		}
	} catch {
		// no prior dir — first run
	}

	const todayDay = epochDayUtc(blob.date);
	const built = buildSetHistories({ blob, cardToSet, priorBySet, todayDay });

	mkdirSync("history", { recursive: true });
	let setCount = 0;
	const setIds: string[] = [];
	for (const [setId, hist] of built) {
		await Bun.write(
			`history/${setId}.json.gz`,
			gzipSync(Buffer.from(JSON.stringify(hist))),
		);
		setIds.push(setId);
		setCount++;
	}
	await Bun.write(
		"history/_index.json",
		JSON.stringify(buildIndexManifest(setIds, new Date().toISOString())),
	);
	console.log(
		`history: ${setCount} set rollups written (${cardToSet.size} card→set, blob date ${blob.date})`,
	);
}
