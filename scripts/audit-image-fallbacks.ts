#!/usr/bin/env bun
// Regenerate src/lib/corpus/ptcg-image-overrides.json.
//
// Some TCGdex cards lack an image; the corpus build bakes a pokemontcg.io fallback URL
// from the id crosswalk. For a slice of cards that constructed URL is still wrong (subset
// sets like Celebrations Classic Collection, cross-source number formats), so the image
// 404s and the card renders blank. This script finds those cards and, where pokemontcg.io
// genuinely has the image AND the crosswalk can't construct it, records a verified override.
//
// Matching is deliberately conservative — a WRONG image is worse than a blank cell:
//   - candidate ptcg sets = exact set-name match, or a subset that EXTENDS the name
//     ("Celebrations: Classic Collection" extends "Celebrations"). No loose reverse-prefix
//     (that once matched "XY trainer Kit" -> base "XY" and mapped Spoink to the wrong card).
//   - a match requires the pokemontcg.io card NAME to equal the TCGdex card name, by
//     (name+number) or name-uniqueness within the tight candidate pool. Never number-only.
//   - every surviving URL is CDN-validated (HTTP 200); pokemontcg.io serves a 404 with a
//     ~186 KB placeholder for missing images, so status is the only reliable signal.
//   - entries the id-crosswalk already constructs correctly (e.g. dashed trainer-kit ids)
//     are dropped — they don't need an override.
//
// Usage:  CORPUS_URL=http://localhost:8787/corpus bun scripts/audit-image-fallbacks.ts
// Needs network (api.tcgdex.net + api.pokemontcg.io) and a built corpus served at CORPUS_URL.

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { ptcgImageUrl, tcgdexCardToPtcg } from "../src/lib/corpus/id-crosswalk";

const CORPUS_URL = process.env.CORPUS_URL ?? "http://localhost:8787/corpus";
const OUT = join(
	dirname(fileURLToPath(import.meta.url)),
	"..",
	"src",
	"lib",
	"corpus",
	"ptcg-image-overrides.json",
);

interface Corpusish {
	id: string;
	name: string;
	setId?: string;
	number?: string;
	imageUrl?: string;
}
interface PtcgCard {
	id: string;
	name: string;
	number: string;
	set?: { id: string };
	images?: { large?: string };
}

const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const normNum = (s: unknown) =>
	String(s ?? "")
		.toLowerCase()
		.replace(/[^a-z0-9]/g, "");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson<T = unknown>(url: string, tries = 5): Promise<T> {
	for (let t = 0; t < tries; t++) {
		try {
			const r = await fetch(url, { headers: { Accept: "application/json" } });
			if (r.ok && (r.headers.get("content-type") || "").includes("json"))
				return (await r.json()) as T;
		} catch {}
		await sleep(1500 * (t + 1) + 400);
	}
	throw new Error(`getJson failed: ${url}`);
}
async function head(url: string): Promise<boolean> {
	try {
		return (await fetch(url, { method: "HEAD" })).ok;
	} catch {
		return false;
	}
}
async function poolRun<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
	let i = 0;
	await Promise.all(
		Array.from({ length: n }, async () => {
			while (i < items.length) await fn(items[i++]);
		}),
	);
}
function constructUrl(tcgdexId: string): string {
	const p = tcgdexCardToPtcg(tcgdexId);
	const d = p.indexOf("-");
	return ptcgImageUrl(p.slice(0, d), p.slice(d + 1)).large;
}

// 1) imageless cards whose baked pokemontcg.io fallback is dead
const cards: Corpusish[] = JSON.parse(
	gunzipSync(
		Buffer.from(await (await fetch(CORPUS_URL)).arrayBuffer()),
	).toString(),
);
const fallback = cards.filter((c) =>
	(c.imageUrl || "").includes("pokemontcg.io"),
);
const dead: Corpusish[] = [];
await poolRun(fallback, 40, async (c) => {
	if (!(await head(c.imageUrl ?? ""))) dead.push(c);
});
console.log(
	`corpus ${cards.length} cards, ${fallback.length} ptcg-fallback, ${dead.length} dead`,
);

// 2) set-name tables
const tdSets = await getJson<Array<{ id: string; name: string }>>(
	"https://api.tcgdex.net/v2/en/sets",
);
const tdName = Object.fromEntries(tdSets.map((s) => [s.id, s.name]));
const pSets =
	(
		await getJson<{ data: Array<{ id: string; name: string }> }>(
			"https://api.pokemontcg.io/v2/sets?pageSize=250",
		)
	).data || [];

const setIdOf = (c: Corpusish) =>
	c.setId || c.id.split("-").slice(0, -1).join("-") || c.id;
const numOf = (c: Corpusish) => c.number ?? c.id.split("-").slice(-1)[0];
const candidateSets = (tdSet: string) => {
	const n = norm(tdName[tdSet] || tdSet);
	if (!n) return [];
	return pSets.filter((s) => {
		const pn = norm(s.name);
		return pn === n || (n.length >= 5 && pn.startsWith(n));
	});
};

const pCards: Record<string, PtcgCard[]> = {};
const ptcgCards = async (id: string): Promise<PtcgCard[]> => {
	if (pCards[id]) return pCards[id];
	await sleep(800);
	const { data } = await getJson<{ data: PtcgCard[] }>(
		`https://api.pokemontcg.io/v2/cards?q=set.id:${id}&pageSize=250`,
	);
	pCards[id] = data || [];
	return pCards[id];
};

// 3) reconcile by NAME (+ number), CDN-validate, drop crosswalk-constructible
function pushTo<T>(rec: Record<string, T[]>, key: string, val: T) {
	if (!rec[key]) rec[key] = [];
	rec[key].push(val);
}
const bySet: Record<string, Corpusish[]> = {};
for (const c of dead) pushTo(bySet, setIdOf(c), c);
const candidates: Array<{ td: string; url: string }> = [];
let scanOnly = 0;
for (const [tdSet, cs] of Object.entries(bySet)) {
	const cand = candidateSets(tdSet);
	if (!cand.length) {
		scanOnly += cs.length;
		continue;
	}
	const all: PtcgCard[] = [];
	for (const ps of cand) {
		try {
			all.push(...(await ptcgCards(ps.id)));
		} catch (e) {
			console.log("  skip", ps.id, (e as Error).message);
		}
	}
	const byKey: Record<string, PtcgCard> = {};
	const byName: Record<string, PtcgCard[]> = {};
	for (const c of all) {
		byKey[`${norm(c.name)}|${normNum(c.number)}`] = c;
		pushTo(byName, norm(c.name), c);
	}
	for (const c of cs) {
		let hit = byKey[`${norm(c.name)}|${normNum(numOf(c))}`];
		if (!hit) {
			const named = byName[norm(c.name)] || [];
			if (named.length === 1) hit = named[0];
		}
		if (hit?.images?.large && norm(hit.name) === norm(c.name))
			candidates.push({ td: c.id, url: hit.images.large });
		else scanOnly++;
	}
}
const verified: Array<{ td: string; url: string }> = [];
await poolRun(candidates, 16, async (x) => {
	if (await head(x.url)) verified.push(x);
	else scanOnly++;
});
// drop entries the crosswalk already builds correctly — they don't need an override
const overrides = verified.filter((x) => constructUrl(x.td) !== x.url);
console.log(
	`verified ${verified.length}, crosswalk-constructible ${verified.length - overrides.length}, override ${overrides.length}, scan-only ${scanOnly}`,
);

// 4) write override map
const map: Record<string, string> = {};
for (const x of overrides.sort((a, b) => a.td.localeCompare(b.td)))
	map[x.td] = x.url;
writeFileSync(
	OUT,
	`${JSON.stringify(
		{
			_comment:
				"Build-time pokemontcg.io image overrides for the TCGdex-imageless cards whose CONSTRUCTED fallback URL (after the id-crosswalk) is still wrong: subset sets (Celebrations Classic Collection cel25->cel25c) and cross-source number formats (e-Card). Cards the crosswalk constructs correctly (e.g. dashed trainer-kit ids) are intentionally NOT here. Each value is a CDN-verified large URL whose pokemontcg.io card NAME matches the TCGdex card; small derived by replacing _hires.png with .png. Regenerate: scripts/audit-image-fallbacks.ts.",
			_count: overrides.length,
			...map,
		},
		null,
		"\t",
	)}\n`,
);
console.log(`wrote ${OUT}`);
