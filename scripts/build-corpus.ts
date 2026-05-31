import { gzipSync } from "node:zlib";
import type { CorpusCard } from "../src/store/corpus/corpus-types";

const ORIGIN = "https://api.pokemontcg.io";
const PAGE_SIZE = 250;
const SELECT =
	"id,name,number,images,rarity,subtypes,supertype,types,set,nationalPokedexNumbers,tcgplayer";

interface ApiCard {
	id: string;
	name: string;
	number: string;
	supertype: string;
	subtypes?: string[];
	rarity?: string;
	types?: string[];
	nationalPokedexNumbers?: number[];
	set: { id: string };
	images: { small: string; large: string };
	tcgplayer?: { prices?: Record<string, unknown> };
}

export function trimCard(card: ApiCard): CorpusCard {
	const out: CorpusCard = {
		id: card.id,
		name: card.name,
		imageUrl: card.images.large,
		imageUrlSmall: card.images.small,
		supertype: card.supertype,
		setId: card.set.id,
		number: card.number,
	};
	if (card.rarity) out.rarity = card.rarity;
	if (card.subtypes) out.subtypes = card.subtypes;
	if (card.types) out.types = card.types;
	if (card.nationalPokedexNumbers)
		out.nationalPokedexNumbers = card.nationalPokedexNumbers;
	if (card.tcgplayer?.prices) out.variants = Object.keys(card.tcgplayer.prices);
	return out;
}

// The pokemontcg.io origin is slow and intermittently returns transient errors
// (observed: a 404 on page 13 mid-crawl, while that page reliably returns 200 on
// retry — a genuinely out-of-range page returns 200 with empty data, never 404).
// So retry every non-OK status with exponential backoff; only auth failures
// (401/403) are treated as permanent.
class NonRetryableError extends Error {}

function isRetryable(status: number): boolean {
	return status !== 401 && status !== 403;
}

export async function fetchPage(
	apiKey: string,
	page: number,
	opts: { retries?: number; baseMs?: number } = {},
): Promise<{ data: ApiCard[]; totalCount: number }> {
	const retries = opts.retries ?? 4;
	const baseMs = opts.baseMs ?? 1000;
	const url = `${ORIGIN}/v2/cards?select=${SELECT}&orderBy=set.releaseDate,number&page=${page}&pageSize=${PAGE_SIZE}`;
	let lastErr = "";
	for (let attempt = 0; attempt <= retries; attempt++) {
		if (attempt > 0) {
			await new Promise((r) => setTimeout(r, baseMs * 2 ** (attempt - 1)));
		}
		try {
			const res = await fetch(url, { headers: { "X-Api-Key": apiKey } });
			if (res.ok) {
				return (await res.json()) as { data: ApiCard[]; totalCount: number };
			}
			if (!isRetryable(res.status)) {
				throw new NonRetryableError(`page ${page}: HTTP ${res.status}`);
			}
			lastErr = `HTTP ${res.status}`;
		} catch (e) {
			if (e instanceof NonRetryableError) throw e;
			lastErr = e instanceof Error ? e.message : String(e);
		}
	}
	throw new Error(
		`page ${page} failed after ${retries + 1} attempts: ${lastErr}`,
	);
}

export async function buildCorpus(apiKey: string): Promise<CorpusCard[]> {
	const first = await fetchPage(apiKey, 1);
	const total = first.totalCount;
	const pages = Math.ceil(total / PAGE_SIZE);
	const cards: CorpusCard[] = first.data.map(trimCard);
	for (let p = 2; p <= pages; p++) {
		// Be gentle with the rate-limited origin between pages.
		await new Promise((r) => setTimeout(r, 250));
		const { data } = await fetchPage(apiKey, p);
		for (const c of data) cards.push(trimCard(c));
	}
	if (cards.length < total * 0.95) {
		throw new Error(`crawl incomplete: got ${cards.length} of ${total}`);
	}
	return cards;
}

// Entrypoint: `bun run scripts/build-corpus.ts <outfile>`
if (import.meta.main) {
	const apiKey = process.env.POKEMONTCG_API_KEY;
	if (!apiKey) throw new Error("POKEMONTCG_API_KEY not set");
	const outfile = process.argv[2] ?? "corpus.json.gz";
	const cards = await buildCorpus(apiKey);
	const gz = gzipSync(Buffer.from(JSON.stringify(cards)));
	await Bun.write(outfile, gz);
	console.log(`wrote ${cards.length} cards → ${outfile} (${gz.length} bytes)`);
}
