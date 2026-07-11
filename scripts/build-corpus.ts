import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import {
	fallbackImageUrl,
	tcgdexSetToPtcg,
} from "../src/lib/corpus/id-crosswalk";
import type { PriceIdEntry, PriceIdsMap } from "../src/lib/corpus/price-types";
import {
	subtypesFromTcgdex,
	supertypeFromCategory,
} from "../src/lib/corpus/tcgdex-card-fields";
import type { CorpusCard, DetailCard } from "../src/store/corpus/corpus-types";
import { mergePtcgOverlay } from "./merge-overlay";
import { fetchPtcgOverlay } from "./ptcg-overlay";
import { harvestTcgcsvTpIds, mergeTpIds } from "./tcgcsv-tp-harvest";

const PTCG_HOST = "https://images.pokemontcg.io/";

const TCGDEX_BASE = process.env.TCGDEX_BASE ?? "https://api.tcgdex.net/v2/en";

// The self-hosted TCGdex mirror (TCGDEX_BASE in CI) serves the card catalog but
// does NOT populate the live `pricing` block, so the marketplace-id crosswalk is
// harvested separately from the OFFICIAL API, which does. Kept distinct from
// TCGDEX_BASE precisely so the CI mirror override never points the harvest at a
// pricing-less source. Override with TCGDEX_PRICING_BASE for local/preview.
const TCGDEX_OFFICIAL_BASE =
	process.env.TCGDEX_PRICING_BASE ?? "https://api.tcgdex.net/v2/en";
const PRICE_HARVEST_CONCURRENCY = 8;
// Bun's fetch sends NO default User-Agent, and some upstreams (notably tcgcsv)
// return 401 for an empty UA. Identify ourselves on every request so those
// sources serve us and we stay a polite citizen everywhere else.
const DEFAULT_UA =
	"cardstack-bot/1.0 (+https://github.com/TurtIeSocks/pokemon-tcg-viewer)";

/**
 * Derive the per-region TCGdex API base by swapping the trailing "/en" of
 * TCGDEX_BASE for "/{baseLang}" (mirrors `langBase()` in build-i18n.ts). The
 * public "https://api.tcgdex.net/v2/en" becomes "…/v2/ja" for the Asian
 * catalog (the id superset region). Defaults to "en" so today's behavior is
 * preserved byte-for-byte when `baseLang` is unset.
 */
export function baseUrlFor(
	baseLang: string,
	base: string = TCGDEX_BASE,
): string {
	return base.replace(/\/en$/, `/${baseLang}`);
}

/** Asset CDN prefix for a given base lang, e.g. "https://assets.tcgdex.net/ja/". */
export function assetPrefixFor(baseLang: string): string {
	return `https://assets.tcgdex.net/${baseLang}/`;
}

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
	// Full-card fields (populated by per-card fetch in buildCorpus; absent on brief set-list cards).
	hp?: number | string;
	evolveFrom?: string;
	abilities?: { name: string; effect: string; type: string }[];
	attacks?: {
		name: string;
		cost?: string[];
		damage?: number | string;
		effect?: string;
	}[];
	effect?: string;
	weaknesses?: { type: string; value: string }[];
	resistances?: { type: string; value: string }[];
	retreat?: number;
	description?: string;
	illustrator?: string;
	// Live marketplace pricing attached by the TCGdex server (present when the
	// mirror's price providers loaded; see build-prices pipeline). Only the
	// product ids are harvested at build time — prices themselves come from the
	// marketplaces' bulk feeds in scripts/build-prices.ts.
	pricing?: {
		cardmarket?: { idProduct?: number } | null;
		tcgplayer?:
			| ({ unit?: string; updated?: string } & Record<string, unknown>)
			| null;
	} | null;
}

function variantsOf(card: TcgdexCard): string[] | undefined {
	if (!card.variants) return undefined;
	const keys = (
		["normal", "holo", "reverse", "firstEdition", "wPromo"] as const
	).filter((k) => card.variants?.[k]);
	return keys.length ? keys : undefined;
}

export function trimCard(card: TcgdexCard, baseLang = "en"): CorpusCard {
	const assetPrefix = assetPrefixFor(baseLang);
	const out: CorpusCard = {
		id: card.id,
		name: card.name,
		supertype: supertypeFromCategory(card.category),
		setId: card.set.id,
		number: card.localId,
		imageBase: null,
		imageUrl: "",
		imageUrlSmall: "",
	};
	if (card.image) {
		out.imageBase = card.image.startsWith(assetPrefix)
			? card.image.slice(assetPrefix.length) // "swsh/swsh3/136"
			: card.image;
		out.imageUrl = `${card.image}/high.webp`;
		out.imageUrlSmall = `${card.image}/low.webp`;
	} else {
		// No TCGdex image. Bake the shared pokemontcg.io fallback (override or
		// constructed). The same helper feeds the live detail mapper, so the grid
		// and the detail view resolve identical fallback URLs.
		const { large, small } = fallbackImageUrl(card.id);
		out.imageUrl = large;
		out.imageUrlSmall = small;
	}
	if (card.rarity) out.rarity = card.rarity;
	const subtypes = subtypesFromTcgdex(card);
	if (subtypes) out.subtypes = subtypes;
	if (card.types) out.types = card.types;
	if (card.dexId) out.nationalPokedexNumbers = card.dexId;
	const variants = variantsOf(card);
	if (variants) out.variants = variants;
	return out;
}

export type DetailRecord = { id: string } & DetailCard;

/** Extract the offline detail record from a TCGdex card (battle/flavor fields, no prices). */
export function detailCard(card: TcgdexCard): DetailRecord {
	const out: DetailRecord = { id: card.id };
	// Coerce hp/damage to string — the TCGdex API returns numbers for these fields
	// even though our DetailCard types model them as strings.
	if (card.hp != null) out.hp = String(card.hp);
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
			// Coerce damage to string for the same reason as hp above.
			damage: a.damage != null ? String(a.damage) : undefined,
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

/**
 * Extract the marketplace product ids from a card's live pricing block.
 * tcgplayer finish blocks share one productId per card (the finish lives in
 * the marketplace's subtype axis), so the first block's id is THE id.
 */
export function priceIdsOf(card: TcgdexCard): PriceIdEntry | null {
	const cm = card.pricing?.cardmarket?.idProduct ?? null;
	let tp: number | null = null;
	const block = card.pricing?.tcgplayer;
	if (block) {
		for (const v of Object.values(block)) {
			if (v && typeof v === "object") {
				const pid = (v as { productId?: unknown }).productId;
				if (typeof pid === "number") {
					tp = pid;
					break;
				}
			}
		}
	}
	return cm === null && tp === null ? null : [cm, tp];
}

/**
 * Coverage floor below which the harvested crosswalk is treated as broken and
 * the build refuses to overwrite the good one. EN pricing coverage on TCGdex is
 * near-total (~90%+), so a strict floor catches the "mirror served no pricing →
 * 0 ids" failure with huge margin. JA cards are largely absent from TCGplayer
 * and only partly listed on Cardmarket, so its floor only catches a total
 * wipeout. Override with CROSSWALK_MIN_COVERAGE (a 0..1 fraction).
 */
export function defaultCrosswalkFloor(baseLang: string): number {
	const env = process.env.CROSSWALK_MIN_COVERAGE;
	if (env !== undefined) {
		const n = Number(env);
		if (Number.isFinite(n)) return n;
	}
	return baseLang === "en" ? 0.5 : 0.02;
}

/**
 * Guard: throw when the harvested crosswalk covers too few cards to trust.
 * Runs before any output file is written, so a harvest failure keep-last-goods
 * the whole run (nothing uploads) instead of silently shipping an empty
 * crosswalk that only breaks the downstream daily price build.
 */
export function assertCrosswalkOk(
	mapped: number,
	total: number,
	baseLang: string,
	floor: number = defaultCrosswalkFloor(baseLang),
): void {
	const coverage = total > 0 ? mapped / total : 0;
	if (coverage < floor) {
		throw new Error(
			`[${baseLang}] price crosswalk suspiciously sparse: ${mapped}/${total} cards carry marketplace ids (${(coverage * 100).toFixed(1)}%, floor ${(floor * 100).toFixed(0)}%). Refusing to overwrite the good crosswalk. The self-hosted mirror does not serve pricing — the harvest must hit the official api.tcgdex.net (TCGDEX_PRICING_BASE).`,
		);
	}
}

/**
 * Harvest the cardId → [cardmarketId, tcgplayerId] crosswalk from the OFFICIAL
 * TCGdex API. The self-hosted mirror the corpus crawl runs against serves no
 * `pricing` block, so this pass hits api.tcgdex.net directly: one full-card GET
 * per id, which is the ONLY endpoint that carries pricing (set-list briefs omit
 * it, and there is no bulk prices endpoint). Politely throttled and
 * UA-identified. A single unfetchable card yields no entry rather than aborting
 * the whole harvest. `fetchCard` is injectable so tests run without network.
 */
export async function harvestPriceIds(
	ids: string[],
	baseLang: string,
	opts: {
		officialBase?: string;
		concurrency?: number;
		onRetry?: (
			url: string,
			attempt: number,
			reason: string,
			waitMs: number,
		) => void;
		fetchCard?: (url: string) => Promise<unknown>;
	} = {},
): Promise<PriceIdsMap> {
	const base = baseUrlFor(baseLang, opts.officialBase ?? TCGDEX_OFFICIAL_BASE);
	const concurrency = opts.concurrency ?? PRICE_HARVEST_CONCURRENCY;
	const fetchCard =
		opts.fetchCard ??
		((url: string) => fetchJson(url, { onRetry: opts.onRetry, retries: 2 }));
	console.log(
		`Harvesting price crosswalk for ${ids.length} cards from ${base} (concurrency=${concurrency})…`,
	);
	let done = 0;
	const entries = await pLimit(
		ids.map((id) => async () => {
			let entry: PriceIdEntry | null = null;
			try {
				const card = (await fetchCard(
					`${base}/cards/${encodeURIComponent(id)}`,
				)) as TcgdexCard;
				entry = priceIdsOf(card);
			} catch {
				// A single unfetchable card must not abort a 23k-card harvest.
			}
			done++;
			if (done % 500 === 0 || done === ids.length) {
				console.log(`  …${done}/${ids.length} pricing records harvested`);
			}
			return [id, entry] as const;
		}),
		concurrency,
	);
	const map: PriceIdsMap = {};
	for (const [id, entry] of entries) if (entry) map[id] = entry;
	return map;
}

export interface GapLog {
	images: Array<{ id: string; reason: "tcgdex-missing" | "no-fallback" }>;
	// "tcgdex-missing": no TCGdex image (collectGaps).
	// "no-fallback": the baked pokemontcg.io fallback URL HEAD-probed dead (resolveFallbackImages).
}

/** Collect cards whose TCGdex image field is absent. */
export function collectGaps(cards: TcgdexCard[]): GapLog {
	const images: GapLog["images"] = [];
	for (const c of cards)
		if (!c.image) images.push({ id: c.id, reason: "tcgdex-missing" });
	return { images };
}

export type HeadFetch = (url: string) => Promise<Response>;

const FALLBACK_PROBE_CONCURRENCY = 20;

/**
 * HEAD-probe every card whose imageUrl points at the pokemontcg.io CDN to learn
 * whether the baked fallback actually resolves. A dead URL returns HTTP 404 with
 * a placeholder body, so `res.ok` — not body presence — is the reliable signal.
 *
 * When a probe is not ok, the URL is blanked (imageUrl/imageUrlSmall = "") and a
 * `{ reason: "no-fallback" }` gap is recorded. Live URLs are kept. TCGdex-hosted
 * images are never probed. `headFetch` is injectable so tests run without network.
 */
export async function resolveFallbackImages(
	cards: CorpusCard[],
	headFetch: HeadFetch = (url) => fetch(url, { method: "HEAD" }),
	baseLang = "en",
): Promise<GapLog["images"]> {
	const assetPrefix = assetPrefixFor(baseLang);
	const targets = cards.filter((c) => c.imageUrl.startsWith(PTCG_HOST));
	const dead = new Array<boolean>(targets.length);
	await pLimit(
		targets.map((card, i) => async () => {
			try {
				const res = await headFetch(card.imageUrl);
				dead[i] = !res.ok;
			} catch {
				dead[i] = true;
			}
		}),
		FALLBACK_PROBE_CONCURRENCY,
	);
	const gaps: GapLog["images"] = [];
	for (let i = 0; i < targets.length; i++) {
		if (!dead[i]) continue;
		const card = targets[i];
		if (card.imageBase) {
			// The preferred pokemontcg.io image is dead, but TCGdex has one (a
			// crosswalk HIT whose EN image we overrode to ptcg.io). Restore the
			// TCGdex url from imageBase instead of blanking, so a HIT never loses a
			// good TCGdex image. Not a gap — TCGdex covers it.
			card.imageUrl = `${assetPrefix}${card.imageBase}/high.webp`;
			card.imageUrlSmall = `${assetPrefix}${card.imageBase}/low.webp`;
			continue;
		}
		card.imageUrl = "";
		card.imageUrlSmall = "";
		gaps.push({ id: card.id, reason: "no-fallback" });
	}
	return gaps;
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
		headers?: Record<string, string>;
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
			const res = await fetch(url, {
				headers: { "User-Agent": DEFAULT_UA, ...opts.headers },
			});
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

/**
 * Run `tasks` with at most `concurrency` in flight at any time.
 * Returns all results in the original order.
 */
export async function pLimit<T>(
	tasks: (() => Promise<T>)[],
	concurrency: number,
): Promise<T[]> {
	const results: T[] = new Array(tasks.length);
	let next = 0;
	async function worker() {
		while (next < tasks.length) {
			const i = next++;
			results[i] = await tasks[i]();
		}
	}
	await Promise.all(Array.from({ length: concurrency }, worker));
	return results;
}

/**
 * Fetch the full corpus of TCGdex cards.
 *
 * Strategy:
 *  1. List all sets to determine the expected card count.
 *  2. Fetch each set's brief card list to get the card ids.
 *  3. Fetch each FULL card record via `GET /cards/{id}` so that
 *     `category`, `rarity`, `types`, `variants`, `stage`, `dexId`, `hp`,
 *     `attacks`, etc. are all populated. Brief set-list cards only carry
 *     `{id, image, localId, name}` — the per-card endpoint has the complete shape.
 *     Up to CARD_FETCH_CONCURRENCY requests are in flight simultaneously against
 *     the local TCGdex Docker mirror (TCGDEX_BASE), which handles the load fine.
 */
const CARD_FETCH_CONCURRENCY = 15;

export interface BuildCorpusOpts {
	/** Region base language; defaults to "en" and preserves today's behavior. */
	baseLang?: string;
}

export async function buildCorpus(
	opts: BuildCorpusOpts = {},
): Promise<TcgdexCard[]> {
	const baseLang = opts.baseLang ?? "en";
	const base = baseUrlFor(baseLang);
	const onRetry = (
		url: string,
		attempt: number,
		reason: string,
		waitMs: number,
	) => console.warn(`  ↳ ${url}: ${reason} — retry ${attempt} in ${waitMs}ms`);

	const sets = (await fetchJson(`${base}/sets`, { onRetry })) as {
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

	// Phase 1: collect brief card stubs from each set endpoint. We keep the brief
	// fields (localId/name/image) so Phase 2 can fall back to them when the per-card
	// endpoint 404s (TCGdex lists some cards in a set that it can't serve per-card).
	const briefCards: {
		id: string;
		setId: string;
		localId?: string;
		name?: string;
		image?: string;
	}[] = [];
	for (let i = 0; i < sets.length; i++) {
		const s = sets[i];
		// Encode the id: JP-lineage set ids contain "+" (e.g. SM1+, SM3+) that is
		// otherwise mangled in the path and 404s. And a single unfetchable set must
		// not abort the whole crawl (fetchJson throws after its retries), so skip it
		// with a warning — the validation gate below still catches a broken crawl.
		let setData: {
			cards: { id: string; localId?: string; name?: string; image?: string }[];
		};
		try {
			setData = (await fetchJson(`${base}/sets/${encodeURIComponent(s.id)}`, {
				onRetry,
			})) as typeof setData;
		} catch (e) {
			console.warn(
				`  ↳ skipping set "${s.id}": ${e instanceof Error ? e.message : String(e)}`,
			);
			continue;
		}
		for (const c of setData.cards)
			briefCards.push({
				id: c.id,
				setId: s.id,
				localId: c.localId,
				name: c.name,
				image: c.image,
			});
		console.log(
			`  set ${i + 1}/${sets.length} ${s.id} ✓ — ${briefCards.length} stubs so far`,
		);
		await new Promise((r) => setTimeout(r, 100));
	}

	// Build-validation gate. `expected` sums each set's declared cardCount, but a
	// region can be legitimately PARTIAL: many JP promo/sub sets report a count
	// yet list no per-card data (empty `set.cards[]`), so the real browsable JP
	// catalog is well under its declared total. Only a CATASTROPHIC shortfall
	// (mirror serving empty cards[] for ~everything) is fatal; a merely-partial
	// crawl warns and proceeds. SKIP_CARD_COUNT_GATE overrides for local/preview.
	const ratio = expected > 0 ? briefCards.length / expected : 1;
	if (!process.env.SKIP_CARD_COUNT_GATE && briefCards.length < 0.1 * expected) {
		throw new Error(
			`[${baseLang}] corpus crawl catastrophically short — mirror set.cards[] likely empty (${briefCards.length} of ~${expected}, ${(ratio * 100).toFixed(0)}%)`,
		);
	}
	if (ratio < 0.8) {
		console.warn(
			`[${baseLang}] partial crawl: ${briefCards.length} of ~${expected} expected cards (${(ratio * 100).toFixed(0)}%) — many sets declare a cardCount but list no per-card data`,
		);
	}

	// Phase 2: fetch each full card record (the only source of rarity/types/variants/hp/attacks/…).
	// Uses CARD_FETCH_CONCURRENCY concurrent requests against the local TCGdex Docker mirror.
	console.log(
		`Fetching ${briefCards.length} full card records (concurrency=${CARD_FETCH_CONCURRENCY})…`,
	);
	let fetched = 0;
	let fallbacks = 0;
	const cards = await pLimit(
		briefCards.map((stub) => async () => {
			let full: TcgdexCard;
			try {
				full = (await fetchJson(
					`${base}/cards/${encodeURIComponent(stub.id)}`,
					{ onRetry, retries: 2 },
				)) as TcgdexCard;
			} catch {
				// TCGdex lists some cards in a set whose per-card endpoint 404s (a real
				// data inconsistency — e.g. the Unown "?"/"!" cards in `exu`). One such
				// card must not abort a 23k-card crawl: fall back to the brief stub.
				// category defaults to "Pokemon" (these are Pokémon promos) so the
				// required supertype stays valid; rarity/types/variants are simply absent.
				fallbacks++;
				console.warn(`  ↳ ${stub.id}: per-card fetch failed, using brief stub`);
				full = {
					id: stub.id,
					localId: stub.localId ?? "",
					name: stub.name ?? stub.id,
					category: "Pokemon",
					image: stub.image,
				} as TcgdexCard;
			}
			// Ensure set.id is always populated (the per-card endpoint may omit set or
			// return a nested object — we override with the authoritative setId from
			// the set-list phase).
			const card: TcgdexCard = { ...full, set: { id: stub.setId } };
			fetched++;
			if (fetched % 500 === 0 || fetched === briefCards.length) {
				console.log(`  …${fetched}/${briefCards.length} full records fetched`);
			}
			return card;
		}),
		CARD_FETCH_CONCURRENCY,
	);

	if (fallbacks)
		console.warn(
			`${fallbacks} card(s) used the brief-stub fallback (per-card endpoint 404).`,
		);
	// Phase-2 completeness: did we fetch (a card or its fallback stub for) ~every
	// stub collected in Phase 1? Compare against `briefCards`, NOT the declared
	// `expected` total — a region can legitimately collect far fewer stubs than
	// its declared count (partial JP sets), and that shortfall is already handled
	// by the Phase-1 gate above; here we only guard Phase 2 dropping stubs.
	if (cards.length < briefCards.length * 0.95)
		throw new Error(
			`crawl incomplete: ${cards.length} of ${briefCards.length} stubs (declared ~${expected})`,
		);
	console.log(
		`Crawl complete: ${cards.length} full card records (of ~${expected} declared).`,
	);
	return cards;
}

/** Parse `--base-lang <lang>` out of argv; everything else is positional. */
function parseArgs(argv: string[]): { positional: string[]; baseLang: string } {
	const positional: string[] = [];
	let baseLang = "en";
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === "--base-lang") {
			baseLang = argv[++i] ?? baseLang;
		} else {
			positional.push(argv[i]);
		}
	}
	return { positional, baseLang };
}

// Entrypoint: `bun run scripts/build-corpus.ts <outfile> [--base-lang ja]`
if (import.meta.main) {
	const { positional, baseLang } = parseArgs(process.argv.slice(2));
	const isAsia = baseLang !== "en";
	const outfile =
		positional[0] ?? (isAsia ? "corpus.asia.json.gz" : "corpus.json.gz");
	const detailFile = isAsia
		? "corpus-detail.asia.json.gz"
		: "corpus-detail.json.gz";
	const metaFile = isAsia
		? "corpus-detail.asia.meta.json"
		: "corpus-detail.meta.json";
	const gapFile = isAsia ? "corpus-gap.asia.json" : "corpus-gap.json";

	const startedAt = Date.now();
	const raw = await buildCorpus({ baseLang });

	// Price crosswalk: cardId → marketplace product ids, for the daily
	// build-prices join. Harvested from the OFFICIAL api.tcgdex.net (the mirror
	// the crawl uses serves no pricing), then guarded so a harvest failure throws
	// here — before any output file is written — and the whole run keep-last-goods
	// rather than shipping an empty crosswalk.
	const onRetry = (
		url: string,
		attempt: number,
		reason: string,
		waitMs: number,
	) => console.warn(`  ↳ ${url}: ${reason} — retry ${attempt} in ${waitMs}ms`);
	const priceIds = await harvestPriceIds(
		raw.map((c) => c.id),
		baseLang,
		{ onRetry },
	);
	// The tcgcsv tp-id harvest that fills this crosswalk's gaps runs AFTER the
	// corpus overlays below, against the FINAL `served` cards — the JA dead-set
	// cards it needs are added by the tcgcsv overlay (Phase 4), not present in the
	// raw TCGdex crawl. See the "Finalize price crosswalk" block near the writes.

	const trimmed = raw.map((c) => trimCard(c, baseLang));
	const detail = raw.map(detailCard).sort((a, b) => a.id.localeCompare(b.id));
	const version = detailVersion(detail);

	// Phase 3: overlay pokemontcg.io's richer English metadata. Only meaningful
	// for the English base — JP-lineage cards have no ptcg counterpart and no
	// crosswalk, so non-English base langs skip this upstream entirely.
	// SKIP_PTCG_OVERLAY also lets local/offline EN builds skip it. A failed
	// crawl yields an empty overlay → mergePtcgOverlay keeps the TCGdex values
	// (keep-last-good).
	let overlay = new Map();
	if (!isAsia && !process.env.SKIP_PTCG_OVERLAY) {
		try {
			console.log("Crawling pokemontcg.io overlay…");
			overlay = await fetchPtcgOverlay();
		} catch (err) {
			console.warn(`ptcg overlay crawl failed, keeping TCGdex values: ${err}`);
		}
	}
	const suffixById = new Map(
		raw.filter((c) => c.suffix).map((c) => [c.id, c.suffix as string]),
	);
	const { merged, hits } = mergePtcgOverlay(trimmed, overlay, suffixById);
	console.log(
		`ptcg overlay: ${hits}/${merged.length} cards enriched (${overlay.size} ptcg records)`,
	);

	// Audit: list any post-merge rarities the foil table still falls back on
	// holo-basic (the generic catch-all). Extend RARITY_FIX in normalize-rarity.ts
	// to cover new entries.
	const { getRarityClass } = await import("../src/components/holo-card/rarity");
	const unknown = new Set(
		merged
			.map((c) => c.rarity)
			.filter((r): r is string => !!r && getRarityClass(r) === "holo-basic"),
	);
	if (unknown.size)
		console.warn(
			`rarities still on holo-basic fallback: ${[...unknown].join(", ")}`,
		);

	// HEAD-probe the pokemontcg.io fallbacks; blank the dead ones and fold the
	// resulting "no-fallback" gaps into the gap log alongside the TCGdex misses.
	console.log("Probing pokemontcg.io fallback URLs…");
	const noFallback = await resolveFallbackImages(merged, undefined, baseLang);
	const gaps = collectGaps(raw);
	gaps.images.push(...noFallback);

	// Phase 4 (Asian region only): overlay tcgcsv card data for the ~103 dead sets
	// TCGdex serves with an empty cards[] (ADV/PCG/L/e-Card/XY-ja). English names,
	// real JP-print images. Appended AFTER the ptcg fallback probe so overlay
	// (tcgplayer-CDN) images aren't HEAD-probed against ptcg. A failed/empty crawl
	// keeps the TCGdex-only corpus (keep-last-good). SKIP_TCGCSV_OVERLAY for offline.
	let served = merged;
	if (isAsia && !process.env.SKIP_TCGCSV_OVERLAY) {
		try {
			const { fetchTcgcsvOverlay, mergeTcgcsvOverlay, fetchNameToDex } =
				await import("./tcgcsv-overlay");
			const [overlayCards, nameToDex] = await Promise.all([
				fetchTcgcsvOverlay(),
				fetchNameToDex(),
			]);
			const r = mergeTcgcsvOverlay(merged, overlayCards, {
				nameToDex,
				suppressPtcgFallback: true,
			});
			served = r.merged;
			console.log(
				`tcgcsv overlay: +${r.added} cards, ${r.filled}+${r.filledFuzzy} images filled, ${r.suppressed} Western fallbacks suppressed → ${served.length} total asian cards`,
			);
		} catch (err) {
			console.warn(
				`tcgcsv overlay failed, keeping TCGdex-only asian corpus: ${err}`,
			);
		}
	}

	// Finalize the price crosswalk: fill tcgplayer-id gaps from tcgcsv by exact
	// set+number (EN cat 3 / tcgcsv-en-crosswalk.json, JA cat 85 /
	// tcgcsv-crosswalk.json). Runs against `served` — the post-overlay corpus — so
	// the JA dead-set cards the overlay just ADDED are matchable (they carry
	// tcgcsv-derived numbers). TCGdex's own ids win; this only fills nulls + adds
	// tcgplayer-only entries. Keep-last-good: any failure keeps the TCGdex-only
	// crosswalk. Spec: docs/superpowers/specs/2026-07-10-pricing-crosswalk-coverage-design.md
	let mergedPriceIds = priceIds;
	try {
		const mapFile = isAsia
			? "scripts/data/tcgcsv-crosswalk.json"
			: "scripts/data/tcgcsv-en-crosswalk.json";
		const setToGroup = (await Bun.file(mapFile).exists())
			? (JSON.parse(await Bun.file(mapFile).text()) as Record<string, number>)
			: {};
		if (Object.keys(setToGroup).length) {
			const { tpIdByCardId, report } = await harvestTcgcsvTpIds(
				served.map((c) => ({ id: c.id, setId: c.setId, number: c.number })),
				setToGroup,
				isAsia ? 85 : 3,
				{ refresh: true },
			);
			const { map, filled } = mergeTpIds(priceIds, tpIdByCardId);
			mergedPriceIds = map;
			console.log(
				`tcgcsv tp harvest [${baseLang}]: ${report.cardsMatched} matched over ${report.setsHarvested} sets (+${filled} crosswalk gaps filled, ${report.ambiguousSkipped} ambiguous skipped, ${report.groupsUnfetched} groups unfetched)`,
			);
		}
	} catch (e) {
		console.warn(
			`tcgcsv tp harvest failed, keeping TCGdex-only crosswalk: ${e instanceof Error ? e.message : String(e)}`,
		);
	}

	assertCrosswalkOk(
		Object.keys(mergedPriceIds).length,
		served.length,
		baseLang,
	);
	const priceIdsFile = isAsia ? "price-ids.asia.json.gz" : "price-ids.json.gz";
	await Bun.write(
		priceIdsFile,
		gzipSync(Buffer.from(JSON.stringify(mergedPriceIds))),
	);
	console.log(
		`price crosswalk: ${Object.keys(mergedPriceIds).length}/${served.length} cards carry marketplace ids → ${priceIdsFile}`,
	);

	const gz = gzipSync(Buffer.from(JSON.stringify(served)));
	const detailGz = gzipSync(Buffer.from(JSON.stringify(detail)));
	const meta = {
		version,
		count: detail.length,
		builtAt: new Date().toISOString(),
	};

	await Bun.write(outfile, gz);
	await Bun.write(detailFile, detailGz);
	await Bun.write(metaFile, JSON.stringify(meta));
	await Bun.write(gapFile, JSON.stringify(gaps));

	const mb = (gz.length / 1024 / 1024).toFixed(2);
	const dmb = (detailGz.length / 1024 / 1024).toFixed(2);
	const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
	console.log(
		`Wrote ${served.length} cards → ${outfile} (${mb} MB) + detail (${dmb} MB, v${version.slice(0, 8)}) in ${secs}s`,
	);
	const tcgdexMisses = gaps.images.filter(
		(g) => g.reason === "tcgdex-missing",
	).length;
	const noFallbackCount = gaps.images.filter(
		(g) => g.reason === "no-fallback",
	).length;
	console.log(
		`Gap log: ${tcgdexMisses} without a TCGdex image, ${noFallbackCount} with no working fallback`,
	);
}
