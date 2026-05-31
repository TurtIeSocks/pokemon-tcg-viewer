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
	opts: {
		retries?: number;
		baseMs?: number;
		onRetry?: (
			page: number,
			attempt: number,
			reason: string,
			waitMs: number,
		) => void;
	} = {},
): Promise<{ data: ApiCard[]; totalCount: number }> {
	const retries = opts.retries ?? 4;
	const baseMs = opts.baseMs ?? 1000;
	const url = `${ORIGIN}/v2/cards?select=${SELECT}&orderBy=set.releaseDate,number&page=${page}&pageSize=${PAGE_SIZE}`;
	let lastErr = "";
	for (let attempt = 0; attempt <= retries; attempt++) {
		if (attempt > 0) {
			const waitMs = baseMs * 2 ** (attempt - 1);
			opts.onRetry?.(page, attempt, lastErr, waitMs);
			await new Promise((r) => setTimeout(r, waitMs));
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
	const onRetry = (
		page: number,
		attempt: number,
		reason: string,
		waitMs: number,
	) =>
		console.warn(
			`  ↳ page ${page}: ${reason} — retry ${attempt} in ${waitMs}ms`,
		);

	const first = await fetchPage(apiKey, 1, { onRetry });
	const total = first.totalCount;
	const pages = Math.ceil(total / PAGE_SIZE);
	console.log(
		`Crawling ${total} cards across ${pages} pages (pageSize ${PAGE_SIZE})…`,
	);
	const cards: CorpusCard[] = first.data.map(trimCard);
	console.log(`  page 1/${pages} ✓ — ${cards.length} cards so far`);
	for (let p = 2; p <= pages; p++) {
		// Be gentle with the rate-limited origin between pages.
		await new Promise((r) => setTimeout(r, 250));
		const { data } = await fetchPage(apiKey, p, { onRetry });
		for (const c of data) cards.push(trimCard(c));
		console.log(`  page ${p}/${pages} ✓ — ${cards.length} cards so far`);
	}
	if (cards.length < total * 0.95) {
		throw new Error(`crawl incomplete: got ${cards.length} of ${total}`);
	}
	console.log(`Crawl complete: ${cards.length} cards.`);
	return cards;
}

// Entrypoint: `bun run scripts/build-corpus.ts <outfile>`
if (import.meta.main) {
	const apiKey = process.env.POKEMONTCG_API_KEY;
	if (!apiKey) throw new Error("POKEMONTCG_API_KEY not set");
	const outfile = process.argv[2] ?? "corpus.json.gz";
	const startedAt = Date.now();
	const cards = await buildCorpus(apiKey);
	console.log("Gzipping…");
	const gz = gzipSync(Buffer.from(JSON.stringify(cards)));
	await Bun.write(outfile, gz);
	const mb = (gz.length / 1024 / 1024).toFixed(2);
	const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
	console.log(
		`Wrote ${cards.length} cards → ${outfile} (${mb} MB gzipped) in ${secs}s`,
	);
}
