// Build the TCGdex-ja -> tcgcsv(cat 85) crosswalk for the "dead" sets: sets whose
// TCGdex ja record declares a cardCount but returns an empty cards[] (the ~112-set
// upstream gap — ADV/PCG/L/e-Card/XY-ja eras). We overlay tcgcsv card data onto
// those. See scripts/tcgcsv-overlay.ts (the consumer) + memory reference-jp-data-sources.
//
// JOIN KEY = release date. tcgcsv `publishedOn` tracks the JP release date, which
// matches TCGdex `releaseDate` for JP sets. Card count is the tiebreaker when a
// date collides (same-day variants/decks). We DON'T fetch products here (that's the
// overlay's job + the expensive part) — count-tiebreak candidates are flagged for
// the human to resolve in the committed crosswalk.
//
// Emits scripts/data/tcgcsv-crosswalk.json (committed) + a match report to stderr.
// Run: bun run scripts/tcgcsv-crosswalk.ts

import { readFileSync, writeFileSync } from "node:fs";

const MIRROR = process.env.API_BASE ?? "http://localhost:3000";
const GROUPS_CACHE = "scripts/data/.cache/tcgcsv-groups-85.json";
const DEADSETS_CACHE = "scripts/data/.cache/tcgdex-ja-deadsets.json";
const OUT = "scripts/data/tcgcsv-crosswalk.json";
const OVERLAY_SETS_TS = "src/lib/corpus/overlay-sets.ts";

interface DeadSet {
	id: string;
	name: string;
	releaseDate: string; // YYYY-MM-DD
	total: number;
	serie: string;
}
interface TcgcsvGroup {
	groupId: number;
	name: string;
	abbreviation: string;
	publishedOn: string; // ISO
}

const CONCURRENCY = 10;

/** Fetch every ja set from the mirror, keep the ones with a declared count but 0 cards. */
async function fetchDeadSets(): Promise<DeadSet[]> {
	const listResp = await fetch(`${MIRROR}/v2/ja/sets`);
	if (!listResp.ok) throw new Error(`ja sets list -> ${listResp.status}`);
	const list = (await listResp.json()) as { id: string }[];
	const dead: DeadSet[] = [];
	for (let i = 0; i < list.length; i += CONCURRENCY) {
		const batch = list.slice(i, i + CONCURRENCY);
		const details = await Promise.all(
			batch.map(async (e) => {
				const r = await fetch(
					`${MIRROR}/v2/ja/sets/${encodeURIComponent(e.id)}`,
				);
				if (!r.ok) return null;
				return (await r.json()) as {
					id: string;
					name: string;
					releaseDate?: string;
					cardCount: { total: number };
					serie: { name: string };
					cards?: unknown[];
				};
			}),
		);
		for (const d of details) {
			if (!d) continue;
			const cards = Array.isArray(d.cards) ? d.cards.length : 0;
			if (cards === 0 && d.cardCount.total > 0) {
				dead.push({
					id: d.id,
					name: d.name,
					releaseDate: (d.releaseDate ?? "").slice(0, 10),
					total: d.cardCount.total,
					serie: d.serie?.name ?? "",
				});
			}
		}
	}
	return dead;
}

async function loadDeadSets(): Promise<DeadSet[]> {
	if (process.env.REFRESH_DEADSETS !== "1") {
		try {
			return JSON.parse(readFileSync(DEADSETS_CACHE, "utf8")) as DeadSet[];
		} catch {
			/* fall through to fetch */
		}
	}
	const dead = await fetchDeadSets();
	writeFileSync(DEADSETS_CACHE, JSON.stringify(dead, null, 2));
	console.error(
		`fetched ${dead.length} dead sets from mirror -> ${DEADSETS_CACHE}`,
	);
	return dead;
}

function main() {
	const groups = (
		JSON.parse(readFileSync(GROUPS_CACHE, "utf8")) as { results: TcgcsvGroup[] }
	).results;
	const push = (m: Map<string, TcgcsvGroup[]>, k: string, g: TcgcsvGroup) => {
		const arr = m.get(k);
		if (arr) arr.push(g);
		else m.set(k, [g]);
	};

	// index groups by release day (YYYY-MM-DD)
	const byDay = new Map<string, TcgcsvGroup[]>();
	for (const g of groups) push(byDay, g.publishedOn.slice(0, 10), g);

	// Primary key: the tcgcsv group name carries the exact TCGdex set code as a
	// prefix (e.g. "SM5S: Ultra Sun", "S1W: Sword"). A case-insensitive
	// "{setId}:" prefix match is a direct, unambiguous join for the modern era.
	// The colon anchors it so "SM1" never eats "SM10:".
	const byCode = new Map<string, TcgcsvGroup[]>();
	for (const g of groups) {
		const m = g.name.match(/^([^:]+):/);
		if (m) push(byCode, m[1].toLowerCase(), g);
	}

	return loadDeadSets().then((dead) => {
		const crosswalk: Record<string, number> = {};
		const collisions: {
			setId: string;
			name: string;
			date: string;
			total: number;
			candidates: { groupId: number; name: string }[];
		}[] = [];
		const unmatched: DeadSet[] = [];

		for (const s of dead) {
			// 1) exact code-prefix match (strongest).
			const codeMatch = byCode.get(s.id.toLowerCase());
			if (codeMatch?.length === 1) {
				crosswalk[s.id] = codeMatch[0].groupId;
				continue;
			}
			// 2) unique same-release-day group (covers the pre-code old era, where
			// group names are bare like "ADV Expansion Pack").
			const cands = byDay.get(s.releaseDate) ?? [];
			if (cands.length === 1) {
				crosswalk[s.id] = cands[0].groupId;
			} else if (cands.length === 0) {
				unmatched.push(s);
			} else {
				collisions.push({
					setId: s.id,
					name: s.name,
					date: s.releaseDate,
					total: s.total,
					candidates: cands.map((c) => ({ groupId: c.groupId, name: c.name })),
				});
			}
		}

		// Merge hand-resolved collisions kept in a sibling file (survives re-runs).
		// Strip "_"-prefixed keys (e.g. "_comment") — only setId->groupId pairs.
		let manual: Record<string, number> = {};
		try {
			const raw = JSON.parse(
				readFileSync("scripts/data/tcgcsv-crosswalk.manual.json", "utf8"),
			) as Record<string, number>;
			manual = Object.fromEntries(
				Object.entries(raw).filter(([k]) => !k.startsWith("_")),
			);
		} catch {
			/* none yet */
		}
		Object.assign(crosswalk, manual);

		const resolvedCollisions = collisions.filter((c) => !(c.setId in manual));

		writeFileSync(OUT, `${JSON.stringify(crosswalk, null, 2)}\n`);

		// Emit the runtime allowlist: fetchAllSets phantom-skips any TCGdex set with
		// 0 cards, which would drop every overlay set from the nav tree. This Set
		// (the crosswalk keys) tells it to keep them. Generated, not hand-edited.
		const ids = Object.keys(crosswalk).sort();
		writeFileSync(
			OVERLAY_SETS_TS,
			`// GENERATED by scripts/tcgcsv-crosswalk.ts — do not edit by hand.\n` +
				`// The TCGdex-ja sets whose per-card data comes from the tcgcsv overlay\n` +
				`// (baked into corpus.asia.json.gz). fetchAllSets keeps these despite\n` +
				`// TCGdex serving them with an empty cards[]. Regenerate: bun run scripts/tcgcsv-crosswalk.ts\n` +
				`export const OVERLAY_SET_IDS: ReadonlySet<string> = new Set([\n` +
				ids.map((id) => `\t${JSON.stringify(id)},`).join("\n") +
				`\n]);\n`,
		);

		console.error(
			`\n=== crosswalk: ${Object.keys(crosswalk).length} matched (${dead.length} dead sets) -> ${OUT}`,
		);
		console.error(
			`   overlay-sets allowlist (${ids.length}) -> ${OVERLAY_SETS_TS}`,
		);
		console.error(
			`unmatched (no tcgcsv group on release day): ${unmatched.length}`,
		);
		for (const u of unmatched)
			console.error(`  ${u.id}  ${u.releaseDate}  ${u.total}  ${u.name}`);
		console.error(
			`\ncollisions needing manual pick (add to tcgcsv-crosswalk.manual.json): ${resolvedCollisions.length}`,
		);
		for (const c of resolvedCollisions) {
			console.error(`  ${c.setId}  ${c.date}  n=${c.total}  ${c.name}`);
			for (const cand of c.candidates)
				console.error(`      -> ${cand.groupId}  ${cand.name}`);
		}
	});
}

main();
