import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import type { CorpusCard, DetailCard } from "../src/store/corpus/corpus-types";
import { ptcgImageUrl, tcgdexCardToPtcg } from "./id-crosswalk";

const ORIGIN = "https://api.pokemontcg.io";
const PAGE_SIZE = 250;
const SELECT =
	"id,name,number,images,rarity,subtypes,supertype,types,set,nationalPokedexNumbers,tcgplayer," +
	"hp,evolvesFrom,abilities,attacks,rules,weaknesses,resistances,retreatCost,flavorText,artist";

const ASSET_PREFIX = "https://assets.tcgdex.net/en/";

export interface TcgdexCard {
	id: string;
	localId: string;
	name: string;
	category: "Pokemon" | "Trainer" | "Energy";
	image?: string; // host+lang+path, no extension; absent => no image
	rarity?: string;
	set: { id: string };
	dexId?: number[];
	types?: string[];
	stage?: string; // Pokemon: Basic | Stage1 | Stage2 | ...
	trainerType?: string; // Trainer subtype
	energyType?: string; // Energy subtype
	suffix?: string; // EX | V | VMAX | VSTAR | ... when present
	variants?: Partial<
		Record<"firstEdition" | "holo" | "normal" | "reverse" | "wPromo", boolean>
	>;
}

const CATEGORY_TO_SUPERTYPE: Record<TcgdexCard["category"], string> = {
	Pokemon: "Pokémon",
	Trainer: "Trainer",
	Energy: "Energy",
};

function subtypesOf(card: TcgdexCard): string[] | undefined {
	const out: string[] = [];
	if (card.stage) out.push(card.stage);
	if (card.trainerType) out.push(card.trainerType);
	if (card.energyType) out.push(card.energyType);
	if (card.suffix) out.push(card.suffix);
	return out.length ? out : undefined;
}

function variantsOf(card: TcgdexCard): string[] | undefined {
	if (!card.variants) return undefined;
	const keys = (
		["normal", "holo", "reverse", "firstEdition", "wPromo"] as const
	).filter((k) => card.variants?.[k]);
	return keys.length ? keys : undefined;
}

export function trimCard(card: TcgdexCard): CorpusCard {
	const out: CorpusCard = {
		id: card.id,
		name: card.name,
		supertype: CATEGORY_TO_SUPERTYPE[card.category],
		setId: card.set.id,
		number: card.localId,
		imageBase: null,
		imageUrl: "",
		imageUrlSmall: "",
	};
	if (card.image) {
		out.imageBase = card.image.startsWith(ASSET_PREFIX)
			? card.image.slice(ASSET_PREFIX.length) // "swsh/swsh3/136"
			: card.image;
		out.imageUrl = `${card.image}/high.webp`;
		out.imageUrlSmall = `${card.image}/low.webp`;
	} else {
		// No TCGdex image: bake a pokemontcg.io fallback from the translated id.
		const ptcgId = tcgdexCardToPtcg(card.id);
		const dash = ptcgId.indexOf("-");
		const { large, small } = ptcgImageUrl(
			ptcgId.slice(0, dash),
			ptcgId.slice(dash + 1),
		);
		out.imageUrl = large;
		out.imageUrlSmall = small;
	}
	if (card.rarity) out.rarity = card.rarity;
	const subtypes = subtypesOf(card);
	if (subtypes) out.subtypes = subtypes;
	if (card.types) out.types = card.types;
	if (card.dexId) out.nationalPokedexNumbers = card.dexId;
	const variants = variantsOf(card);
	if (variants) out.variants = variants;
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
