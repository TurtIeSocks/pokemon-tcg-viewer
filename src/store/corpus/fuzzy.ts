import type { NameExpr } from "./search-grammar";

/** Lowercase, strip diacritics, drop all non-alphanumerics (incl. spaces). */
export function normalize(s: string): string {
	return s
		.toLowerCase()
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "") // strip combining diacritical marks
		.replace(/[^a-z0-9]/g, "");
}

/** Damerau-Levenshtein (optimal string alignment) edit distance. */
export function editDistance(a: string, b: string): number {
	const m = a.length;
	const n = b.length;
	if (m === 0) return n;
	if (n === 0) return m;
	const d: number[][] = Array.from({ length: m + 1 }, () =>
		new Array<number>(n + 1).fill(0),
	);
	for (let i = 0; i <= m; i++) d[i][0] = i;
	for (let j = 0; j <= n; j++) d[0][j] = j;
	for (let i = 1; i <= m; i++) {
		for (let j = 1; j <= n; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			d[i][j] = Math.min(
				d[i - 1][j] + 1,
				d[i][j - 1] + 1,
				d[i - 1][j - 1] + cost,
			);
			if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
				d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
			}
		}
	}
	return d[m][n];
}

export type MatchTier = 0 | 1 | 2 | 3; // exact, prefix, substring, fuzzy
export interface NameMatch {
	tier: MatchTier;
	distance: number;
}

/**
 * Three-level search mode controlling which tiers are considered:
 * - "exact"    → tier 0 only (normalized whole-name equality)
 * - "contains" → tiers 0–2 (prefix + substring; no typo tolerance)
 * - "fuzzy"    → tiers 0–3 (contains + edit-distance near-misses); default
 */
export type SearchMode = "exact" | "contains" | "fuzzy";

/**
 * Tiered name match. `q` and `name` must already be normalized; `tokens` are
 * the normalized per-word tokens of the name (for fuzzy on one word of a
 * multi-word name). Returns null when nothing matches within budget.
 *
 * The `mode` parameter controls which tiers are considered:
 * - "exact"    → tier 0 only; rejects prefix/substring/fuzzy
 * - "contains" → tiers 0–2; rejects fuzzy edit-distance (former `exact:true` behavior)
 * - "fuzzy"    → tiers 0–3; full typo-tolerant search (default)
 */
export function matchName(
	q: string,
	name: string,
	tokens: string[],
	mode: SearchMode = "fuzzy",
): NameMatch | null {
	if (!q) return { tier: 2, distance: 0 }; // empty query matches all (substring)
	if (name === q) return { tier: 0, distance: 0 };
	if (mode === "exact") return null; // exact: whole-name match only
	if (name.startsWith(q)) return { tier: 1, distance: 0 };
	if (name.includes(q)) return { tier: 2, distance: 0 };
	if (mode === "contains") return null; // contains: no edit-distance fuzzy
	const maxDist = q.length <= 4 ? 1 : 2;
	let best = Number.POSITIVE_INFINITY;
	// Length-prune before the O(mn) distance: |len diff| can't exceed maxDist.
	if (Math.abs(name.length - q.length) <= maxDist) {
		best = editDistance(q, name);
	}
	for (const t of tokens) {
		if (Math.abs(t.length - q.length) > maxDist) continue;
		const dd = editDistance(q, t);
		if (dd < best) best = dd;
	}
	return best <= maxDist ? { tier: 3, distance: best } : null;
}

/** Result of evaluating a whole {@link NameExpr} against one card name. */
export interface ExprMatch {
	matched: boolean;
	tier: MatchTier;
	distance: number;
}

/** Neutral "matches all" result — mirrors matchName's empty-query return. */
const MATCH_ALL: ExprMatch = { matched: true, tier: 2, distance: 0 };

/**
 * Evaluate a parsed {@link NameExpr} against one already-normalized card name.
 * Runs the existing tiered {@link matchName} on each positive/negated leaf and
 * combines per the grammar rules:
 *  - a term with a leading `!` (negated) must NOT match;
 *  - an arm (AND) matches when every positive term matches and every negated
 *    term does not — its tier is the WORST (highest) positive term's tier;
 *  - the expression (OR) matches when any arm matches — its tier is the BEST
 *    (lowest) matching arm's tier.
 *
 * An empty expression (no arms) applies no name filter and matches everything.
 */
export function matchNameExpr(
	expr: NameExpr,
	nameNorm: string,
	nameTokens: string[],
	mode: SearchMode = "fuzzy",
): ExprMatch {
	if (expr.arms.length === 0) return MATCH_ALL;

	let best: ExprMatch | null = null;
	for (const arm of expr.arms) {
		let armTier = 0;
		let armDistance = 0;
		let hadPositive = false;
		let armOk = true;
		for (const term of arm.terms) {
			const q = normalize(term.text);
			if (!q) continue; // empty leaf → no constraint (defensive)
			const m = matchName(q, nameNorm, nameTokens, mode);
			if (term.negated) {
				if (m) {
					armOk = false;
					break;
				}
				continue;
			}
			if (!m) {
				armOk = false;
				break;
			}
			hadPositive = true;
			if (m.tier > armTier) armTier = m.tier;
			if (m.distance > armDistance) armDistance = m.distance;
		}
		if (!armOk) continue;
		// A pure-negation arm (all terms excluded, none positive) matched every
		// non-excluded card — report the neutral tier 2, like an empty query.
		const tier: MatchTier = hadPositive ? (armTier as MatchTier) : 2;
		const distance = hadPositive ? armDistance : 0;
		if (
			best === null ||
			tier < best.tier ||
			(tier === best.tier && distance < best.distance)
		) {
			best = { matched: true, tier, distance };
		}
	}

	return best ?? { matched: false, tier: 3, distance: 0 };
}
