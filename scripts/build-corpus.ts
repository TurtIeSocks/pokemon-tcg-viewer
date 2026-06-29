import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import type { CorpusCard, DetailCard } from "../src/store/corpus/corpus-types";
import {
	ptcgImageUrl,
	tcgdexCardToPtcg,
	tcgdexSetToPtcg,
} from "./id-crosswalk";

const ASSET_PREFIX = "https://assets.tcgdex.net/en/";

const TCGDEX_BASE = process.env.TCGDEX_BASE ?? "https://api.tcgdex.net/v2/en";

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

/** Extract the offline detail record from a TCGdex card (battle/flavor fields, no prices). */
export function detailCard(
	card: TcgdexCard & {
		hp?: string;
		evolveFrom?: string;
		abilities?: { name: string; effect: string; type: string }[];
		attacks?: {
			name: string;
			cost?: string[];
			damage?: string;
			effect?: string;
		}[];
		effect?: string;
		weaknesses?: { type: string; value: string }[];
		resistances?: { type: string; value: string }[];
		retreat?: number;
		description?: string;
		illustrator?: string;
	},
): DetailRecord {
	const out: DetailRecord = { id: card.id };
	if (card.hp) out.hp = card.hp;
	if (card.evolveFrom) out.evolvesFrom = card.evolveFrom;
	if (card.abilities)
		out.abilities = card.abilities.map((a) => ({
			name: a.name,
			text: a.effect,
			type: a.type,
		}));
	if (card.attacks)
		out.attacks = card.attacks.map((a) => ({
			name: a.name,
			cost: a.cost,
			damage: a.damage,
			text: a.effect,
		}));
	if (card.weaknesses) out.weaknesses = card.weaknesses;
	if (card.resistances) out.resistances = card.resistances;
	if (typeof card.retreat === "number")
		out.retreatCost = Array(card.retreat).fill("Colorless");
	if (card.description) out.flavorText = card.description;
	if (card.illustrator) out.artist = card.illustrator;
	// JSON.parse(JSON.stringify) drops any keys that ended up undefined.
	return JSON.parse(JSON.stringify(out));
}

/** Content hash of the canonical detail array (sorted by id). Independent of gzip. */
export function detailVersion(records: DetailRecord[]): string {
	const sorted = [...records].sort((a, b) => a.id.localeCompare(b.id));
	return createHash("sha256").update(JSON.stringify(sorted)).digest("hex");
}

export interface GapLog {
	images: Array<{ id: string; reason: "tcgdex-missing" | "no-fallback" }>;
	// "no-fallback" is reserved for a future build-time HEAD-probe of the pokemontcg.io fallback URL and is not emitted yet.
}

/** Collect cards whose TCGdex image field is absent. */
export function collectGaps(cards: TcgdexCard[]): GapLog {
	const images: GapLog["images"] = [];
	for (const c of cards)
		if (!c.image) images.push({ id: c.id, reason: "tcgdex-missing" });
	return { images };
}

// Only 401/403 are non-retryable; everything else (network hiccups, 5xx, transient 404) is retried.
class NonRetryableError extends Error {}

function isRetryable(status: number): boolean {
	return status !== 401 && status !== 403;
}

export async function fetchJson(
	url: string,
	opts: {
		retries?: number;
		baseMs?: number;
		onRetry?: (
			url: string,
			attempt: number,
			reason: string,
			waitMs: number,
		) => void;
	} = {},
): Promise<unknown> {
	const retries = opts.retries ?? 4;
	const baseMs = opts.baseMs ?? 1000;
	let lastErr = "";
	for (let attempt = 0; attempt <= retries; attempt++) {
		if (attempt > 0) {
			const waitMs = baseMs * 2 ** (attempt - 1);
			opts.onRetry?.(url, attempt, lastErr, waitMs);
			await new Promise((r) => setTimeout(r, waitMs));
		}
		try {
			const res = await fetch(url);
			if (res.ok) return await res.json();
			if (!isRetryable(res.status)) {
				throw new NonRetryableError(`${url}: HTTP ${res.status}`);
			}
			lastErr = `HTTP ${res.status}`;
		} catch (e) {
			if (e instanceof NonRetryableError) throw e;
			lastErr = e instanceof Error ? e.message : String(e);
		}
	}
	throw new Error(`${url} failed after ${retries + 1} attempts: ${lastErr}`);
}

export async function buildCorpus(): Promise<TcgdexCard[]> {
	const onRetry = (
		url: string,
		attempt: number,
		reason: string,
		waitMs: number,
	) => console.warn(`  ↳ ${url}: ${reason} — retry ${attempt} in ${waitMs}ms`);

	const sets = (await fetchJson(`${TCGDEX_BASE}/sets`, { onRetry })) as {
		id: string;
		cardCount: { total: number };
	}[];
	const expected = sets.reduce((n, s) => n + s.cardCount.total, 0);
	console.log(`Crawling ~${expected} cards across ${sets.length} sets…`);

	// Validate crosswalk: warn on divergent mappings we don't know about.
	for (const s of sets) {
		const mapped = tcgdexSetToPtcg(s.id);
		if (mapped !== s.id) {
			// tcgdexSetToPtcg translates tcgdex→ptcg; if the key equals the value it's identity.
			// Here we're iterating tcgdex set ids; warn if the reverse lookup diverges unexpectedly.
			console.warn(
				`crosswalk: tcgdex set "${s.id}" maps to ptcg "${mapped}" (divergent)`,
			);
		}
	}

	const cards: TcgdexCard[] = [];
	for (let i = 0; i < sets.length; i++) {
		const s = sets[i];
		const full = (await fetchJson(`${TCGDEX_BASE}/sets/${s.id}`, {
			onRetry,
		})) as {
			cards: TcgdexCard[];
		};
		for (const c of full.cards) cards.push({ ...c, set: { id: s.id } });
		console.log(
			`  set ${i + 1}/${sets.length} ${s.id} ✓ — ${cards.length} cards so far`,
		);
		await new Promise((r) => setTimeout(r, 100));
	}

	if (cards.length < expected * 0.95)
		throw new Error(`crawl incomplete: ${cards.length} of ~${expected}`);
	console.log(`Crawl complete: ${cards.length} cards.`);
	return cards;
}

// Entrypoint: `bun run scripts/build-corpus.ts <outfile>`
if (import.meta.main) {
	const outfile = process.argv[2] ?? "corpus.json.gz";
	const startedAt = Date.now();
	const raw = await buildCorpus();

	const trimmed = raw.map(trimCard);
	const detail = raw.map(detailCard).sort((a, b) => a.id.localeCompare(b.id));
	const version = detailVersion(detail);
	const gaps = collectGaps(raw);

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
	await Bun.write("corpus-gap.json", JSON.stringify(gaps));

	const mb = (gz.length / 1024 / 1024).toFixed(2);
	const dmb = (detailGz.length / 1024 / 1024).toFixed(2);
	const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
	console.log(
		`Wrote ${trimmed.length} cards → ${outfile} (${mb} MB) + detail (${dmb} MB, v${version.slice(0, 8)}) in ${secs}s`,
	);
	console.log(`Gap log: ${gaps.images.length} cards without a TCGdex image`);
}
