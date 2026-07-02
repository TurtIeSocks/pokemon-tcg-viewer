// Overlay tcgcsv (TCGplayer "Pokemon Japan", categoryId 85) card data onto the
// Asian corpus for the ~103 sets TCGdex has NO per-card data for (the ADV / PCG /
// L / e-Card / XY-ja gap). Fills card-exists + image + rarity + number + type.
//
// NAMES ARE ENGLISH (tcgcsv's limitation) — a stopgap until real Japanese names
// arrive upstream. The SET name stays Japanese (it comes from TCGdex's set shell).
// See memory reference-jp-data-sources for the full source comparison.
//
// tcgcsv usage guidelines (https://tcgcsv.com/): identify via User-Agent, don't
// re-scrape needlessly (their data refreshes ~daily), and cache into your own
// store. We honor all three: products are cached to disk per group, and a crawl
// is skipped entirely when tcgcsv's /last-updated.txt is unchanged since the last
// run (the freshness marker). We crawl at BUILD time and bake the result into the
// corpus — never a client-direct fetch.
//
// CLI: bun run scripts/tcgcsv-overlay.ts [corpus.asia.json.gz]  (merge into a corpus)
//      FORCE_REFRESH=1 bun run scripts/tcgcsv-overlay.ts        (ignore cache)
// Module: fetchTcgcsvOverlay() + mergeTcgcsvOverlay() — used by build-corpus.ts.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";
import type { CorpusCard } from "../src/store/corpus/corpus-types";

const CROSSWALK_FILE = "scripts/data/tcgcsv-crosswalk.json";
const CACHE_DIR = "scripts/data/.cache/tcgcsv-products";
const MARKER_FILE = "scripts/data/.cache/tcgcsv-last-updated.txt";
const LAST_UPDATED_URL = "https://tcgcsv.com/last-updated.txt";
const PRODUCTS_URL = (g: number) =>
	`https://tcgcsv.com/tcgplayer/85/${g}/products`;
const UA =
	"cardstack-jp-overlay/1.0 (+https://github.com/rin/pokemon-tcg-viewer)";
const POLITE_DELAY_MS = 150;

interface TcgcsvProduct {
	productId: number;
	name: string;
	extendedData?: { name: string; value: string }[];
}

const ENERGY_TYPES = new Set([
	"Grass",
	"Fire",
	"Water",
	"Lightning",
	"Psychic",
	"Fighting",
	"Darkness",
	"Metal",
	"Fairy",
	"Dragon",
	"Colorless",
]);

function ext(p: TcgcsvProduct, key: string): string | undefined {
	return p.extendedData?.find((e) => e.name === key)?.value;
}

/** Map one tcgcsv product to a CorpusCard for the given TCGdex set id. Exported
 * for the unit test. `region` is intentionally omitted — buildIndex stamps it. */
export function productToCard(p: TcgcsvProduct, setId: string): CorpusCard {
	const num = ext(p, "Number"); // e.g. "014/055"
	const localId = num ? String(Number(num.split("/")[0])) : String(p.productId);
	const cardType = ext(p, "CardType");
	const hp = ext(p, "HP");
	// tcgcsv CardType for a Pokemon IS its energy type (Water/Fire/...), not a
	// supertype; HP or an energy-typed CardType marks a Pokemon. Else Trainer/Energy.
	const supertype =
		hp || (cardType && ENERGY_TYPES.has(cardType))
			? "Pokémon"
			: cardType === "Energy"
				? "Energy"
				: "Trainer";
	const cdn = `https://tcgplayer-cdn.tcgplayer.com/product/${p.productId}`;
	const card: CorpusCard = {
		id: `${setId}-${localId}`,
		name: p.name, // English (tcgcsv limitation)
		imageUrl: `${cdn}_400w.jpg`,
		imageUrlSmall: `${cdn}_200w.jpg`,
		imageBase: null, // no TCGdex CDN image; cardImage() uses imageUrl
		supertype,
		setId,
		number: localId,
	};
	const rarity = ext(p, "Rarity");
	if (rarity && rarity !== "None") card.rarity = rarity;
	if (supertype === "Pokémon" && cardType && ENERGY_TYPES.has(cardType))
		card.types = [cardType];
	return card;
}

/** Non-destructive append: TCGdex cards always win; overlay only fills ids the
 * base corpus doesn't already have. Exported + pure for the unit test. */
export function mergeTcgcsvOverlay(
	base: CorpusCard[],
	overlay: CorpusCard[],
): { merged: CorpusCard[]; added: number } {
	const byId = new Map(base.map((c) => [c.id, c]));
	let added = 0;
	for (const c of overlay) {
		if (!byId.has(c.id)) {
			byId.set(c.id, c);
			added++;
		}
	}
	return { merged: [...byId.values()], added };
}

async function fetchText(
	url: string,
	fetchImpl: typeof fetch,
): Promise<string> {
	const r = await fetchImpl(url, { headers: { "User-Agent": UA } });
	if (!r.ok) throw new Error(`${url} -> ${r.status}`);
	return r.text();
}

/** Products for one group: from disk cache unless `refresh` (data changed) or the
 * cache file is absent. Freshly-fetched products are written to the cache. */
async function getProducts(
	groupId: number,
	refresh: boolean,
	fetchImpl: typeof fetch,
): Promise<TcgcsvProduct[]> {
	const file = `${CACHE_DIR}/${groupId}.json`;
	if (!refresh && existsSync(file))
		return JSON.parse(readFileSync(file, "utf8")) as TcgcsvProduct[];
	const body = await fetchText(PRODUCTS_URL(groupId), fetchImpl);
	const j = JSON.parse(body) as { results?: TcgcsvProduct[] };
	const products = j.results ?? [];
	mkdirSync(CACHE_DIR, { recursive: true });
	writeFileSync(file, JSON.stringify(products));
	await new Promise((res) => setTimeout(res, POLITE_DELAY_MS));
	return products;
}

export interface OverlayOpts {
	crosswalk?: Record<string, number>;
	fetchImpl?: typeof fetch;
	forceRefresh?: boolean;
}

/**
 * Crawl every crosswalked dead set from tcgcsv into CorpusCards. Gated on
 * /last-updated.txt: if it matches the stored marker AND every group is already
 * cached, no network products are fetched. On any tcgcsv failure we fall back to
 * whatever is cached (offline / upstream-down); a truly empty result lets the
 * caller keep a TCGdex-only corpus (keep-last-good) rather than blanking it.
 */
export async function fetchTcgcsvOverlay(
	opts: OverlayOpts = {},
): Promise<CorpusCard[]> {
	const fetchImpl = opts.fetchImpl ?? fetch;
	const crosswalk =
		opts.crosswalk ??
		(JSON.parse(readFileSync(CROSSWALK_FILE, "utf8")) as Record<
			string,
			number
		>);

	// Freshness gate. If last-updated is unreachable (offline), fall through to
	// cache-only (refresh=false) rather than aborting the whole build.
	let refresh = opts.forceRefresh ?? false;
	let remoteMarker: string | null = null;
	if (!opts.forceRefresh) {
		try {
			remoteMarker = (await fetchText(LAST_UPDATED_URL, fetchImpl)).trim();
			const stored = existsSync(MARKER_FILE)
				? readFileSync(MARKER_FILE, "utf8").trim()
				: null;
			if (remoteMarker !== stored) refresh = true;
		} catch (e) {
			console.warn(
				`  ↳ tcgcsv overlay: last-updated unreachable (${(e as Error).message}); using cache only`,
			);
		}
	}

	const cards: CorpusCard[] = [];
	let fetched = 0;
	for (const [setId, groupId] of Object.entries(crosswalk)) {
		try {
			const products = await getProducts(groupId, refresh, fetchImpl);
			if (refresh) fetched++;
			for (const p of products) cards.push(productToCard(p, setId));
		} catch (e) {
			console.warn(
				`  ↳ tcgcsv overlay: set ${setId} (group ${groupId}) failed: ${(e as Error).message}`,
			);
		}
	}

	// Advance the freshness marker only after a full refresh crawl succeeded.
	if (refresh && remoteMarker && fetched > 0) {
		mkdirSync(CACHE_DIR, { recursive: true });
		writeFileSync(MARKER_FILE, remoteMarker);
	}
	console.error(
		`tcgcsv overlay: ${cards.length} cards from ${Object.keys(crosswalk).length} dead sets (${refresh ? `refreshed ${fetched}` : "from cache"})`,
	);
	return cards;
}

// CLI: merge the overlay into an on-disk corpus (dev convenience).
async function main() {
	const out = process.argv[2] ?? "corpus.asia.json.gz";
	const overlay = await fetchTcgcsvOverlay({
		forceRefresh: process.env.FORCE_REFRESH === "1",
	});
	const existing = JSON.parse(
		gunzipSync(readFileSync(out)).toString(),
	) as CorpusCard[];
	const { merged, added } = mergeTcgcsvOverlay(existing, overlay);
	writeFileSync(out, gzipSync(Buffer.from(JSON.stringify(merged))));
	console.error(
		`merged: ${existing.length} existing + ${added} overlay -> ${merged.length} total -> ${out}`,
	);
}

if (import.meta.main) main();
