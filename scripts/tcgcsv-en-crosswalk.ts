// Build the TCGdex-en → tcgcsv(cat 3) setId→groupId map used by the price-id
// harvest (scripts/tcgcsv-tp-harvest.ts) to fill tcgplayer-id gaps for EN cards
// TCGdex serves no `pricing` for (~18% of the catalog). The EN analog of the JP
// generator scripts/tcgcsv-crosswalk.ts.
//
// MATCH = normalized set name (the strong signal: a tcgcsv EN group name is the
// TCGdex set name after stripping an optional uppercase "CODE:" prefix, e.g.
// "SV08: Surging Sparks" → "Surging Sparks"). A ±45-day publishedOn/releaseDate
// window guards against a same-name reprint from a different era. Only a UNIQUE,
// date-corroborated name match is auto-included — the map is the harvest's primary
// correctness guardrail (a wrong same-era group could otherwise inject wrong prices
// via an overlapping number), so we prefer to leave a set UNMATCHED (it just keeps
// today's coverage) over guessing. The residue is printed for optional hand-fill in
// a sibling scripts/data/tcgcsv-en-crosswalk.manual.json.
//
// Emits scripts/data/tcgcsv-en-crosswalk.json (committed) + a report to stderr.
// Run: bun run scripts/tcgcsv-en-crosswalk.ts   (REFRESH_GROUPS=1 / REFRESH_SETS=1 to re-fetch)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const TCGDEX_BASE = process.env.TCGDEX_BASE ?? "https://api.tcgdex.net/v2/en";
const GROUPS_URL = "https://tcgcsv.com/tcgplayer/3/groups";
const GROUPS_CACHE = "scripts/data/.cache/tcgcsv-groups-3.json";
const SETS_CACHE = "scripts/data/.cache/tcgdex-en-sets.json";
const OUT = "scripts/data/tcgcsv-en-crosswalk.json";
const MANUAL = "scripts/data/tcgcsv-en-crosswalk.manual.json";
const UA =
	"cardstack-bot/1.0 (+https://github.com/TurtIeSocks/pokemon-tcg-viewer)";
const CONCURRENCY = 12;
const DATE_WINDOW_DAYS = 45;

interface EnSet {
	id: string;
	name: string;
	releaseDate: string | null; // YYYY-MM-DD or null (old sets)
}
interface TcgcsvGroup {
	groupId: number;
	name: string;
	publishedOn: string; // ISO
}

/** Collapse the two naming conventions to one key. tcgcsv prefixes a set code
 * ("SV08: Surging Sparks", "XY - Primal Clash") and appends "Base Set" to era base
 * sets ("SWSH01: Sword & Shield Base Set"); TCGdex does neither, and writes "&"
 * where tcgcsv writes "and" ("Diamond and Pearl"). Strip all of that. */
function normName(name: string): string {
	const n = name
		.replace(/^[A-Z0-9]{1,6}\s*(?::|-)\s*/, "")
		.toLowerCase()
		.replace(/pok[eé]mon/g, "")
		.replace(/\band\b/g, "") // "Diamond and Pearl" ↔ "Diamond & Pearl"
		.replace(/[^a-z0-9]/g, "");
	// Fold a trailing "baseset" (tcgcsv's era-base suffix; TCGdex's "Expedition
	// Base Set"), but never turn the original "Base Set" itself into the empty key.
	const stripped = n.replace(/baseset$/, "");
	return stripped || n;
}

function daysApart(a: string, b: string): number {
	return Math.abs((Date.parse(a) - Date.parse(b)) / (1000 * 60 * 60 * 24));
}

/** tcgcsv category-3 groups, from disk cache or a one-shot fetch. */
async function loadGroups(): Promise<TcgcsvGroup[]> {
	if (process.env.REFRESH_GROUPS !== "1" && existsSync(GROUPS_CACHE))
		return (
			JSON.parse(readFileSync(GROUPS_CACHE, "utf8")) as {
				results: TcgcsvGroup[];
			}
		).results;
	const r = await fetch(GROUPS_URL, { headers: { "User-Agent": UA } });
	if (!r.ok) throw new Error(`tcgcsv groups -> ${r.status}`);
	const body = await r.text();
	mkdirSync(GROUPS_CACHE.slice(0, GROUPS_CACHE.lastIndexOf("/")), {
		recursive: true,
	});
	writeFileSync(GROUPS_CACHE, body);
	return (JSON.parse(body) as { results: TcgcsvGroup[] }).results;
}

/** Every EN set with name + releaseDate. The /sets LIST omits releaseDate, so we
 * fetch each set's detail (concurrency-limited), from disk cache or the API. */
async function loadSets(): Promise<EnSet[]> {
	if (process.env.REFRESH_SETS !== "1" && existsSync(SETS_CACHE))
		return JSON.parse(readFileSync(SETS_CACHE, "utf8")) as EnSet[];
	const listResp = await fetch(`${TCGDEX_BASE}/sets`);
	if (!listResp.ok) throw new Error(`en sets list -> ${listResp.status}`);
	const list = (await listResp.json()) as { id: string }[];
	const out: EnSet[] = [];
	for (let i = 0; i < list.length; i += CONCURRENCY) {
		const batch = list.slice(i, i + CONCURRENCY);
		const detail = await Promise.all(
			batch.map(async (e): Promise<EnSet | null> => {
				const r = await fetch(
					`${TCGDEX_BASE}/sets/${encodeURIComponent(e.id)}`,
				);
				if (!r.ok) return null;
				const d = (await r.json()) as {
					id: string;
					name: string;
					releaseDate?: string;
				};
				return {
					id: d.id,
					name: d.name,
					releaseDate: d.releaseDate ? d.releaseDate.slice(0, 10) : null,
				};
			}),
		);
		for (const s of detail) if (s) out.push(s);
	}
	mkdirSync(SETS_CACHE.slice(0, SETS_CACHE.lastIndexOf("/")), {
		recursive: true,
	});
	writeFileSync(SETS_CACHE, JSON.stringify(out, null, 2));
	console.error(`fetched ${out.length} en sets -> ${SETS_CACHE}`);
	return out;
}

function loadManual(): Record<string, number> {
	try {
		const raw = JSON.parse(readFileSync(MANUAL, "utf8")) as Record<
			string,
			number
		>;
		return Object.fromEntries(
			Object.entries(raw).filter(([k]) => !k.startsWith("_")),
		);
	} catch {
		return {};
	}
}

async function main() {
	const [groups, sets] = await Promise.all([loadGroups(), loadSets()]);

	// Index groups by normalized name (a name can map to several groups).
	const byName = new Map<string, TcgcsvGroup[]>();
	for (const g of groups) {
		const k = normName(g.name);
		const arr = byName.get(k);
		if (arr) arr.push(g);
		else byName.set(k, [g]);
	}

	const crosswalk: Record<string, number> = {};
	const unmatched: EnSet[] = [];
	const ambiguous: { set: EnSet; cands: TcgcsvGroup[] }[] = [];

	for (const s of sets) {
		const cands = byName.get(normName(s.name)) ?? [];
		// Date-corroborate when both dates are known; old sets (null releaseDate)
		// fall back to a pure unique-name match.
		const dated = s.releaseDate
			? cands.filter(
					(g) =>
						daysApart(g.publishedOn, s.releaseDate as string) <=
						DATE_WINDOW_DAYS,
				)
			: cands;
		const pick = dated.length ? dated : cands;
		if (pick.length === 1) crosswalk[s.id] = pick[0].groupId;
		else if (pick.length === 0) unmatched.push(s);
		else ambiguous.push({ set: s, cands: pick });
	}

	// Hand-resolved picks win (survive re-runs).
	const manual = loadManual();
	Object.assign(crosswalk, manual);
	const openAmbiguous = ambiguous.filter((a) => !(a.set.id in manual));

	// Tab-indent to match Biome so a regen never produces formatting-only churn.
	writeFileSync(OUT, `${JSON.stringify(crosswalk, null, "\t")}\n`);

	console.error(
		`\n=== en crosswalk: ${Object.keys(crosswalk).length}/${sets.length} sets matched -> ${OUT}`,
	);
	console.error(`unmatched (no same-name tcgcsv group): ${unmatched.length}`);
	for (const u of unmatched)
		console.error(`  ${u.id}  ${u.releaseDate ?? "?"}  ${u.name}`);
	console.error(
		`\nambiguous (add a pick to ${MANUAL}): ${openAmbiguous.length}`,
	);
	for (const a of openAmbiguous) {
		console.error(`  ${a.set.id}  ${a.set.releaseDate ?? "?"}  ${a.set.name}`);
		for (const c of a.cands)
			console.error(
				`      -> ${c.groupId}  ${c.publishedOn.slice(0, 10)}  ${c.name}`,
			);
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
