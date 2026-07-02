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

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const MIRROR = process.env.API_BASE ?? "http://localhost:3000";
const GROUPS_CACHE = "scripts/data/.cache/tcgcsv-groups-85.json";
const GROUPS_URL = "https://tcgcsv.com/tcgplayer/85/groups";
const UA =
	"cardstack-jp-overlay/1.0 (+https://github.com/rin/pokemon-tcg-viewer)";
const DEADSETS_CACHE = "scripts/data/.cache/tcgdex-ja-deadsets.json";
const OUT = "scripts/data/tcgcsv-crosswalk.json";
const OVERLAY_SETS_TS = "src/lib/corpus/overlay-sets.ts";

interface DeadSet {
	id: string;
	name: string;
	releaseDate: string; // YYYY-MM-DD
	total: number;
	serie: string;
	/** "empty" = no cards[] (overlay adds them); "imageGap" = cards exist but no
	 * TCGdex scans (overlay fills images). Only "empty" sets go in the phantom-skip
	 * allowlist — "imageGap" sets already survive fetchAllSets (they have cards). */
	kind: "empty" | "imageGap";
}
interface TcgcsvGroup {
	groupId: number;
	name: string;
	abbreviation: string;
	publishedOn: string; // ISO
}

const CONCURRENCY = 10;

/**
 * Fetch every ja set from the mirror and keep the ones the tcgcsv overlay should
 * cover, classified by WHY:
 *   - "empty":    cardCount > 0 but cards[] is empty -> overlay ADDS the cards.
 *   - "imageGap": cards[] is populated but TCGdex has no scans (first card has no
 *                 `image`) -> overlay FILLS the missing images (build-corpus
 *                 otherwise falls back to a pokemontcg.io English scan, or a blank).
 * Sets that already have TCGdex scans are skipped. The image probe is one extra
 * card fetch per non-empty set against the local mirror (cheap).
 */
async function fetchTargetSets(): Promise<DeadSet[]> {
	const listResp = await fetch(`${MIRROR}/v2/ja/sets`);
	if (!listResp.ok) throw new Error(`ja sets list -> ${listResp.status}`);
	const list = (await listResp.json()) as { id: string }[];
	const out: DeadSet[] = [];
	for (let i = 0; i < list.length; i += CONCURRENCY) {
		const batch = list.slice(i, i + CONCURRENCY);
		const classified = await Promise.all(
			batch.map(async (e): Promise<DeadSet | null> => {
				const r = await fetch(
					`${MIRROR}/v2/ja/sets/${encodeURIComponent(e.id)}`,
				);
				if (!r.ok) return null;
				const d = (await r.json()) as {
					id: string;
					name: string;
					releaseDate?: string;
					cardCount: { total: number };
					serie: { name: string };
					cards?: { id: string }[];
				};
				const cards = Array.isArray(d.cards) ? d.cards : [];
				const base = {
					id: d.id,
					name: d.name,
					releaseDate: (d.releaseDate ?? "").slice(0, 10),
					total: d.cardCount.total,
					serie: d.serie?.name ?? "",
				};
				if (cards.length === 0)
					return d.cardCount.total > 0 ? { ...base, kind: "empty" } : null;
				// Non-empty: probe the first card for a TCGdex scan.
				const cr = await fetch(
					`${MIRROR}/v2/ja/cards/${encodeURIComponent(cards[0].id)}`,
				);
				const cj = cr.ok ? ((await cr.json()) as { image?: string }) : {};
				return cj.image ? null : { ...base, kind: "imageGap" };
			}),
		);
		for (const t of classified) if (t) out.push(t);
	}
	return out;
}

async function loadDeadSets(): Promise<DeadSet[]> {
	if (process.env.REFRESH_DEADSETS !== "1") {
		try {
			return JSON.parse(readFileSync(DEADSETS_CACHE, "utf8")) as DeadSet[];
		} catch {
			/* fall through to fetch */
		}
	}
	const targets = await fetchTargetSets();
	writeFileSync(DEADSETS_CACHE, JSON.stringify(targets, null, 2));
	const empty = targets.filter((t) => t.kind === "empty").length;
	console.error(
		`fetched ${targets.length} target sets from mirror (${empty} empty + ${targets.length - empty} image-gap) -> ${DEADSETS_CACHE}`,
	);
	return targets;
}

/** tcgcsv category-85 groups, from the disk cache or a one-shot fetch (CI has no
 * pre-seeded cache). REFRESH_GROUPS=1 forces a re-fetch. */
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

async function main() {
	const groups = await loadGroups();
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

		// Tab-indent to match Biome so a regen never produces formatting-only churn.
		writeFileSync(OUT, `${JSON.stringify(crosswalk, null, "\t")}\n`);

		// Emit the runtime allowlist: fetchAllSets phantom-skips any TCGdex set with
		// 0 cards, which would drop the ADD (empty) overlay sets from the nav tree.
		// Only "empty" sets need it — "imageGap" sets have cards[] and already
		// survive fetchAllSets. Generated, not hand-edited.
		const emptyIds = new Set(
			dead.filter((d) => d.kind === "empty").map((d) => d.id),
		);
		const ids = Object.keys(crosswalk)
			.filter((id) => emptyIds.has(id))
			.sort();
		writeFileSync(
			OVERLAY_SETS_TS,
			`// GENERATED by scripts/tcgcsv-crosswalk.ts — do not edit by hand.\n` +
				`// The empty-cards[] TCGdex-ja sets whose per-card data comes from the tcgcsv\n` +
				`// overlay (baked into corpus.asia.json.gz). fetchAllSets keeps these despite\n` +
				`// TCGdex serving them with an empty cards[]. Regenerate: bun run scripts/tcgcsv-crosswalk.ts\n` +
				`export const OVERLAY_SET_IDS: ReadonlySet<string> = new Set([\n` +
				ids.map((id) => `\t${JSON.stringify(id)},`).join("\n") +
				`\n]);\n`,
		);

		const gapCount = Object.keys(crosswalk).length - ids.length;
		console.error(
			`\n=== crosswalk: ${Object.keys(crosswalk).length} matched (${dead.length} target sets) -> ${OUT}`,
		);
		console.error(
			`   ${ids.length} empty (add) + ${gapCount} image-gap (fill); phantom-skip allowlist (${ids.length}) -> ${OVERLAY_SETS_TS}`,
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

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
