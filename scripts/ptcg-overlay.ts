export interface PtcgOverlayEntry {
	rarity?: string;
	subtypes?: string[];
}
export type PtcgOverlay = Map<string, PtcgOverlayEntry>;

interface PtcgCard {
	id: string;
	rarity?: string;
	subtypes?: string[];
}

const PTCG_BASE = process.env.PTCG_BASE ?? "https://api.pokemontcg.io/v2";
const PAGE_SIZE = 250;
const RETRIES = 3;
// pokemontcg.io throws gateway 504s mid-crawl. A single page's sustained failure
// must NOT discard the whole overlay (that shipped a TCGdex-only corpus with no
// holo/hi-res enrichment). Keep what crawled, skip the bad page, and only bail
// when the API is clearly down (this many pages fail in a row).
const MAX_CONSECUTIVE_FAILURES = 5;

async function fetchPage(
	fetchImpl: typeof fetch,
	page: number,
): Promise<PtcgCard[]> {
	const url = `${PTCG_BASE}/cards?select=id,rarity,subtypes&page=${page}&pageSize=${PAGE_SIZE}`;
	const headers: Record<string, string> = {};
	if (process.env.PTCG_API_KEY) headers["X-Api-Key"] = process.env.PTCG_API_KEY;
	for (let attempt = 0; ; attempt++) {
		const res = await fetchImpl(url, { headers });
		if (res.ok) return ((await res.json()) as { data: PtcgCard[] }).data;
		if (attempt >= RETRIES)
			throw new Error(`ptcg page ${page} failed: ${res.status}`);
		await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
	}
}

/**
 * Crawl every pokemontcg.io card (id + rarity + subtypes only) into a map keyed
 * by ptcg id. Image urls are NOT fetched — they are deterministic from the id
 * (id-crosswalk `fallbackImageUrl`), so map membership alone proves the ptcg
 * card (and thus its image) exists.
 */
export async function fetchPtcgOverlay(
	opts: { fetchImpl?: typeof fetch } = {},
): Promise<PtcgOverlay> {
	const fetchImpl = opts.fetchImpl ?? fetch;
	const out: PtcgOverlay = new Map();
	let consecutiveFailures = 0;
	let skippedPages = 0;
	for (let page = 1; ; page++) {
		let data: PtcgCard[];
		try {
			data = await fetchPage(fetchImpl, page);
		} catch (e) {
			// Keep the pages already crawled; skip this one and try the next. A
			// partial overlay still enriches most cards (mergePtcgOverlay keeps the
			// TCGdex values for the rest) — far better than throwing it all away.
			// Bail only when the API looks down (too many failures in a row).
			skippedPages++;
			consecutiveFailures++;
			console.warn(
				`  ↳ ptcg overlay: page ${page} failed (${(e as Error).message}); skipping, kept ${out.size} cards`,
			);
			if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
				console.warn(
					`  ↳ ptcg overlay: ${consecutiveFailures} pages failed in a row — stopping with a partial overlay (${out.size} cards, ${skippedPages} pages skipped)`,
				);
				break;
			}
			continue;
		}
		consecutiveFailures = 0;
		for (const c of data) {
			const entry: PtcgOverlayEntry = {};
			if (c.rarity != null) entry.rarity = c.rarity;
			if (c.subtypes != null) entry.subtypes = c.subtypes;
			out.set(c.id, entry);
		}
		if (data.length < PAGE_SIZE) break;
	}
	if (skippedPages > 0)
		console.warn(
			`  ↳ ptcg overlay: crawled with ${skippedPages} page(s) skipped → ${out.size} cards enriched (partial)`,
		);
	return out;
}
