import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import type { CorpusCard, DetailCard } from "../src/store/corpus/corpus-types";

const ORIGIN = "https://api.pokemontcg.io";
const PAGE_SIZE = 250;
const SELECT =
	"id,name,number,images,rarity,subtypes,supertype,types,set,nationalPokedexNumbers,tcgplayer," +
	"hp,evolvesFrom,abilities,attacks,rules,weaknesses,resistances,retreatCost,flavorText,artist";

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
	hp?: string;
	evolvesFrom?: string;
	abilities?: { name: string; text: string; type: string }[];
	attacks?: {
		name: string;
		cost?: string[];
		convertedEnergyCost?: number;
		damage?: string;
		text?: string;
	}[];
	rules?: string[];
	weaknesses?: { type: string; value: string }[];
	resistances?: { type: string; value: string }[];
	retreatCost?: string[];
	flavorText?: string;
	artist?: string;
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

export type DetailRecord = { id: string } & DetailCard;

/** Extract the offline detail record for a card (battle/flavor fields, no prices). */
export function detailCard(card: ApiCard): DetailRecord {
	const out: DetailRecord = { id: card.id };
	if (card.hp) out.hp = card.hp;
	if (card.evolvesFrom) out.evolvesFrom = card.evolvesFrom;
	if (card.abilities)
		out.abilities = card.abilities.map((a) => ({
			name: a.name,
			text: a.text,
			type: a.type,
		}));
	if (card.attacks)
		out.attacks = card.attacks.map((a) => ({
			name: a.name,
			cost: a.cost,
			damage: a.damage,
			text: a.text,
		}));
	if (card.rules) out.rules = card.rules;
	if (card.weaknesses) out.weaknesses = card.weaknesses;
	if (card.resistances) out.resistances = card.resistances;
	if (card.retreatCost) out.retreatCost = card.retreatCost;
	if (card.flavorText) out.flavorText = card.flavorText;
	if (card.artist) out.artist = card.artist;
	// JSON.parse(JSON.stringify) drops any keys that ended up undefined.
	return JSON.parse(JSON.stringify(out));
}

/** Content hash of the canonical detail array (sorted by id). Independent of gzip. */
export function detailVersion(records: DetailRecord[]): string {
	const sorted = [...records].sort((a, b) => a.id.localeCompare(b.id));
	return createHash("sha256").update(JSON.stringify(sorted)).digest("hex");
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

export async function buildCorpus(apiKey: string): Promise<ApiCard[]> {
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
	const cards: ApiCard[] = [...first.data];
	console.log(`  page 1/${pages} ✓ — ${cards.length} cards so far`);
	for (let p = 2; p <= pages; p++) {
		// Be gentle with the rate-limited origin between pages.
		await new Promise((r) => setTimeout(r, 250));
		const { data } = await fetchPage(apiKey, p, { onRetry });
		for (const c of data) cards.push(c);
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
	const raw = await buildCorpus(apiKey);

	const trimmed = raw.map(trimCard);
	const detail = raw.map(detailCard).sort((a, b) => a.id.localeCompare(b.id));
	const version = detailVersion(detail);

	const gz = gzipSync(Buffer.from(JSON.stringify(trimmed)));
	const detailGz = gzipSync(Buffer.from(JSON.stringify(detail)));
	const meta = {
		version,
		count: detail.length,
		builtAt: new Date().toISOString(),
	};

	await Bun.write(outfile, gz);
	await Bun.write("corpus-detail.json.gz", detailGz);
	await Bun.write("corpus-detail.meta.json", JSON.stringify(meta));

	const mb = (gz.length / 1024 / 1024).toFixed(2);
	const dmb = (detailGz.length / 1024 / 1024).toFixed(2);
	const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
	console.log(
		`Wrote ${trimmed.length} cards → ${outfile} (${mb} MB) + detail (${dmb} MB, v${version.slice(0, 8)}) in ${secs}s`,
	);
}
