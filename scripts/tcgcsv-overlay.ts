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

/** Match key = setId + leading-zero-normalized number. TCGdex uses zero-padded
 * localIds ("001"); tcgcsv's minted number strips them ("1"). Fold both. */
function setNumKey(setId: string, number: string): string {
	const n = /^\d+$/.test(number) ? String(Number.parseInt(number, 10)) : number;
	return `${setId}:${n.toLowerCase()}`;
}

const isRealImage = (url: string | undefined): boolean =>
	!!url && /tcgplayer-cdn\.tcgplayer\.com|assets\.tcgdex\.net/.test(url);
const isPtcgFallback = (url: string | undefined): boolean =>
	!!url && url.includes("images.pokemontcg.io");
/** A base card that still needs an image: no native TCGdex scan (imageBase null)
 * and its imageUrl isn't already a real tcgplayer/tcgdex image. */
const needsImage = (c: CorpusCard): boolean =>
	c.imageBase == null && !isRealImage(c.imageUrl);

/** English species list from PokéAPI → { lowercased-name: national-dex-number }.
 * Bridges tcgcsv's English names to TCGdex's `nationalPokedexNumbers` for the old
 * sets tcgcsv publishes no card numbers for. Returns an empty map on failure
 * (the name/dex pass is then simply skipped — number-based fill still runs). */
const POKEDEX_LIMIT = 1025;
export async function fetchNameToDex(
	fetchImpl: typeof fetch = fetch,
): Promise<Map<string, number>> {
	try {
		const r = await fetchImpl(
			`https://pokeapi.co/api/v2/pokemon?limit=${POKEDEX_LIMIT}`,
		);
		if (!r.ok) return new Map();
		const j = (await r.json()) as { results: { name: string }[] };
		return new Map(j.results.map((p, i) => [p.name.toLowerCase(), i + 1]));
	} catch {
		return new Map();
	}
}

/** Best unambiguous overlay match for a still-imageless base card within its set:
 * exact English name first, then national-dex-number (via nameToDex). Returns a
 * match only when EXACTLY ONE overlay card qualifies (never guesses on a tie). */
function uniqueMatch(
	card: CorpusCard,
	candidates: CorpusCard[],
	nameToDex: Map<string, number>,
): CorpusCard | undefined {
	const byName = candidates.filter(
		(o) => o.name.toLowerCase() === card.name.toLowerCase(),
	);
	if (byName.length === 1) return byName[0];
	const dexes = new Set(card.nationalPokedexNumbers ?? []);
	if (dexes.size === 0) return undefined;
	const byDex = candidates.filter((o) => {
		const d = nameToDex.get(o.name.toLowerCase());
		return d != null && dexes.has(d);
	});
	return byDex.length === 1 ? byDex[0] : undefined;
}

export interface MergeOpts {
	/** English-name → national-dex map (fetchNameToDex). Enables the name/dex fill
	 * pass for old sets tcgcsv publishes no numbers for. */
	nameToDex?: Map<string, number>;
	/** Blank any remaining pokemontcg.io fallback image (a Western-only source) so a
	 * still-imageless JP card shows a card-back instead of a wrong-language scan. */
	suppressPtcgFallback?: boolean;
}

/**
 * Merge the tcgcsv overlay into the TCGdex base corpus. Non-destructive; per card:
 *  - ADD: a set entirely absent from the base (a TCGdex empty-cards[] set) gets its
 *    overlay cards appended.
 *  - FILL: a base card with NO native TCGdex scan (`imageBase` null) gets the
 *    overlay's tcgplayer image — matched first by set+number, then (with
 *    opts.nameToDex) by unambiguous English-name/national-dex.
 * A card TCGdex already has a real scan for is never touched, and cards are never
 * invented into a set TCGdex already populates. With opts.suppressPtcgFallback, any
 * still-imageless card's pokemontcg.io fallback is blanked. Pure — for the test.
 */
export function mergeTcgcsvOverlay(
	base: CorpusCard[],
	overlay: CorpusCard[],
	opts: MergeOpts = {},
): {
	merged: CorpusCard[];
	added: number;
	filled: number;
	filledFuzzy: number;
	suppressed: number;
} {
	const baseSetIds = new Set(base.map((c) => c.setId));
	const merged = base.map((c) => ({ ...c }));

	// Pass 1: number-based fill.
	const bySetNum = new Map(
		overlay.map((o) => [setNumKey(o.setId, o.number), o]),
	);
	let filled = 0;
	for (const c of merged) {
		if (!needsImage(c)) continue;
		const ov = bySetNum.get(setNumKey(c.setId, c.number));
		if (ov) {
			c.imageUrl = ov.imageUrl;
			c.imageUrlSmall = ov.imageUrlSmall;
			filled++;
		}
	}

	// Pass 2: name/dex fill for old sets with no tcgcsv numbers (opt-in).
	let filledFuzzy = 0;
	if (opts.nameToDex?.size) {
		const bySet = new Map<string, CorpusCard[]>();
		for (const o of overlay)
			(bySet.get(o.setId) ?? bySet.set(o.setId, []).get(o.setId))?.push(o);
		for (const c of merged) {
			if (!needsImage(c)) continue;
			const ov = uniqueMatch(c, bySet.get(c.setId) ?? [], opts.nameToDex);
			if (ov) {
				c.imageUrl = ov.imageUrl;
				c.imageUrlSmall = ov.imageUrlSmall;
				filledFuzzy++;
			}
		}
	}

	// Pass 3: suppress the Western ptcg fallback on whatever is still imageless.
	let suppressed = 0;
	if (opts.suppressPtcgFallback) {
		for (const c of merged) {
			if (needsImage(c) && isPtcgFallback(c.imageUrl)) {
				c.imageUrl = "";
				c.imageUrlSmall = "";
				suppressed++;
			}
		}
	}

	// Pass 4: add cards for sets TCGdex has none of (empty sets).
	const seen = new Set(merged.map((c) => setNumKey(c.setId, c.number)));
	let added = 0;
	for (const ov of overlay) {
		const key = setNumKey(ov.setId, ov.number);
		if (!baseSetIds.has(ov.setId) && !seen.has(key)) {
			merged.push({ ...ov });
			seen.add(key);
			added++;
		}
	}
	return { merged, added, filled, filledFuzzy, suppressed };
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
	const nameToDex = await fetchNameToDex();
	const { merged, added, filled, filledFuzzy, suppressed } = mergeTcgcsvOverlay(
		existing,
		overlay,
		{ nameToDex, suppressPtcgFallback: true },
	);
	writeFileSync(out, gzipSync(Buffer.from(JSON.stringify(merged))));
	console.error(
		`merged: ${existing.length} existing + ${added} added + ${filled}+${filledFuzzy} images filled (${suppressed} fallbacks suppressed) -> ${merged.length} total -> ${out}`,
	);
}

if (import.meta.main) main();
