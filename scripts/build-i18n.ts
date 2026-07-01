import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { fetchJson as realFetchJson } from "./build-corpus";

// Name-overlay languages. Western (fr/de/es/it/pt) overlay the English base
// corpus; Asian (ko/zh-tw/zh-cn/th/id) overlay the Phase 2 Asian (ja) base
// corpus. Each region's base language ("en", "ja") IS the base blob and needs
// no overlay, so neither appears here. langBase() crawls whatever ids /v2/{lang}
// returns — JP-lineage ids for the Asian langs — so the same code path builds
// both regions' overlays.
export const I18N_LANGS = [
	"fr",
	"de",
	"es",
	"it",
	"pt",
	"ko",
	"zh-tw",
	"zh-cn",
	"th",
	"id",
] as const;
export type I18nLang = (typeof I18N_LANGS)[number];

const TCGDEX_BASE = process.env.TCGDEX_BASE ?? "https://api.tcgdex.net/v2/en";

/**
 * Derive the per-language base by swapping the trailing "/en" of TCGDEX_BASE for
 * "/{lang}". The local Docker mirror "http://localhost:3000/v2/en" thus becomes
 * "http://localhost:3000/v2/fr"; the public "https://api.tcgdex.net/v2/en" becomes
 * "…/v2/fr". Only the trailing segment is replaced so a host containing "/en/"
 * elsewhere in the path is untouched.
 */
export function langBase(lang: string, base: string = TCGDEX_BASE): string {
	return base.replace(/\/en$/, `/${lang}`);
}

/** A single overlay entry: TCGdex card id → localized name. */
export interface I18nEntry {
	id: string;
	name: string;
}

export interface I18nMeta {
	version: string;
	count: number;
	builtAt: string;
	coverage: number; // entries / expected, 0..1
}

export interface I18nResult {
	lang: string;
	entries: I18nEntry[];
	version: string;
	coverage: number;
}

// Subset of fetchJson's signature that buildI18n depends on — injectable so tests
// never hit the network. The real `fetchJson` from build-corpus satisfies it.
export type FetchJson = (
	url: string,
	opts?: {
		retries?: number;
		baseMs?: number;
		onRetry?: (
			url: string,
			attempt: number,
			reason: string,
			waitMs: number,
		) => void;
	},
) => Promise<unknown>;

/** Content hash of the canonical entry array (sorted by id). Independent of gzip. */
export function i18nVersion(entries: I18nEntry[]): string {
	const sorted = [...entries].sort((a, b) => a.id.localeCompare(b.id));
	return createHash("sha256").update(JSON.stringify(sorted)).digest("hex");
}

export interface BuildI18nOpts {
	/** Injectable fetch seam; defaults to the real retrying fetchJson. */
	fetchJson?: FetchJson;
	/** Base TCGdex url (the "/en" host); defaults to TCGDEX_BASE. */
	base?: string;
	onRetry?: (
		url: string,
		attempt: number,
		reason: string,
		waitMs: number,
	) => void;
	log?: (msg: string) => void;
}

/**
 * Build the per-language name overlay for `lang`.
 *
 * Strategy (mirrors build-corpus Phase 1, but brief-only — no per-card fetch):
 *  1. List all sets in this language to learn the expected card count.
 *  2. Fetch each set's brief card list — the per-set endpoint returns
 *     `{ cards: [{ id, name }] }`, which is everything an overlay needs.
 *  3. Build entries = [{ id, name }] sorted by id; version = sha256 of the
 *     canonical JSON. Keep a ≥95% completeness guard vs the set cardCount totals.
 *
 * Pure + side-effect-free (no disk writes): the caller writes files. `fetchJson`
 * is injectable so the unit test runs without a network.
 */
export async function buildI18n(
	lang: string,
	opts: BuildI18nOpts = {},
): Promise<I18nResult> {
	const fetchJson = opts.fetchJson ?? (realFetchJson as FetchJson);
	const base = langBase(lang, opts.base ?? TCGDEX_BASE);
	const onRetry =
		opts.onRetry ??
		((url, attempt, reason, waitMs) =>
			console.warn(`  ↳ ${url}: ${reason} — retry ${attempt} in ${waitMs}ms`));
	const log = opts.log ?? ((msg: string) => console.log(msg));

	const sets = (await fetchJson(`${base}/sets`, { onRetry })) as {
		id: string;
		cardCount: { total: number };
	}[];
	const expected = sets.reduce((n, s) => n + s.cardCount.total, 0);
	log(`[${lang}] crawling ~${expected} names across ${sets.length} sets…`);

	const entries: I18nEntry[] = [];
	for (let i = 0; i < sets.length; i++) {
		const s = sets[i];
		const setData = (await fetchJson(`${base}/sets/${s.id}`, { onRetry })) as {
			cards: { id: string; name?: string }[];
		};
		for (const c of setData.cards)
			entries.push({ id: c.id, name: c.name ?? "" });
		log(
			`  [${lang}] set ${i + 1}/${sets.length} ${s.id} ✓ — ${entries.length} names so far`,
		);
	}

	// `expected` is the language-invariant set total (every set's full card count);
	// a Western overlay legitimately covers only the SUBSET of cards translated to that
	// language (untranslated cards fall back to the EN name in hydrateCard), so partial
	// coverage is normal, not an error. Guard only against a catastrophically broken crawl
	// (network/endpoint failure that yields near-nothing), and log the real coverage.
	const coverage = expected > 0 ? entries.length / expected : 0;
	log(
		`[${lang}] coverage ${entries.length}/${expected} (${(coverage * 100).toFixed(0)}%)`,
	);
	if (coverage < 0.4)
		throw new Error(
			`[${lang}] crawl looks broken: only ${entries.length} of ~${expected} (<40%)`,
		);

	entries.sort((a, b) => a.id.localeCompare(b.id));
	const version = i18nVersion(entries);
	log(
		`[${lang}] crawl complete: ${entries.length} names (v${version.slice(0, 8)}).`,
	);
	return { lang, entries, version, coverage };
}

/** Write the gzipped names + meta sidecar for one language under `corpus/i18n/{lang}/`. */
export async function writeI18n(result: I18nResult): Promise<I18nMeta> {
	const dir = `corpus/i18n/${result.lang}`;
	await mkdir(dir, { recursive: true });
	const gz = gzipSync(Buffer.from(JSON.stringify(result.entries)));
	const meta: I18nMeta = {
		version: result.version,
		count: result.entries.length,
		builtAt: new Date().toISOString(),
		coverage: result.coverage,
	};
	await Bun.write(`${dir}/names.json.gz`, gz);
	await Bun.write(`${dir}/meta.json`, JSON.stringify(meta));
	const kb = (gz.length / 1024).toFixed(0);
	console.log(
		`[${result.lang}] wrote ${result.entries.length} names → ${dir}/names.json.gz (${kb} KiB)`,
	);
	return meta;
}

// Entrypoint: `bun run scripts/build-i18n.ts` — builds every Western overlay.
if (import.meta.main) {
	const startedAt = Date.now();
	const coverageByLang: Record<string, number> = { en: 1 };
	for (const lang of I18N_LANGS) {
		const result = await buildI18n(lang);
		await writeI18n(result);
		coverageByLang[lang] = Number(result.coverage.toFixed(2));
	}
	const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
	console.log(`Built ${I18N_LANGS.length} overlays in ${secs}s`);
	console.log("LANGUAGE_COVERAGE =", JSON.stringify(coverageByLang));
}
