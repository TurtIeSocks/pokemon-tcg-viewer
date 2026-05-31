/**
 * Compare two card `number` strings the way the pokemontcg.io API sorts them:
 * numerically by leading integer, then lexicographically as a tiebreaker.
 * Verified against the API: yields 1,2,…,10,11 (not the lexicographic
 * 1,10,11,…,2). Numeric-leading numbers sort before purely alphabetic ones.
 */
export function compareCardNumber(a: string, b: string): number {
	const na = Number.parseInt(a, 10);
	const nb = Number.parseInt(b, 10);
	const aNum = !Number.isNaN(na);
	const bNum = !Number.isNaN(nb);
	if (aNum && bNum) {
		if (na !== nb) return na - nb;
		return a.localeCompare(b);
	}
	if (aNum) return -1;
	if (bNum) return 1;
	return a.localeCompare(b);
}
