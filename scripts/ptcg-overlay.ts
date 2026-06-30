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
	for (let page = 1; ; page++) {
		const data = await fetchPage(fetchImpl, page);
		for (const c of data)
			out.set(c.id, { rarity: c.rarity, subtypes: c.subtypes });
		if (data.length < PAGE_SIZE) break;
	}
	return out;
}
