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
 * Tiered name match. `q` and `name` must already be normalized; `tokens` are
 * the normalized per-word tokens of the name (for fuzzy on one word of a
 * multi-word name). Returns null when nothing matches within budget.
 */
export function matchName(
	q: string,
	name: string,
	tokens: string[],
): NameMatch | null {
	if (!q) return { tier: 2, distance: 0 }; // empty query matches all (substring)
	if (name === q) return { tier: 0, distance: 0 };
	if (name.startsWith(q)) return { tier: 1, distance: 0 };
	if (name.includes(q)) return { tier: 2, distance: 0 };
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
