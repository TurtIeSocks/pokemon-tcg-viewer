import type { PokemonSet } from "../api";

/**
 * Id of the set with the latest releaseDate. pokemontcg.io dates are
 * zero-padded `YYYY/MM/DD`, so lexicographic compare == chronological.
 * Ties (same date) break to the lexicographically smaller id for
 * deterministic default selection. Returns null for an empty list.
 */
export function pickNewestSetId(sets: PokemonSet[]): string | null {
	let best: PokemonSet | null = null;
	for (const s of sets) {
		if (
			!best ||
			s.releaseDate > best.releaseDate ||
			(s.releaseDate === best.releaseDate && s.id < best.id)
		) {
			best = s;
		}
	}
	return best?.id ?? null;
}
